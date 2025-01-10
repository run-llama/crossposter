import axios, { AxiosError } from 'axios';

// Types
import type { Profile, ImageUpload } from './linkedinPostShare.d';

export default class LinkedinPostShare {
    private LINKEDIN_BASE_URL = 'https://api.linkedin.com';
    private LINKEDIN_VERSION = '202411';
    constructor(private accessToken: string) { }

    private async getProfileData(): Promise<Profile | null> {
        console.log("About to get profile data")
        try {
            const profileData = await axios<Profile>(`${this.LINKEDIN_BASE_URL}/v2/userinfo`, {
                method: 'GET',
                headers: {
                    'LinkedIn-Version': this.LINKEDIN_VERSION,
                    Authorization: `Bearer ${this.accessToken}`,
                    'X-Restli-Protocol-Version': '2.0.0',
                },
            });
            console.log("Profile data", profileData)
            return profileData.data;
        } catch (e) {
            if (e instanceof AxiosError) {
                console.error('Cannot get profile data. Error: ', e.response?.data);
                return null;
            }
            console.error('Something went wrong. Error: ', e);
            return null;
        }
    }

    async getOrganizationURN(vanityName: string) {
        const response = await fetch(
          `https://api.linkedin.com/v2/organizations?q=vanityName&vanityName=${vanityName}`,
          {
            headers: {
              'Authorization': `Bearer ${this.accessToken}`
            }
          }
        );
        const result = await response.json();
        console.log(`Organization result for ${vanityName}`, result)
        const urn = `urn:li:organization:${result.elements[0].id}`
        console.log("Organization URN", urn)
        return urn;
      }    

    async getPersonURN(): Promise<string | null> {
        const profile = await this.getProfileData();
        if (!profile || !profile.sub) {
            return null;
        }
        const urnTemplate = `urn:li:person:${profile.sub}`;
        return urnTemplate;
    }

    private async createImageUploadRequest(personUrn: string): Promise<ImageUpload | undefined> {
        try {
            const imageUploadRequest = await axios<ImageUpload>(
                `${this.LINKEDIN_BASE_URL}/rest/images?action=initializeUpload`,
                {
                    method: 'POST',
                    headers: {
                        'LinkedIn-Version': this.LINKEDIN_VERSION,
                        Authorization: `Bearer ${this.accessToken}`,
                        'X-Restli-Protocol-Version': '2.0.0',
                    },
                    data: {
                        initializeUploadRequest: {
                            owner: personUrn,
                        },
                    },
                },
            );
            return imageUploadRequest.data;
        } catch (e) {
            if (e instanceof AxiosError) {
                console.error('Cannot create image upload request. Error: ', e.response?.data);
                return;
            }
            console.error('Something went wrong. Error: ', e);
        }
    }

    private async uploadImage(image: Buffer, uploadUrl: string): Promise<boolean | undefined> {
        try {
            const imageUploadRequest = await axios(uploadUrl, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/octet-stream',
                    Authorization: `Bearer ${this.accessToken}`,
                },
                data: image,
            });
            if (imageUploadRequest.status !== 201) {
                console.error('Image not created. Status code: ', imageUploadRequest.status);
                return false;
            }

            return true;
        } catch (e) {
            if (e instanceof AxiosError) {
                console.error('Cannot upload image. Error: ', e.cause);
                return;
            }
            console.error('Something went wrong. Error: ', e);
        }
    }

    private removeLinkedinReservedCharacters(text: string): string {
        return text.replace(/[|{}@\[\]()<>\\*_~+]/gm, '');
    }

    async createPostWithImageForOrganization(post: string, image: Buffer, imageAlt?: string, organizationName: string): Promise<boolean | undefined> {
        const organizationUrn = await this.getOrganizationURN(organizationName);
        if (!organizationUrn) {
            console.error('Cannot get organization URN');
            return;
        }
        return this.createPostWithImage(post, image, imageAlt, organizationUrn);
    }

    async createPostWithImage(post: string, image: Buffer, imageAlt?: string, organizationURN: string | null = null): Promise<boolean | undefined> {
        let authorURN;
        if (!organizationURN) {
            authorURN = await this.getPersonURN();
            if (!authorURN) {
                console.error('Cannot get person URN');
            }
            return;
        } else {
            authorURN = organizationURN;
        }

        const imageUploadRequest = await this.createImageUploadRequest(authorURN);
        if (!imageUploadRequest) {
            console.error('Cannot create image upload request');
            return;
        }

        const uploadedImageData = await this.uploadImage(image, imageUploadRequest.value.uploadUrl);
        if (!uploadedImageData) {
            console.error('Cannot upload the image');
            return;
        }

        const imageId = imageUploadRequest.value.image;
        const reservedCharactersRemovedPost = this.removeLinkedinReservedCharacters(post);

        try {
            const postData = {
                author: authorURN,
                commentary: reservedCharactersRemovedPost,
                visibility: 'PUBLIC',
                distribution: {
                    feedDistribution: 'MAIN_FEED',
                    targetEntities: [],
                    thirdPartyDistributionChannels: [],
                },
                content: {
                    media: {
                        title: imageAlt ?? 'Cover image of the post',
                        id: imageId,
                    },
                },
                lifecycleState: 'PUBLISHED',
                isReshareDisabledByAuthor: false,
            };

            const data = await axios(`${this.LINKEDIN_BASE_URL}/rest/posts`, {
                method: 'POST',
                headers: {
                    'LinkedIn-Version': this.LINKEDIN_VERSION,
                    Authorization: `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json',
                    'X-Restli-Protocol-Version': '2.0.0',
                },
                data: postData,
            });

            if (data.status !== 201) {
                console.error('Image not created. Status code: ', data.status);
                return false;
            }
            return true;
        } catch (e) {
            if (e instanceof AxiosError) {
                console.error('Cannot create post. Error: ', e.response?.data);
                return;
            }
            console.error('Something went wrong. Error: ', e);
        }
    }
}
