import { AtpAgent, RichText, AppBskyEmbedVideo, AppBskyVideoDefs, BlobRef } from '@atproto/api'
import { AppBskyRichtextFacet } from '@atproto/api'

export default class BlueSkyPoster {

    private agent: AtpAgent
    private credentials: { identifier: string, password: string }

    constructor(credentials: { identifier: string, password: string }) { 
        this.agent = new AtpAgent({ service: 'https://bsky.social' })
        this.credentials = credentials
    }

    async login() {
        console.log("Logging in to Bluesky", this.credentials)
        if (!this.credentials.identifier.includes('.')) {
            this.credentials.identifier = `${this.credentials.identifier}.bsky.social`
        }
        await this.agent.login({ identifier: this.credentials.identifier, password: this.credentials.password })    
    }

    async uploadMedia(media: Buffer, mediaType: 'image' | 'video') {
        return await this.agent.uploadBlob(media)
    }

    /**
     * Detects the media type based on the buffer signature (magic number).
     * Returns 'image' or 'video'.
     */
    private detectMediaType(media: Buffer, filename?: string | null): 'image' | 'video' {
        // Check by file extension if provided
        if (filename) {
            const ext = filename.split('.').pop()?.toLowerCase();
            if ([
                'mp4', 'mov', 'avi', 'webm', 'mkv'
            ].includes(ext || '')) {
                return 'video';
            }
            if ([
                'jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'
            ].includes(ext || '')) {
                return 'image';
            }
        }
        // Fallback: check magic numbers for MP4 (video) and common images
        if (media.slice(4, 8).toString() === 'ftyp') {
            return 'video';
        }
        // JPEG: starts with 0xFFD8, PNG: 0x89504E47, GIF: 0x47494638
        const sig = media.slice(0, 4).toString('hex');
        if (
            sig === 'ffd8ffe0' || sig === 'ffd8ffe1' || sig === 'ffd8ffe2' ||
            sig === '89504e47' || sig === '47494638'
        ) {
            return 'image';
        }
        // Default to image
        return 'image';
    }

    /**
     * Uploads a video to Bluesky using the new job-based endpoint.
     * Returns the blob ref for use in the post embed.
     */
    private async uploadVideoWithJob(media: Buffer, mediaName: string | null): Promise<BlobRef> {
        if (!this.agent.session) {
            throw new Error('Not logged in');
        }
        // 1. Get service auth token
        const { data: serviceAuth } = await this.agent.com.atproto.server.getServiceAuth({
            aud: `did:web:${this.agent.dispatchUrl.host}`,
            lxm: 'com.atproto.repo.uploadBlob',
            exp: Math.floor(Date.now() / 1000) + 60 * 30, // 30 minutes
        });
        const token = serviceAuth.token;
        // 2. Prepare upload URL
        const uploadUrl = new URL('https://video.bsky.app/xrpc/app.bsky.video.uploadVideo');
        uploadUrl.searchParams.append('did', this.agent.session.did);
        uploadUrl.searchParams.append('name', mediaName || 'video.mp4');
        // 3. Upload video
        const uploadResponse = await fetch(uploadUrl.toString(), {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'video/mp4',
                'Content-Length': media.length.toString(),
            },
            body: media,
        });
        const jobStatus = (await uploadResponse.json()) as AppBskyVideoDefs.JobStatus;
        let blob: BlobRef | undefined = jobStatus.blob;
        const videoAgent = new AtpAgent({ service: 'https://video.bsky.app' });
        // 4. Poll for job completion
        while (!blob) {
            const { data: status } = await videoAgent.app.bsky.video.getJobStatus({ jobId: jobStatus.jobId });
            if (status.jobStatus.blob) {
                blob = status.jobStatus.blob;
            } else {
                await new Promise((resolve) => setTimeout(resolve, 1000));
            }
        }
        return blob;
    }

    async post(text: string, media: Buffer | null, mediaName: string | null) {

        // get all the mentions
        const handleRegex = /@\[([^\]]+)\]\(([^)]+)\)/g;
        const matches = [...text.matchAll(handleRegex)];

        // extract just one entity per handle
        const entities: Record<string, { url: string }> = {};
        for (const match of matches) {
            let [fullMatch, handle, url] = match;
            entities[handle] = {
                url: url,
            }
        }

        // Replace the full @[handle](url) with just @handle in the text
        let processedText = text;
        for (const match of matches) {
            const [fullMatch, handle, url] = match;
            processedText = processedText.replace(fullMatch, `@${handle}`);
        }

        console.log("Processed text", processedText)

        // RichText takes care of the mentions
        const rt = new RichText({
            text: processedText,
          })
        await rt.detectFacets(this.agent)        

        const payload: {
            text: string;
            createdAt: string;
            facets: AppBskyRichtextFacet.Main[] | undefined;
            embed?: {
                $type: string;
                images: { alt: string; image: any }[];
            };
        } = {
            text: processedText.slice(0, 300),
            createdAt: new Date().toISOString(),
            facets: rt.facets, // this is how mentions get added
        }

        if (media) {
            const mediaType = this.detectMediaType(media, mediaName);
            if (mediaType === 'image') {
                const uploadResponse = await this.uploadMedia(media, mediaType);
                payload.embed = {
                    $type: 'app.bsky.embed.images',
                    images: [{
                        alt: '',
                        image: uploadResponse.data.blob,
                    }]
                }
            } else if (mediaType === 'video') {
                const blob = await this.uploadVideoWithJob(media, mediaName);
                payload.embed = {
                    $type: 'app.bsky.embed.video',
                    video: blob,
                } as any;
            }
        }

        return await this.agent.post(payload)
    }
}
