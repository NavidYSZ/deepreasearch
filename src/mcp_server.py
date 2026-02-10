"""Legacy Python MCP server (web-only Deep Research tool).

Not used by the Node server; kept for reference.
"""

import logging
import os
from typing import Any, Dict

from dotenv import load_dotenv
from fastmcp import FastMCP
from openai import AsyncOpenAI

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def create_server(openai_client: AsyncOpenAI) -> FastMCP:
    mcp = FastMCP(
        name="Deep Research MCP Server (web-only)",
        instructions="Provides a single `deep_research` tool that runs the OpenAI Deep Research model with web search enabled.",
    )

    @mcp.tool()
    async def deep_research(query: str) -> Dict[str, Any]:
        """Run a Deep Research turn with web search enabled and return the answer."""
        if not query or not query.strip():
            return {"answer": "Leere Anfrage."}

        model = os.getenv("DEEP_RESEARCH_MODEL", "o3-deep-research-2025-06-26")
        logger.info("Starting deep research with model %s", model)

        resp = await openai_client.responses.create(
            model=model,
            input=[
                {
                    "role": "user",
                    "content": [{"type": "input_text", "text": query}],
                }
            ],
            reasoning={"summary": "auto"},
            tools=[{"type": "web_search_preview"}],
        )

        answer = getattr(resp, "output_text", None) or getattr(resp, "output", None)
        return {
            "answer": answer,
            "run_id": getattr(resp, "id", None),
            "usage": getattr(resp, "usage", None),
        }

    return mcp


def main() -> None:
    api_key = os.getenv("OPENAI_API_KEY", "")
    if not api_key:
        raise ValueError("OPENAI_API_KEY is required")
    client = AsyncOpenAI(api_key=api_key, timeout=600.0)

    host = os.getenv("MCP_SERVER_HOST", "0.0.0.0")
    port = int(os.getenv("MCP_SERVER_PORT", "8000"))

    server = create_server(client)
    logger.info("Starting MCP server on %s:%s (SSE transport)", host, port)
    server.run(transport="sse", host=host, port=port)


if __name__ == "__main__":
    main()

