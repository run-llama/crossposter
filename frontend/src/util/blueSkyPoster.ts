import { AtpAgent, RichText } from '@atproto/api'
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

    async uploadMedia(media: Buffer) {
        return await this.agent.uploadBlob(media)
    }

    async post(text: string, media: Buffer | null) {

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
            const uploadResponse = await this.uploadMedia(media)
            console.log("Upload result", uploadResponse)

            payload.embed = {
                $type: 'app.bsky.embed.images',
                images: [{
                    alt: '',
                    image: uploadResponse.data.blob,
                }]
            }
        }

        return await this.agent.post(payload)
    }
}
