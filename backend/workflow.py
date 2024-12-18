from llama_index.core.workflow import (
    StartEvent,
    StopEvent,
    Workflow,
    step,
    Event,
    Context,
)
import asyncio
from llama_index.utils.workflow import draw_all_possible_flows

class FirstEvent(Event):
    first_output: str

class SecondEvent(Event):
    second_output: str

class ProgressEvent(Event):
    msg: str

class CrossPosterWorkflow(Workflow):
    @step
    async def step_one(self, ctx: Context, ev: StartEvent) -> FirstEvent:
        ctx.write_event_to_stream(ProgressEvent(msg="Step one is happening"))
        return FirstEvent(first_output="First step complete.")

    @step
    async def step_two(self, ctx: Context, ev: FirstEvent) -> SecondEvent:
        ctx.write_event_to_stream(ProgressEvent(msg="Second step is happening"))
        return SecondEvent(
            second_output="Second step complete, full response attached"
        )

    @step
    async def step_three(self, ctx: Context, ev: SecondEvent) -> StopEvent:
        ctx.write_event_to_stream(ProgressEvent(msg="Step three is happening"))
        return StopEvent(result="This is the final output.")
