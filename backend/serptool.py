from serpapi import GoogleSearch
import os

from llama_index.core.tools import FunctionTool

def search_google(query: str):
    """Search the web with Google for the given query, return a dict with the results."""
    params = {
        "q": query,
        "hl": "en",
        "gl": "us",
        "google_domain": "google.com",
        "api_key": os.getenv("SERP_API_KEY")
    }

    search = GoogleSearch(params)
    results = search.get_dict()

    return results

search_google_tool = FunctionTool.from_defaults(fn=search_google)
