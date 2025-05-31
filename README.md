# CrossPoster

You can try CrossPoster right now at [crossposter.llamaindex.ai](https://crossposter.llamaindex.ai)!

CrossPoster is a tool for quickly posting to multiple social media platforms while adapting the content to each platform. It uses [LlamaIndex.TS](https://ts.llamaindex.ai/) to identify entities within each post and @-mention them appropriately on each platform, and also to shorten the text for platforms with character limits.

It was designed as an internal tool for LlamaIndex and has been open-sourced because it's pretty nifty! But unless you have <b>exactly</b> our social media posting workflow you're probably going to have to do some work to adapt it. Why not contribute your changes back as PRs?

## Tech Stack

* This is a pretty standard [Next.js](https://nextjs.org) app.
* It uses [LlamaIndex.TS](https://ts.llamaindex.ai/) for the AI logic.
* Web search is done with [SerpAPI](https://serpapi.com/).
* It is deployed on [Render](https://render.com/) because the serverless functions generated are bigger than Vercel's 250MB limit.

## Getting Started

Local dev is straightforward:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Environment variables

Because it connects to so many different APIs, there are a lot of environment variables. You can set them in a `.env` file in the root directory. They are:

* BASE_URL: The URL you intend to serve the app from; localhost:3000 in dev
* NEXTAUTH_URL: Same as base URL, used by the oauth library
* NEXTAUTH_SECRET: A random string of your choosing; used by the oauth library
* DATABASE_URL: Users and their access tokens are stored in a Postgres database. You can find the schema in `prisma/schema.prisma`.
* ANTHROPIC_API_KEY: Anthropic's Sonnet 3.5 does all of the thinking. It also works with OpenAI's GPT-4o and better models.
* SERP_API_KEY: Needed for the web searches
* GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET: Used for the OAuth flow
* TWITTER_OAUTH_1_KEY and TWITTER_OAUTH_1_SECRET: You can only upload images to Twitter's API using OAuth 1.0a so you have to set up an app that has those.
* LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET: You need a LinkedIn app with a bewildering array of permissions, including:
  * profile
  * email
  * openid
  * w_member_social
  * w_organization_social

## PR ideas

Want to contribute? There are so many ways this could be better!

* Mastodon support (please!)
* Threads support
* Generate links to mentioned entities, maybe with previews, so it's easy to check you got the right ones
* Make the UI prettier
* Schedule posts and show them in a calendar (very large)
