import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { FunctionTool, Settings } from "llamaindex";
import { anthropic } from "@llamaindex/anthropic";
import { agent } from "@llamaindex/workflow";
import { getJson } from "serpapi";
import { PrismaClient } from '@prisma/client'

const searchWeb = FunctionTool.from(
  async ({ query }: { query: string }) => {
    const response = await getJson({
        engine: "google",
        api_key: process.env.SERP_API_KEY,
        q: query,
        location: "San Francisco, California",
      });
      let filteredResponse = response.organic_results.map((result: any, index: number) => {
        return {
            title: result.title,
            link: result.link,
            snippet: result.snippet.replaceAll("·", "").replaceAll("...", "")
        }
      })
      //console.log(`web search response for ${query}: `, filteredResponse);
      return filteredResponse;
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

const llm = anthropic({
    model: "claude-sonnet-4-20250514",
    apiKey: process.env.ANTHROPIC_API_KEY,
});

const twitterAgent = agent({tools: [searchWeb], llm});
const linkedInAgent = agent({tools: [searchWeb], llm});
const blueskyAgent = agent({tools: [searchWeb], llm});

const getTwitterHandles = async (controller: ReadableStreamDefaultController, extractedEntities: any) => {
    const twitterHandles: Record<string, string | null> = {};
    const searchPromises = Object.values(extractedEntities).map(async (entityValue: unknown) => {
        if (typeof entityValue !== 'string') {
            throw new Error('Entity value must be a string');
        }
        sendResponse(controller, "Looking up Twitter handle for " + entityValue);

        let agentResponse = null;
        try {
            agentResponse = await twitterAgent.run(`
                Your goal is to find the Twitter account of the given entity. 
                These days Twitter is also called X, so it might be "X account" or "Twitter account". Search the web for "${entityValue} twitter account". You'll get a list of results.
                Pick the one that is most likely to be the Twitter/X account of the given entity.
                Return the FULL URL ONLY. If none of the results seem to be the Twitter/X account of the given entity, return "NOT FOUND" only.
                Do not include any preamble or explanation, just return the URL.
            `);

            console.log("Twitter Agent response: ", agentResponse?.data?.result || "No response");

        } catch (error) {
            console.error(`Error running agent to find Twitter handle for ${entityValue}`, error);
            return [entityValue, null];
        }

        if (!agentResponse?.data?.result) {
            return [entityValue, null];
        }

        let response = null;
        try {            
            response = await llm.complete({
                prompt: `
                    You're given the output of an agent running a search. It has either found a URL or not. If it found a URL, return that URL ONLY. If it didn't find a URL, return "NOT FOUND" only.
                    <agentresponse>
                    ${agentResponse?.data?.result ?? "NOT FOUND"}
                    </agentresponse>
                `
            });
        } catch (error) {
            console.error("Error running LLM to clean up agent response about twitter", error);
            return [entityValue, null];
        }

        const result = response.text;
        console.log("Twitter search result: ", result);
        
        let handle = null;
        if (result !== "NOT FOUND") {
            if (result.includes("twitter.com/")) {
                handle = "@" + result.split("twitter.com/")[1].split("?")[0].split("/")[0];
            } else if (result.includes("x.com/")) {
                handle = "@" + result.split("x.com/")[1].split("?")[0].split("/")[0];
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
    const linkedInHandles: Record<string, string | null> = {};
    const searchPromises = Object.values(extractedEntities).map(async (entityValue: unknown) => {
        if (typeof entityValue !== 'string') {
            throw new Error('Entity value must be a string');
        }
        sendResponse(controller, "Looking up LinkedIn handle for " + entityValue);

        let agentResponse = null;
        try {
            agentResponse = await linkedInAgent.run(`
                    Your goal is to find the LinkedIn account of the given entity. 
                    Search the web for "${entityValue} linkedin". You'll get a list of results.
                    Pick the one that is most likely to be the LinkedIn account of the given entity.
                    Return the URL of that LinkedIn account. Return the URL ONLY. If none of the results
                    seem to be the LinkedIn account of the given entity, return "NOT FOUND" only.
                `);
        } catch (error) {
            console.error(`Error running agent to find LinkedIn handle for ${entityValue}`, error);
            console.error("Stack: ", (error as Error).stack);
        }

        if (!agentResponse?.data?.result) {
            return [entityValue, null];
        }

        console.log("LinkedIn Agent response: ", agentResponse?.data?.result);

        let response = null;
        try {
            response = await llm.complete({
                prompt: `
                    You're given the output of an agent running a search. It has either found a URL or not. If it found a URL, return that URL ONLY. If it didn't find a URL, return "NOT FOUND" only.
                    <agentresponse>
                    ${agentResponse?.data?.result ?? "NOT FOUND"}
                    </agentresponse>
                `
            });
        } catch (error) {
            console.error("Error running LLM to clean up agent response about linkedin", error);
        }

        if (!response) {
            return [entityValue, null];
        }

        const result = response.text;
        console.log("LinkedIn search result: ", result);
        
        let handle = null;
        if (result !== "NOT FOUND") {
            handle = result;
            sendResponse(controller, `Found LinkedIn handle for ${entityValue}: ` + handle);
        }

        // FIXME: if the entity is a person, we won't be able to @-mention them
        // (see linkedInPostShare.ts) so we return null.
        if (handle && handle.includes("linkedin.com/in/")) {
            handle = null;
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

    let handle = null
    
    const matches = url.match(/did:plc:[a-z0-9]+/);
    if (matches) {
        const did = matches[0];

        try {
            const response = await fetch(`https://plc.directory/${did}`);
            const data = await response.json();
            handle = data.alsoKnownAs[0];
            if (handle.startsWith('at://')) {
                handle = handle.substring(5);
            }
        } catch (error) {
            console.error('Error translating Bluesky DID URL tohandle:', error);
            throw error;
        }
    } else {
        console.log(`${url} doesn't look like a bluesky DID, maybe it's the actual URL?`)
        handle = url.split("/").pop()?.split("?")[0];
    }

    return handle;
}

const getBlueskyHandles = async (controller: ReadableStreamDefaultController, extractedEntities: any) => {
    const blueskyHandles: Record<string, string | null> = {};
    const searchPromises = Object.values(extractedEntities).map(async (entityValue: unknown) => {
        if (typeof entityValue !== 'string') {
            throw new Error('Entity value must be a string');
        }
        sendResponse(controller, "Looking up Bluesky handle for " + entityValue);

        const agentResponse = await blueskyAgent.run(`
                Your goal is to find the Bluesky account of the given entity. 
                Search the web for "${entityValue} bluesky". You'll get a list of results.
                Pick the one that is most likely to be the Bluesky account of the given entity. Sometimes Bluesky accounts have ugly URLs like "did:plc:..." but if the title and description match, it might be the right one.
                Return the URL of that Bluesky account. Return the URL ONLY. If none of the results
                seem to be the Bluesky account of the given entity, return "NOT FOUND" only.
            `);

        if (!agentResponse?.data?.result) {
            return [entityValue, null];
        }

        console.log("Bluesky Agent response: ", agentResponse?.data?.result);

        const response = await llm.complete({
            prompt: `
                You're given the output of an agent running a search. It has either found a URL or not. If it found a URL, return that URL ONLY. If it didn't find a URL, return "NOT FOUND" only.
                <agentresponse>
                ${agentResponse?.data?.result ?? "NOT FOUND"}
                </agentresponse>
            `
        });

        if (!response) {
            return [entityValue, null];
        }

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

        const prisma = new PrismaClient();

        const user = await prisma.users.findUnique({
          where: { email: session.user?.email ?? undefined }
        });

        // UTM rules logic: parse utm_rules, update URLs in text
        let modifiedText = text;
        if (user && user.utm_rules) {
          let utmRulesObj: { domains: any[] } = { domains: [] };
          if (typeof user.utm_rules === 'string') {
            try {
              const parsed = JSON.parse(user.utm_rules);
              if (parsed && typeof parsed === 'object' && Array.isArray(parsed.domains)) {
                utmRulesObj = parsed;
              }
            } catch (e) {
              // fallback to empty
            }
          } else if (typeof user.utm_rules === 'object' && user.utm_rules !== null && Array.isArray((user.utm_rules as any).domains)) {
            utmRulesObj = user.utm_rules as { domains: any[] };
          }
          for (const rule of utmRulesObj.domains) {
            if (!rule.domain) continue;
            // Regex to find URLs containing the domain
            const urlRegex = new RegExp(`https?:\\/\\/[^\\s]*${rule.domain}[^\\s]*`, 'g');
            modifiedText = modifiedText.replace(urlRegex, (match) => {
              try {
                console.log("Match: ", match);
                const urlObj = new URL(match);
                // Set/overwrite UTM params
                if (rule.source) urlObj.searchParams.set('utm_source', rule.source);
                if (rule.medium) urlObj.searchParams.set('utm_medium', rule.medium);
                if (rule.campaign) urlObj.searchParams.set('utm_campaign', rule.campaign);
                return urlObj.toString();
              } catch (e) {
                // If URL parsing fails, return original
                return match;
              }
            });
          }
        }

        console.log("Text to draft: ", modifiedText);

        // Create a ReadableStream to send the response as an SSE
        const stream = new ReadableStream({
            async start(controller) {

                sendResponse(controller, "Generating entities...");

                const response = await llm.complete({prompt:`
                    Below is the text of a tweet. Extract from it a list of entities it might make sense to @-mention. Do not include LlamaIndex as one of the entities, we are 
                    LlamaIndex.
                    
                    <tweet>
                    ${modifiedText}
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
                    Do NOT include any markdown formatting around the JSON.

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

                const drafts: Record<string, string> = {};
                for (const platform in handles) {
                    console.log("Platform: ", platform);
                    console.log("Handles: ", handles[platform]);
                    let platformDraft = draft;
                    for (const entityLabel of Object.keys(extractedEntities)) {
                        const entityName = extractedEntities[entityLabel];
                        if (handles[platform][entityName]) {
                            platformDraft = platformDraft.replaceAll(`@[${entityLabel}]`, handles[platform][entityName]);
                        } else {
                            platformDraft = platformDraft.replaceAll(`@[${entityLabel}]`, entityName);
                        }
                    }
                    drafts[platform] = platformDraft;
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
                    drafts.bluesky = response.text;
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
