"""Agents SDK entrypoint that uses the Deep Research model and the MCP server.

It wires in:
 - WebSearchTool (for open web)
 - HostedMCPTool (points at our local MCP server)
You can swap the prompt or tools as needed.
"""

import asyncio
import os

from dotenv import load_dotenv
from openai import AsyncOpenAI
from agents import (
    Agent,
    HostedMCPTool,
    RunConfig,
    Runner,
    WebSearchTool,
    set_default_openai_client,
)

load_dotenv()


def build_runner() -> Runner:
    client = AsyncOpenAI(
        api_key=os.getenv("OPENAI_API_KEY", ""), timeout=600.0
    )
    set_default_openai_client(client)
    os.environ.setdefault("OPENAI_AGENTS_DISABLE_TRACING", "1")

    deep_research_model = os.getenv(
        "DEEP_RESEARCH_MODEL", "o3-deep-research-2025-06-26"
    )
    mcp_server_url = os.getenv("MCP_SERVER_URL", "http://localhost:8000/sse/")

    research_agent = Agent(
        name="Research Agent",
        model=deep_research_model,
        instructions=(
            "Du bist ein gründlicher Researcher. Nutze zuerst Websuche, "
            "dann hole interne Dateien über das MCP-Fetch/Search-Paar. "
            "Zitiere Quellen inline."
        ),
        tools=[
            WebSearchTool(),
            HostedMCPTool(
                server_url=mcp_server_url,
                server_label="internal_file_lookup",
                require_approval="never",
            ),
        ],
    )

    return Runner(agents=[research_agent])


async def main() -> None:
    query = os.getenv(
        "DEMO_QUERY",
        "Fasse die neuesten Trends zum 'semaglutide' Markt zusammen und nenne Zahlen.",
    )

    runner = build_runner()
    result = await runner.run(
        query,
        run_config=RunConfig(
            reasoning={"summary": "auto"},
            metadata={"origin": "local-demo"},
        ),
    )

    print("# Ergebnis")
    print(result.output_text)


if __name__ == "__main__":
    asyncio.run(main())

