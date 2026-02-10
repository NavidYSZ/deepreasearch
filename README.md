# Deep Research MCP + Agents SDK Scaffold

This repo gives you two small pieces:

- `src/mcp_server.py` – an MCP server exposing **one tool** `deep_research(query)` that runs the OpenAI Deep Research model with web search (kein Vector Store nötig).
- `src/run_agent.py` – an Agents SDK runner (optional local demo) mit Deep Research Modell und WebSearchTool; kann auch über MCP ersetzt werden.

## Setup (Node)

```bash
cp .env.example .env
npm install
```

## Run the MCP server (Node, SSE)

```bash
npm start
# default: http://0.0.0.0:8000/sse/
```

Expose it publicly (optional) via `ngrok http 8000` or your PaaS.

Endpoints:
- `GET /` -> health JSON
- `GET /sse` -> establishes SSE stream and returns `endpoint` event
- `POST /message?sessionId=...` -> client sends JSON-RPC messages (handled automatically by MCP clients)

## Optional: Python agent demo

If you still want the Python Agents-SDK demo:

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -e .
python src/run_agent.py
```

## Notes

- Der Node-MCP-Endpoint `deep_research` ruft intern `openai.responses.create` mit `web_search_preview` auf; keine eigenen Datenquellen erforderlich.
- Für eigene Daten kannst du später weitere MCP-Tools ergänzen (Search/Fetch usw.); das Grundgerüst bleibt gleich.
