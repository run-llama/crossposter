/* Adapted from https://github.com/melvin2016/linkedin-post-share */

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
            console.log("Profile data", profileData.data)
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

    /*
    // TODO: need community management API to get this and we're never going to get that
    async getPersonData(vanityName: string) {
        console.log("About to get person data from vanity name ", vanityName)
        const response = await fetch(
            `https://api.linkedin.com/v2/people?q=vanityName&vanityName=${vanityName}`,
            {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`
                }
            }
        );
        const body = await response.text();
        console.log("Person data from vanity name", body);
        const result = await response.json();
        return result.elements[0]
    }
    */

    async getOrganizationData(vanityName: string) {
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
        return result.elements[0]
    }

    async getOrganizationURNFromData(organizationData: any) {
        const urn = `urn:li:organization:${organizationData.id}`
        console.log("Organization URN", urn)
        return urn;
    }

    async getOrganizationURN(vanityName: string) {
        const result = await this.getOrganizationData(vanityName);
        return await this.getOrganizationURNFromData(result)
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

        post = this.removeLinkedinReservedCharacters(post);

        // Extract company names from LinkedIn URLs
        const companyUrlRegex = /https:\/\/www\.linkedin\.com\/company\/([^\/\s']+)/g;
        const matches = [...post.matchAll(companyUrlRegex)];
        
        // Fetch organization data for each company
        let allCompanyData = []
        for (const match of matches) {
            let companySlug = match[1]
            let companyData = await this.getOrganizationData(companySlug)
            allCompanyData.push(companyData)
            const companyUrl = `https://www.linkedin.com/company/${companySlug}`;
            const companyName = companyData.localizedName
            const companyUrn = await this.getOrganizationURNFromData(companyData)
            const companyUrlRegex = new RegExp(companyUrl, 'g');
            // replace the company URL with the company name
            post = post.replace(companyUrlRegex, `@[${companyName}](${companyUrn})`);
        }

        /*
        // Getting people from vanity names is not supported yet
        // extract person names from linkedin URLs
        const personUrlRegex = /https:\/\/www\.linkedin\.com\/in\/([^\/\s']+)/g;
        const personMatches = [...post.matchAll(personUrlRegex)];

        // Fetch person data for each person
        let allPersonData = []
        for (const match of personMatches) {
            let personSlug = match[1]
            let personData = await this.getPersonData(personSlug)
            allPersonData.push(personData)
        }
        */

        console.log("Post with company names", post)

        let authorURN;
        if (!organizationURN) {
            authorURN = await this.getPersonURN();
            if (!authorURN) {
                console.error('Cannot get person URN');
                return false;
            }
        } else {
            authorURN = organizationURN;
        }

        const imageUploadRequest = await this.createImageUploadRequest(authorURN);
        if (!imageUploadRequest) {
            console.error('Cannot create image upload request');
            return false;
        }

        const uploadedImageData = await this.uploadImage(image, imageUploadRequest.value.uploadUrl);
        if (!uploadedImageData) {
            console.error('Cannot upload the image');
            return false;
        }

        const imageId = imageUploadRequest.value.image;

        try {
            const postData = {
                author: authorURN,
                commentary: post,
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
                    }
                },
                lifecycleState: 'PUBLISHED',
                isReshareDisabledByAuthor: false,
            };

            console.log("LinkedIn Post data", postData)

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
            return {
                id: data.headers['x-restli-id']
            }
        } catch (e) {
            if (e instanceof AxiosError) {
                console.error('Cannot create post. Error: ', e.response?.data);
                return;
            }
            console.error('Something went wrong. Error: ', e);
        }
    }
}
