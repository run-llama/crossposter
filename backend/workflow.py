from dotenv import load_dotenv
load_dotenv()

from llama_index.core.workflow import (
    StartEvent,
    StopEvent,
    Workflow,
    step,
    Event,
    Context,
)
import json
from llama_index.llms.anthropic import Anthropic
from llama_index.utils.workflow import draw_all_possible_flows
from serptool import search_google_tool
from llama_index.core.agent import FunctionCallingAgent

# Steps:
# Extract entities for @-mentions from the text
# For each entity, search the web for
#   - twitter/x profile
#   - linkedin profile
#   - mastodon account
#   - bluesky account
# Extract links from the text
# For each link, add appropriate UTM source and campaign parameters
# Compose a post for each platform
# Return the posts

class MentionsEvent(Event):
    source_draft: str

class GenerateTwitterHandlesEvent(Event):
    entities: dict

class GenerateLinkedinHandlesEvent(Event):
    entities: dict

class GenerateMastodonHandlesEvent(Event):
    entities: dict

class GenerateBlueskyHandlesEvent(Event):
    entities: dict

class CollectHandlesEvent(Event):
    handles: dict

class ProgressEvent(Event):
    msg: str

class CrossPosterWorkflow(Workflow):
    llm: Anthropic

    @step
    async def initialize(self, ctx: Context, ev: StartEvent) -> MentionsEvent:
        ctx.write_event_to_stream(ProgressEvent(msg="Received source draft..."))
        await ctx.set("source_draft", ev.text)

        llm = Anthropic(
            model="claude-3-5-sonnet-latest"
        )
        self.llm = llm

        return MentionsEvent(source_draft=ev.text)

    @step
    async def extract_mentions(self, ctx: Context, ev: MentionsEvent) -> GenerateTwitterHandlesEvent | GenerateLinkedinHandlesEvent | GenerateMastodonHandlesEvent | GenerateBlueskyHandlesEvent:
        ctx.write_event_to_stream(ProgressEvent(msg="Extracting entities..."))
        llm = self.llm
        source_draft = ev.source_draft
        response = await llm.acomplete(prompt=f"""
            Below is the text of a tweet. Extract from it a list of entities it might make sense to @-mention.
            <tweet>
            {source_draft}
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
        """)

        extracted_entities = json.loads(str(response))

        await ctx.set("entity_placeholder_draft", extracted_entities["text"])

        ctx.write_event_to_stream(ProgressEvent(msg=f"Extracted entities: {extracted_entities['entities']}"))
        ctx.write_event_to_stream(ProgressEvent(msg=f"Entity placeholder draft: {extracted_entities['text']}"))

        ctx.send_event(GenerateTwitterHandlesEvent(entities=extracted_entities["entities"]))
        ctx.send_event(GenerateLinkedinHandlesEvent(entities=extracted_entities["entities"]))
        #ctx.send_event(GenerateMastodonMentionsEvent(entities=extracted_entities["entities"]))
        #ctx.send_event(GenerateBlueskyMentionsEvent(entities=extracted_entities["entities"]))

    async def _search_web(self, prompt):
        agent = FunctionCallingAgent.from_tools(
            [search_google_tool],
            llm=self.llm,
            verbose=False,
            allow_parallel_tool_calls=False,
        )
        result = await agent.achat(prompt)

        print(f"Search tool returned result: {result}")

        return str(result)

    @step
    async def generate_twitter_handles(self, ctx: Context, ev: GenerateTwitterHandlesEvent) -> CollectHandlesEvent:
        ctx.write_event_to_stream(ProgressEvent(msg=f"Generating Twitter handles..."))

        twitter_handles = {}
        for entity_key, entity_value in ev.entities.items():
            ctx.write_event_to_stream(ProgressEvent(msg=f"Looking up Twitter handle for {entity_value}..."))
            result = await self._search_web(f"""
                Your goal is to find the Twitter account of the given entity. 
                These days Twitter is also called X, so it might be "X account" or "Twitter account".
                Search the web for "{entity_value} twitter account". You'll get a list of results.
                Pick the one that is most likely to be the Twitter/X account of the given entity.
                Return the URL of that twitter account. Return the URL ONLY.
            """)

            # parse the URL into what the poster will use, in twitter's case a simple string like "@username"
            handle = "@" + result.split("https://twitter.com/")[1]
            twitter_handles[entity_key] = handle
            
        return CollectHandlesEvent(platform="twitter", handles=twitter_handles)

    @step
    async def generate_linkedin_handles(self, ctx: Context, ev: GenerateLinkedinHandlesEvent) -> CollectHandlesEvent:
        ctx.write_event_to_stream(ProgressEvent(msg=f"Generating LinkedIn handles..."))

        linkedin_handles = {}
        for entity_key, entity_value in ev.entities.items():
            ctx.write_event_to_stream(ProgressEvent(msg=f"Looking up LinkedIn handle for {entity_value}..."))
            result = await self._search_web(f"""
                Your goal is to find the LinkedIn account of the given entity.
                Search the web for "{entity_value} linkedin account". You'll get a list of results.
                Pick the one that is most likely to be the LinkedIn account of the given entity.
                Return the URL of that LinkedIn account. Return the URL ONLY.
            """)

            # parse the URL into what the poster will use, in linkedin's case a string like "linkedin.com/in/username"
            print("LinkedIn result: ", result)
            #handle = "linkedin.com/in/" + result.split("https://www.linkedin.com/in/")[1]

            linkedin_handles[entity_key] = result

        return CollectHandlesEvent(platform="linkedin", handles=linkedin_handles)

    @step
    async def generate_mastodon_handles(self, ctx: Context, ev: GenerateMastodonHandlesEvent) -> CollectHandlesEvent:
        ctx.write_event_to_stream(ProgressEvent(msg=f"Generating Mastodon handles..."))

    @step
    async def generate_bluesky_handles(self, ctx: Context, ev: GenerateBlueskyHandlesEvent) -> CollectHandlesEvent:
        ctx.write_event_to_stream(ProgressEvent(msg=f"Generating Bluesky handles..."))

    @step
    async def collect_handles(self, ctx: Context, ev: CollectHandlesEvent) -> StopEvent:
        ctx.write_event_to_stream(ProgressEvent(msg="Collecting generated handles..."))

        results = ctx.collect_events(ev, [CollectHandlesEvent] * 2)
        if results is None:
            return None

        ctx.write_event_to_stream(ProgressEvent(msg=f"Collected handles: {results}"))

        drafts = {}
        for result in results:

            print(f"Result for {result.platform}: {result.handles}")

            platform = result.platform
            handles = result.handles

            draft = await ctx.get("entity_placeholder_draft")
            print(f"Draft before: {draft}")
            for entity_key, entity_value in handles.items():
                draft = draft.replace(f"@[{entity_key}]", entity_value)

            drafts[platform] = draft
            print(f"Draft for {platform}: {draft}")

        return StopEvent(result=drafts)
