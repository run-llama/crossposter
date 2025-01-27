import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { Anthropic } from "llamaindex";
import { FunctionTool, ReActAgent, Settings } from "llamaindex";
import { getJson } from "serpapi";

const searchWeb = FunctionTool.from(
  async ({ query }: { query: string }) => {
    const response = await getJson({
        engine: "google",
        api_key: process.env.SERP_API_KEY,
        q: query,
        location: "Austin, Texas",
      });
      return response;
  },
  {
    name: "searchWeb",
    description: "Use this function to search the web for a query",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The query to search the web for",
        },
      },
      required: ["query"],
    },
  },
);

const sendResponse = (controller: ReadableStreamDefaultController, message: string) => {
    controller.enqueue(`data: ${JSON.stringify({msg: message})}\n\n`);
}

Settings.llm = new Anthropic({
    model: "claude-3-5-sonnet-20240620",
    apiKey: process.env.ANTHROPIC_API_KEY,
});

const agent = new ReActAgent({tools: [searchWeb]});

const getTwitterHandles = async (controller: ReadableStreamDefaultController, extractedEntities: any) => {
    const twitterHandles = {};
    const searchPromises = Object.values(extractedEntities).map(async (entityValue: string) => {
        sendResponse(controller, "Looking up Twitter handle for " + entityValue);

        const agentResponse = await agent.chat({
            message: `
                Your goal is to find the Twitter account of the given entity. 
                These days Twitter is also called X, so it might be "X account" or "Twitter account". Search the web for "${entityValue} twitter account". You'll get a list of results.
                Pick the one that is most likely to be the Twitter/X account of the given entity.
                Return the FULL URL ONLY. If none of the results seem to be the Twitter/X account of the given entity, return "NOT FOUND" only.
            `
        });

        console.log("Twitter Agent response: ", agentResponse.message.content[0].text);

        const response = await Settings.llm.complete({
            prompt: `
                You're given the output of an agent running a search. It has either found a URL or not. If it found a URL, return that URL ONLY. If it didn't find a URL, return "NOT FOUND" only.
                <agentresponse>
                ${Buffer.from(agentResponse.message.content[0].text).toString('utf8')}
                </agentresponse>
            `
        });

        const result = response.text;
        console.log("Twitter search result: ", result);
        
        let handle = null;
        if (result !== "NOT FOUND") {
            if (result.includes("twitter.com/")) {
                handle = "@" + result.split("twitter.com/")[1].split("?")[0];
            } else if (result.includes("x.com/")) {
                handle = "@" + result.split("x.com/")[1].split("?")[0];
            }
            sendResponse(controller, `Found Twitter handle for ${entityValue}: ` + handle);
        }

        return [entityValue, handle];
    });

    const results = await Promise.all(searchPromises);
    for (const [entityValue, handle] of results) {
        twitterHandles[entityValue as string] = handle;
    }

    return twitterHandles;
}

const getLinkedInHandles = async (controller: ReadableStreamDefaultController, extractedEntities: any) => {
    const linkedInHandles = {};
    const searchPromises = Object.values(extractedEntities).map(async (entityValue: string) => {
        sendResponse(controller, "Looking up LinkedIn handle for " + entityValue);

        const agentResponse = await agent.chat({
            message: `
                Your goal is to find the LinkedIn account of the given entity. 
                Search the web for "${entityValue} linkedin". You'll get a list of results.
                Pick the one that is most likely to be the LinkedIn account of the given entity.
                Return the URL of that LinkedIn account. Return the URL ONLY. If none of the results
                seem to be the LinkedIn account of the given entity, return "NOT FOUND" only.
            `
        });

        console.log("LinkedIn Agent response: ", agentResponse.message.content[0].text);

        const response = await Settings.llm.complete({
            prompt: `
                You're given the output of an agent running a search. It has either found a URL or not. If it found a URL, return that URL ONLY. If it didn't find a URL, return "NOT FOUND" only.
                <agentresponse>
                ${agentResponse.message.content[0].text}
                </agentresponse>
            `
        });

        const result = response.text;
        console.log("LinkedIn search result: ", result);
        
        let handle = null;
        if (result !== "NOT FOUND") {
            handle = result;
            sendResponse(controller, `Found LinkedIn handle for ${entityValue}: ` + handle);
        }

        return [entityValue, handle];
    });

    const results = await Promise.all(searchPromises);
    for (const [entityValue, handle] of results) {
        linkedInHandles[entityValue as string] = handle;
    }

    return linkedInHandles;
}

const translateBlueSkyURLToHandle = async (url: string) => {

    if (!url) return null;
    
    const matches = url.match(/did:plc:[a-z0-9]+/);
    if (!matches) {
        console.log(`${url} doesn't look like a bluesky DID`)
        return null;
    }

    const did = matches[0];

    let handle = null;
    try {
        const response = await fetch(`https://plc.directory/${did}`);
        const data = await response.json();
        handle = data.alsoKnownAs[0];
        if (handle.startsWith('at://')) {
            handle = handle.substring(5);
        }
    } catch (error) {
        console.error('Error translating Bluesky DID URL tohandle:', error);
    }

    return handle;
}

const getBlueskyHandles = async (controller: ReadableStreamDefaultController, extractedEntities: any) => {
    const blueskyHandles = {};
    const searchPromises = Object.values(extractedEntities).map(async (entityValue: string) => {
        sendResponse(controller, "Looking up Bluesky handle for " + entityValue);

        const agentResponse = await agent.chat({
            message: `
                Your goal is to find the Bluesky account of the given entity. 
                Search the web for "${entityValue} bluesky". You'll get a list of results.
                Pick the one that is most likely to be the Bluesky account of the given entity.
                Return the URL of that Bluesky account. Return the URL ONLY. If none of the results
                seem to be the Bluesky account of the given entity, return "NOT FOUND" only.
            `
        });

        console.log("Bluesky Agent response: ", agentResponse.message.content[0].text);

        const response = await Settings.llm.complete({
            prompt: `
                You're given the output of an agent running a search. It has either found a URL or not. If it found a URL, return that URL ONLY. If it didn't find a URL, return "NOT FOUND" only.
                <agentresponse>
                ${agentResponse.message.content[0].text}
                </agentresponse>
            `
        });

        const result = response.text;
        console.log("Bluesky search result: ", result);
        
        let handle = null;
        if (result !== "NOT FOUND") {
            handle = result;
            sendResponse(controller, `Found BlueSky handle for ${entityValue}: ` + handle);
        }

        return [entityValue, handle];
    });

    const results = await Promise.all(searchPromises);
    for (const [entityValue, url] of results) {
        if (url) {
            const handle = await translateBlueSkyURLToHandle(url)
            blueskyHandles[entityValue as string] = `@${handle}`
        } else {
            blueskyHandles[entityValue as string] = null
        }
    }

    return blueskyHandles;
}

export async function POST(request: Request) {
    const session = await getServerSession(authOptions);
    
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json({ message: "Hello World" });
}

export async function GET(request: Request) {
    const session = await getServerSession(authOptions);
    
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const url = new URL(request.url);
        const text = url.searchParams.get('text');

        if (!text) {
            return NextResponse.json(
                { error: 'Text parameter is required' },
                { status: 400 }
            );
        }


        // Create a ReadableStream to send the response as an SSE
        const stream = new ReadableStream({
            async start(controller) {

                sendResponse(controller, "Generating entities...");

                const response = await Settings.llm.complete({prompt:`
                    Below is the text of a tweet. Extract from it a list of entities it might make sense to @-mention.
                    <tweet>
                    ${text}
                    </tweet>

                    Return a JSON object with the following structure:
                    {{
                        "text": "The text of the tweet with @[entity1] and @[entity2] placeholders for the entities you extracted.",
                        "entities": {{
                            "entity1": "Name of the entity",
                            "entity2": "Name of the entity"
                        }}
                    }}
                    In the text entry, the placeholders should look exactly like "@[entity1]", matching the keys in the entities entry,
                    and including the @ symbol and the square brackets.

                    Return the JSON object ONLY, no preamble or explanation.

                    JSON:
                `})

                const entityExtractionResult = JSON.parse(response.text);
                const extractedEntities = entityExtractionResult.entities;
                const draft = entityExtractionResult.text;

                console.log("Extracted entities: ", extractedEntities);

                sendResponse(controller, "Extracted entities, searching for handles...");

                const handlePromises = {
                    twitter: getTwitterHandles(controller, extractedEntities),
                    linkedin: getLinkedInHandles(controller, extractedEntities),
                    bluesky: getBlueskyHandles(controller, extractedEntities)
                };

                const handles = await Promise.all(Object.values(handlePromises))
                    .then(results => {
                        return Object.fromEntries(
                            Object.keys(handlePromises).map((key, index) => [key, results[index]])
                        );
                    });

                sendResponse(controller, `Got all handles`);

                const drafts = {}
                for (const platform in handles) {
                    console.log("Platform: ", platform);
                    console.log("Handles: ", handles[platform]);
                    let platformDraft = draft
                    for (const entityLabel of Object.keys(extractedEntities)) {
                        const entityName = extractedEntities[entityLabel];
                        if (handles[platform][entityName]) {
                            platformDraft = platformDraft.replaceAll(`@[${entityLabel}]`, handles[platform][entityName]);
                        } else {
                            platformDraft = platformDraft.replaceAll(`@[${entityLabel}]`, entityName);
                        }
                    }
                    drafts[platform] = platformDraft
                }

                // bluesky needs to be rephrased if it's over 300 characters
                if (drafts.bluesky.length > 300) {
                    const response = await Settings.llm.complete({
                        prompt: `
                            This bluesky draft is too long. Rephrase it be at 300 characters or less.
                            As much as possible, maintain @-mentions. The post likely ends with a URL, 
                            that MUST be included.
                            <draft>
                            ${drafts.bluesky}
                            </draft>
                            Do NOT include any preamble or explanation, just return the rephrased text.
                        `
                    });
                    drafts.bluesky = response.text
                }

                controller.enqueue(`data: ${JSON.stringify({
                    msg: "Workflow completed",
                    result: drafts,
                    handles: handles
                })}\n\n`);

                controller.close();
            },
        });

        // Return the stream with appropriate headers for SSE
        return new Response(stream, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
            },
        });

    } catch (error) {
        console.error('Error processing draft:', error);
        return NextResponse.json(
            { error: 'Failed to process draft' },
            { status: 500 }
        );
    }
}
