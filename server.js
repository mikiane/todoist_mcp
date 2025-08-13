import express from "express";
import fetch from "node-fetch";
import 'dotenv/config';

const app = express();
app.use(express.json());

const TODOIST_TOKEN = process.env.TODOIST_TOKEN;
const SHARED_SECRET = process.env.MCP_SHARED_SECRET;

// Middleware d’auth pour tout sauf / et /.well-known/*
app.use((req, res, next) => {
  const publicPaths = ["/", "/.well-known/oauth-authorization-server", "/sse/"];
  if (publicPaths.includes(req.path)) {
    return next();
  }
  if (!SHARED_SECRET || req.headers["x-mcp-secret"] !== SHARED_SECRET) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
});

// Endpoint racine pour le handshake
app.get("/", (req, res) => {
  res.json({ status: "ok", mcp: true });
});

// Endpoint SSE : ChatGPT se connecte ici pour dialoguer avec le MCP
app.get("/sse/", (req, res) => {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive"
  });

  // Déclaration des outils MCP
  const tools = [
    {
      name: "search",
      description: "Recherche des tâches dans Todoist",
      parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] }
    },
    {
      name: "fetch",
      description: "Récupère le contenu complet d’une tâche Todoist",
      parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"] }
    }
  ];

  // Envoi initial des outils disponibles
  res.write(`event: tools\ndata: ${JSON.stringify({ tools })}\n\n`);

  // Simule un flux SSE où on pourrait aussi recevoir des requêtes
  // (dans un vrai MCP, il faudrait parser les messages entrants et répondre en conséquence)
});

// Implémentation REST derrière les outils MCP
app.post("/mcp/search", async (req, res) => {
  const { query } = req.body;
  const r = await fetch("https://api.todoist.com/rest/v2/tasks", {
    headers: { "Authorization": `Bearer ${TODOIST_TOKEN}` }
  });
  const tasks = await r.json();
  const results = tasks
    .filter(t => t.content.toLowerCase().includes(query.toLowerCase()))
    .map(t => ({
      id: t.id.toString(),
      title: t.content,
      text: t.description || "",
      url: `https://todoist.com/showTask?id=${t.id}`
    }));
  res.json(results);
});

app.post("/mcp/fetch", async (req, res) => {
  const { id } = req.body;
  const r = await fetch(`https://api.todoist.com/rest/v2/tasks/${id}`, {
    headers: { "Authorization": `Bearer ${TODOIST_TOKEN}` }
  });
  const t = await r.json();
  res.json({
    id: t.id.toString(),
    title: t.content,
    text: t.description || "",
    url: `https://todoist.com/showTask?id=${t.id}`,
    metadata: { due: t.due }
  });
});

app.listen(process.env.PORT || 8080, () => {
  console.log("Todoist MCP server running on port", process.env.PORT || 8080);
});
