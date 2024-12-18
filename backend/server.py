from fastapi import FastAPI, Request
import uvicorn
import json
import asyncio
import random
from fastapi.responses import StreamingResponse
from workflow import CrossPosterWorkflow, ProgressEvent, StopEvent

app = FastAPI()

# async def generate_events(text: str):
#     """Generate random events for up to 30 seconds."""
#     start_time = asyncio.get_event_loop().time()
    
#     while asyncio.get_event_loop().time() - start_time < 30:
#         # Wait for a random interval between 1-5 seconds
#         await asyncio.sleep(random.uniform(1, 5))
        
#         # Generate a random event
#         event = {
#             "type": random.choice(["thinking", "processing", "analyzing"]),
#             "message": f"Processing: {text[:20]}..."
#         }
        
#         # Yield the event in SSE format
#         yield f"data: {json.dumps(event)}\n\n"

@app.post("/drafts")
async def create_drafts(request: Request):
    # Parse the JSON body
    data = await request.json()
    text = data.get("text", "")

    w = CrossPosterWorkflow(timeout=30, verbose=True)
    handler = w.run(first_input="Start the workflow.")

    async def event_generator():
        async for event in handler.stream_events():
            if isinstance(event, ProgressEvent):
                yield f"data: {json.dumps({'msg': event.msg})}\n\n"
            elif isinstance(event, StopEvent):
                yield f"data: {json.dumps({'msg': 'Workflow completed'})}\n\n"
            else:
                yield f"data: {json.dumps({'msg': 'Unknown event type'})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream"
    )

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)

