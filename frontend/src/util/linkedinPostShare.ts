/* Adapted from https://github.com/melvin2016/linkedin-post-share */

import axios, { AxiosError } from 'axios';

// Types
import type { Profile, ImageUpload, VideoUpload } from './linkedinPostShare.d';

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
        const url = `https://api.linkedin.com/v2/organizations?q=vanityName&vanityName=${vanityName}`
        console.log("Getting organization data with call:", url)


        const response = await fetch(
            url,
            {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'User-Agent': 'curl/8.7.1',
                    'Accept': '*/*',
                    'Connection': 'keep-alive',
                    'Accept-Encoding': 'gzip, deflate, br'
                }
            }
        );
        const result = await response.json();
        console.log(`Organization result for ${vanityName}`, result)
        if (!result.elements[0]) return null


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

    /**
     * Detects the media type based on the buffer signature (magic number) or optional filename/extension.
     * Returns 'image' or 'video'.
     */
    private detectMediaType(media: Buffer, filename?: string): 'image' | 'video' {
        // Check by file extension if provided
        if (filename) {
            const ext = filename.split('.').pop()?.toLowerCase();
            if (['mp4', 'mov', 'avi', 'webm', 'mkv'].includes(ext || '')) {
                return 'video';
            }
            if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(ext || '')) {
                return 'image';
            }
        }
        // Fallback: check magic numbers for MP4 (video) and common images
        if (media.slice(4, 8).toString() === 'ftyp') {
            return 'video';
        }
        // JPEG: starts with 0xFFD8, PNG: 0x89504E47, GIF: 0x47494638
        const sig = media.slice(0, 4).toString('hex');
        if (sig === 'ffd8ffe0' || sig === 'ffd8ffe1' || sig === 'ffd8ffe2' || sig === '89504e47' || sig === '47494638') {
            return 'image';
        }
        // Default to image
        return 'image';
    }

    /**
     * Generalized media upload request for both images and videos.
     * Returns { type: 'image' | 'video', data: ImageUpload | VideoUpload }
     */
    private async createMediaUploadRequest(ownerUrn: string, media: Buffer, filename?: string): Promise<{ type: 'image', data: ImageUpload } | { type: 'video', data: VideoUpload } | undefined> {
        const mediaType = this.detectMediaType(media, filename);
        if (mediaType === 'image') {
            const imageUploadRequest = await this.createImageUploadRequest(ownerUrn);
            if (!imageUploadRequest) return;
            return { type: 'image', data: imageUploadRequest };
        } else {
            // Video upload request
            try {
                const videoUploadRequest = await axios<VideoUpload>(
                    `${this.LINKEDIN_BASE_URL}/rest/videos?action=initializeUpload`,
                    {
                        method: 'POST',
                        headers: {
                            'LinkedIn-Version': this.LINKEDIN_VERSION,
                            Authorization: `Bearer ${this.accessToken}`,
                            'X-Restli-Protocol-Version': '2.0.0',
                        },
                        data: {
                            initializeUploadRequest: {
                                owner: ownerUrn,
                                fileSizeBytes: media.length,
                                uploadCaptions: false,
                                uploadThumbnail: false,
                            },
                        },
                    },
                );
                console.log('Video upload initialize response:', videoUploadRequest.data);
                return { type: 'video', data: videoUploadRequest.data };
            } catch (e) {
                if (e instanceof AxiosError) {
                    console.error('Cannot create video upload request. Error: ', e.response?.data);
                    console.log(e.response?.data?.errorDetails?.inputErrors)
                    return;
                }
                console.error('Something went wrong. Error: ', e);
            }
        }
    }

    /**
     * Uploads a video to LinkedIn using the provided upload URL, then finalizes the upload.
     */
    private async uploadVideo(video: Buffer, videoId: string, uploadUrl: string): Promise<boolean | undefined> {
        console.log("Uploading video to", uploadUrl)
        let etag: string | undefined;
        try {
            const videoUploadRequest = await axios(uploadUrl, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/octet-stream',
                    Authorization: `Bearer ${this.accessToken}`,
                },
                data: video,
            });
            // LinkedIn may return 201 or 200 for video upload
            if (![200, 201].includes(videoUploadRequest.status)) {
                console.error('Video not uploaded. Status code: ', videoUploadRequest.status);
                return false;
            }
            // ETag is required for finalizeUpload
            etag = videoUploadRequest.headers['etag'] || videoUploadRequest.headers['ETag'];
            if (!etag) {
                console.error('No ETag found in video upload response headers.');
                return false;
            }
        } catch (e) {
            if (e instanceof AxiosError) {
                console.error('Cannot upload video. Error: ', e.cause);
                return;
            }
            console.error('Something went wrong. Error: ', e);
            return;
        }
        // Finalize upload
        try {
            const finalizeRes = await axios(`${this.LINKEDIN_BASE_URL}/rest/videos?action=finalizeUpload`, {
                method: 'POST',
                headers: {
                    'LinkedIn-Version': this.LINKEDIN_VERSION,
                    Authorization: `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json',
                    'X-Restli-Protocol-Version': '2.0.0',
                },
                data: {
                    finalizeUploadRequest: {
                        video: videoId,
                        uploadToken: '',
                        uploadedPartIds: [etag],
                    },
                },
            });
            if (![200, 201, 204].includes(finalizeRes.status)) {
                console.error('Video finalizeUpload failed. Status code: ', finalizeRes.status);
                return false;
            }
            return true;
        } catch (e) {
            if (e instanceof AxiosError) {
                console.error('Cannot finalize video upload. Error: ', e.response?.data);
                return;
            }
            console.error('Something went wrong during finalizeUpload. Error: ', e);
            return;
        }
    }

    async createPostWithMediaForOrganization(
        post: string,
        media: Buffer,
        organizationName: string,
        mediaAlt?: string,
        filename?: string
    ): Promise<{ id: string } | undefined> {
        const organizationUrn = await this.getOrganizationURN(organizationName);
        if (!organizationUrn) {
            console.error('Cannot get organization URN');
            return;
        }
        return this.createPostWithMedia(post, media, mediaAlt, organizationUrn, filename);
    }

    async createPostWithMedia(
        post: string,
        media: Buffer,
        mediaAlt?: string,
        organizationURN: string | null = null,
        filename?: string
    ): Promise<{ id: string } | undefined> {
        post = this.removeLinkedinReservedCharacters(post);

        // Extract company names from LinkedIn URLs
        // ignore any trailing punctuation after the company name
        //const companyUrlRegex = /https:\/\/www\.linkedin\.com\/company\/([^\/\s']+)[^\/\s']*$/g;
        const companyUrlRegex = /https:\/\/www\.linkedin\.com\/company\/([a-zA-Z0-9-]+)(?![a-zA-Z0-9-])/g
        const matches = [...post.matchAll(companyUrlRegex)];
        
        // Fetch organization data for each company
        let allCompanyData = []
        for (const match of matches) {
            let companySlug = match[1]
            let companyData = await this.getOrganizationData(companySlug)
            if (!companyData) {
                console.error('Cannot get company data for ', companySlug)
                throw new Error(`Cannot get company data for ${companySlug}`)
            }
            allCompanyData.push(companyData)
            const companyUrl = `https://www.linkedin.com/company/${companySlug}`;
            const companyName = companyData.localizedName

            const companyUrn = await this.getOrganizationURNFromData(companyData)
            const companyUrlRegex = new RegExp(companyUrl, 'g');
            // replace the company URL with the company name
            post = post.replace(companyUrlRegex, `@[${companyName}](${companyUrn}) `);
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
                return;
            }
        } else {
            authorURN = organizationURN;
        }

        // Use the new generalized media upload request
        const mediaUploadRequest = await this.createMediaUploadRequest(authorURN, media, filename);
        if (!mediaUploadRequest) {
            console.error('Cannot create media upload request');
            return;
        }
        let mediaId;
        let uploadSuccess = false;
        if (mediaUploadRequest.type === 'image') {
            uploadSuccess = await this.uploadImage(media, mediaUploadRequest.data.value.uploadUrl) ?? false;
            mediaId = mediaUploadRequest.data.value.image;
        } else if (mediaUploadRequest.type === 'video') {
            console.log("Media upload request", mediaUploadRequest.data.value)
            uploadSuccess = await this.uploadVideo(media, mediaUploadRequest.data.value.video, mediaUploadRequest.data.value.uploadInstructions[0].uploadUrl) ?? false;
            mediaId = mediaUploadRequest.data.value.video;
        }
        if (!uploadSuccess) {
            console.error('Cannot upload the media');
            return;
        }

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
                        title: mediaAlt ?? (mediaUploadRequest.type === 'image' ? 'Cover image of the post' : 'Video of the post'),
                        id: mediaId,
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
                console.error('Post not created. Status code: ', data.status);
                return;
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
// Method to create a post for an organization without an image
async createPostForOrganization(
    post: string,
    organizationName: string
  ): Promise<{ id: string } | undefined> {
    const organizationUrn = await this.getOrganizationURN(organizationName);
    if (!organizationUrn) {
      console.error('Cannot get organization URN');
      return;
    }
    return this.createPost(post, organizationUrn);
  }
  
// Method to create a post without an image
async createPost(
    post: string,
    organizationURN: string | null = null
  ): Promise<{ id: string } | undefined> {
    post = this.removeLinkedinReservedCharacters(post);
  
    let authorURN;
    if (!organizationURN) {
      authorURN = await this.getPersonURN();
      if (!authorURN) {
        console.error('Cannot get person URN');
        return;
      }
    } else {
      authorURN = organizationURN;
    }
  
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
        lifecycleState: 'PUBLISHED',
        isReshareDisabledByAuthor: false,
      };
  
      console.log("LinkedIn Post data", postData);
  
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
        console.error('Post not created. Status code: ', data.status);
        return;
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
