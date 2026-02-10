import 'dotenv/config';
import express from 'express';
import { OpenAI } from 'openai';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema
} from '@modelcontextprotocol/sdk/types.js';

// Prefer PORT (Coolify default), fall back to MCP_SERVER_PORT, then 8000
const PORT = process.env.PORT || process.env.MCP_SERVER_PORT || 8000;
const HOST = process.env.MCP_SERVER_HOST || '0.0.0.0';
const MODEL = process.env.DEEP_RESEARCH_MODEL || 'o3-deep-research-2025-06-26';
const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
  console.error('OPENAI_API_KEY is required');
  process.exit(1);
}

const openai = new OpenAI({ apiKey, timeout: 600_000 });

const server = new Server(
  {
    name: 'deep-research-mcp-node',
    version: '0.2.0'
  },
  {
    capabilities: {
      tools: {},
      prompts: {},
      resources: {},
      logging: {}
    }
  }
);

// Advertise the single tool
server.setRequestHandler(ListToolsRequestSchema, () => ({
  tools: [
    {
      name: 'deep_research',
      description: 'Run OpenAI Deep Research with web search',
      inputSchema: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query']
      }
    }
  ]
}));

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  if (name !== 'deep_research') {
    throw new Error(`Unknown tool: ${name}`);
  }
  const query = (args && args.query) || '';

  // 1) Planner agent: derive sub-questions & sources
  const plannerSystem = `Du bist ein Planungs-Agent. Zerlege die Nutzerfrage in 3-6 präzise Teilfragen, fokussiere auf Fakten, Zahlen, Zeitangaben. Antworte als JSON mit keys: steps (array of strings), focus (short sentence). Keine Prosa.`;
  const planResp = await openai.responses.create({
    model: MODEL,
    input: [
      { role: 'system', content: [{ type: 'input_text', text: plannerSystem }] },
      { role: 'user', content: [{ type: 'input_text', text: query }] }
    ],
    reasoning: { summary: 'auto' },
    tools: [{ type: 'web_search_preview' }]
  });
  const plan = planResp.output_text ?? planResp.output ?? '';

  // 2) Research agent: execute with web search, use plan as context
  const researchSystem = `Du bist ein Senior Research Agent. Arbeite datenreich, nenne Zahlen, Jahreszahlen, Quellen. Gehe die Schritte ab, die im Plan stehen. Wenn du zitierst, gib Kurzquelle im Text (Name/Domain, Jahr). Antworte knapp in Abschnitten: Summary, Key Findings (Bullets), Sources.`;
  const researchResp = await openai.responses.create({
    model: MODEL,
    input: [
      { role: 'system', content: [{ type: 'input_text', text: researchSystem }] },
      {
        role: 'assistant',
        content: [{ type: 'input_text', text: `Plan: ${plan}` }]
      },
      { role: 'user', content: [{ type: 'input_text', text: query }] }
    ],
    reasoning: { summary: 'auto' },
    tools: [{ type: 'web_search_preview' }]
  });

  const answer = researchResp.output_text ?? researchResp.output ?? 'No output';
  return {
    content: [
      { type: 'text', text: answer },
      { type: 'text', text: `plan_run_id: ${planResp.id}` },
      { type: 'text', text: `research_run_id: ${researchResp.id}` }
    ]
  };
});

// SSE wiring
const sessions = new Map();
const app = express();

// Establish SSE session
app.get('/sse', async (req, res) => {
  // keep the connection alive
  req.socket.setKeepAlive(true);
  req.socket.setTimeout(0);
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Keep-Alive', 'timeout=120');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const transport = new SSEServerTransport('/message', res);
  await transport.start();
  await server.connect(transport);

  // Heartbeat to keep proxies happy
  const hb = setInterval(() => {
    try {
      res.write(':\n\n');
    } catch {
      clearInterval(hb);
    }
  }, 10000);

  sessions.set(transport.sessionId, { transport, hb });

  res.on('close', () => {
    clearInterval(hb);
    sessions.delete(transport.sessionId);
  });
});

// Receive POSTed messages from client
app.post('/message', (req, res) => {
  const sessionId = req.query.sessionId;
  const entry = sessions.get(sessionId);
  if (!entry) {
    res.status(404).end('unknown session');
    return;
  }
  entry.transport.handlePostMessage(req, res);
});

app.get('/', (_req, res) => {
  res.json({ status: 'ok', tools: ['deep_research'], transport: 'sse' });
});

app.listen(PORT, HOST, () => {
  console.log(`MCP SSE server listening on http://${HOST}:${PORT}/sse`);
});
