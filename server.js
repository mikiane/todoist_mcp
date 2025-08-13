import express from "express";
import fetch from "node-fetch";
import 'dotenv/config';

const app = express();
app.use(express.json());

const TODOIST_TOKEN = process.env.TODOIST_TOKEN;
const SHARED = process.env.MCP_SHARED_SECRET;

// 1) Ouvrir les endpoints well-known (no auth)
app.get("/.well-known/oauth-authorization-server", (req, res) => {
  // Si tu n'implémentes pas OAuth, réponds 204 pour signaler "pas d’info"
  return res.status(204).end();
});
// (tu peux aussi ajouter un /healthz si tu veux)
app.get("/healthz", (req, res) => res.json({ ok: true }));

// 2) Middleware de protection pour le reste
app.use((req, res, next) => {
  // Laisse passer les chemins ouverts
  if (req.path === "/.well-known/oauth-authorization-server" || req.path === "/healthz") {
    return next();
  }
  // Exige le header secret ailleurs
  if (!SHARED || req.headers["x-mcp-secret"] !== SHARED) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
});

// 3) Tes routes métier
app.post("/create_task", async (req, res) => {
  const { content, project_id } = req.body || {};
  const r = await fetch("https://api.todoist.com/rest/v2/tasks", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${TODOIST_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ content, project_id })
  });
  res.status(r.status).json(await r.json());
});

app.get("/list_tasks", async (req, res) => {
  const r = await fetch("https://api.todoist.com/rest/v2/tasks", {
    headers: { "Authorization": `Bearer ${TODOIST_TOKEN}` }
  });
  res.status(r.status).json(await r.json());
});

app.listen(process.env.PORT || 8080, () => console.log("MCP connector for Todoist running"));
