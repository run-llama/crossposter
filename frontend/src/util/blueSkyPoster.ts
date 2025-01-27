import { AtpAgent } from '@atproto/api'
import { RichText } from '@atproto/api'

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

        // okay! We have to translate all the mentions into text aspects
        // first we do a regex to extract all the handles and their URLs
        // then we replace all the handles with bare @-mentions
        // then for each handle, we
        //    find the index of the handle in the text
        //    add a text aspect to the payload mentioning that text
        //    update the skip index so we don't re-process the same handle
        const handleRegex = /@\[([^\]]+)\]\(([^)]+)\)/g;
        const matches = [...text.matchAll(handleRegex)];

        // extract just one entity per handle
        const entities = {}
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

        const rt = new RichText({
            text: processedText,
          })
        await rt.detectFacets(this.agent)        

        const payload = {
            text: processedText.slice(0, 300),
            createdAt: new Date().toISOString(),
            facets: rt.facets,
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
