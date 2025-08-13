import express from "express";
import fetch from "node-fetch";
import 'dotenv/config';


const app = express();
app.use(express.json());

const TODOIST_TOKEN = process.env.TODOIST_TOKEN; // récupéré depuis Cloud Run

// Commande MCP : Créer une tâche
app.post("/create_task", async (req, res) => {
  const { content, project_id } = req.body;
  const r = await fetch("https://api.todoist.com/rest/v2/tasks", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${TODOIST_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ content, project_id })
  });
  res.json(await r.json());
});

// Commande MCP : Lister les tâches
app.get("/list_tasks", async (req, res) => {
  const r = await fetch("https://api.todoist.com/rest/v2/tasks", {
    headers: { "Authorization": `Bearer ${TODOIST_TOKEN}` }
  });
  res.json(await r.json());
});

// Cloud Run écoute sur le port 8080
app.listen(process.env.PORT || 8080, () =>
  console.log("MCP connector for Todoist running")
);

app.use((req,res,next)=>{
    const s = process.env.MCP_SHARED_SECRET;
    if (!s || req.headers['x-mcp-secret'] !== s) {
      return res.status(401).json({error:'unauthorized'});
    }
    next();
  });
  