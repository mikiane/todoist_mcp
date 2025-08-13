import 'dotenv/config';
import express from 'express';
import fetch from 'node-fetch';
import crypto from 'crypto';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const TODOIST_TOKEN = process.env.TODOIST_TOKEN;
const SHARED        = process.env.MCP_SHARED_SECRET || null;
const ISSUER        = (process.env.ISSUER_BASE || '').replace(/\/$/, '');

const authCodes = new Map();
const tokens    = new Map();
const rand = (n=32)=>crypto.randomBytes(n).toString('hex');
const now  = ()=>Math.floor(Date.now()/1000);

/* ---------- ROUTES PUBLIQUES (PAS D'AUTH) ---------- */

// Root - GET pour vérification basique
app.get('/', (_req,res)=>res.json({ status:'ok', mcp:true }));

// Root - POST pour MCP discovery (ChatGPT envoie POST pour découvrir les outils)
app.post('/', (req,res)=>{
  // Log pour débugger ce que ChatGPT envoie
  console.log('POST / request:', JSON.stringify({
    headers: req.headers,
    body: req.body
  }, null, 2));
  
  // Si ChatGPT demande des méthodes spécifiques
  const { method } = req.body || {};
  
  if (method === 'tools/list') {
    // Réponse pour la liste des outils
    res.json({
      tools: [
        { 
          name:'search', 
          description:'Recherche des tâches Todoist',
          inputSchema: { 
            type:'object', 
            properties:{ query:{type:'string', description:'Texte à rechercher dans les tâches'} }, 
            required:['query'] 
          }
        },
        { 
          name:'fetch', 
          description:'Récupère une tâche Todoist par ID',
          inputSchema: { 
            type:'object', 
            properties:{ id:{type:'string', description:'ID de la tâche à récupérer'} }, 
            required:['id'] 
          }
        }
      ]
    });
  } else if (method === 'tools/call' && req.body.params) {
    // Gérer les appels d'outils directement
    const { name, arguments: args } = req.body.params || {};
    
    if (name === 'search') {
      handleSearch(args, res);
    } else if (name === 'fetch') {
      handleFetch(args, res);
    } else {
      res.status(404).json({ error: 'Tool not found' });
    }
  } else {
    // Réponse par défaut pour la découverte
    const tools = [
      { 
        name:'search', 
        description:'Recherche des tâches Todoist',
        inputSchema: { 
          type:'object', 
          properties:{ query:{type:'string', description:'Texte à rechercher dans les tâches'} }, 
          required:['query'] 
        }
      },
      { 
        name:'fetch', 
        description:'Récupère une tâche Todoist par ID',
        inputSchema: { 
          type:'object', 
          properties:{ id:{type:'string', description:'ID de la tâche à récupérer'} }, 
          required:['id'] 
        }
      }
    ];
    res.json({ 
      mcpVersion: '1.0.0',
      name: 'todoist-mcp',
      description: 'Connecteur MCP pour Todoist',
      tools,
      capabilities: {
        tools: true
      }
    });
  }
});

// Fonctions helper pour gérer les outils
async function handleSearch(args, res) {
  try {
    const { query } = args || {};
    if (!query) return res.status(400).json({ error:'query_required' });
    
    const r = await fetch('https://api.todoist.com/rest/v2/tasks', {
      headers:{ 'Authorization': `Bearer ${TODOIST_TOKEN}` }
    });
    const tasks = await r.json();
    const results = (Array.isArray(tasks)?tasks:[])
      .filter(t => (t.content||'').toLowerCase().includes(query.toLowerCase()))
      .map(t => ({ 
        id:String(t.id), 
        title:t.content, 
        text:t.description||'', 
        url:`https://todoist.com/showTask?id=${t.id}` 
      }));
    res.json({ result: results });
  } catch(e){ 
    res.status(500).json({ error:String(e) }); 
  }
}

async function handleFetch(args, res) {
  try {
    const { id } = args || {};
    if (!id) return res.status(400).json({ error:'id_required' });
    
    const r = await fetch(`https://api.todoist.com/rest/v2/tasks/${id}`, {
      headers:{ 'Authorization': `Bearer ${TODOIST_TOKEN}` }
    });
    if (!r.ok) return res.status(r.status).json(await r.json());
    
    const t = await r.json();
    res.json({ 
      result: {
        id:String(t.id), 
        title:t.content, 
        text:t.description||'', 
        url:`https://todoist.com/showTask?id=${t.id}`, 
        metadata:{ 
          project_id:t.project_id, 
          due:t.due 
        } 
      }
    });
  } catch(e){ 
    res.status(500).json({ error:String(e) }); 
  }
}

// 1) Découverte OAuth -> **200 + JSON** (plus JAMAIS 204)
app.get('/.well-known/oauth-authorization-server', (_req, res) => {
  if (!ISSUER) return res.status(500).json({ error: 'ISSUER_BASE missing' });
  res.json({
    issuer: ISSUER,
    authorization_endpoint: `${ISSUER}/oauth/authorize`,
    token_endpoint:         `${ISSUER}/oauth/token`,
    response_types_supported: ["code"],
    grant_types_supported:    ["authorization_code"],
    token_endpoint_auth_methods_supported: ["none","client_secret_post"],
    code_challenge_methods_supported: ["plain"]
  });
});

// 2) OAuth Authorize (auto-consent)
app.get('/oauth/authorize', (req,res)=>{
  const { client_id, redirect_uri, state, response_type, scope } = req.query;
  if (response_type !== 'code' || !client_id || !redirect_uri) {
    return res.status(400).send('invalid_request');
  }
  const code = rand(24);
  authCodes.set(code, { client_id, redirect_uri, scope: scope||'', exp: now()+300 });
  const u = new URL(redirect_uri);
  u.searchParams.set('code', code);
  if (state) u.searchParams.set('state', state);
  return res.redirect(302, u.toString());
});

// 3) OAuth Token (code -> access_token)
app.post('/oauth/token', (req,res)=>{
  const { grant_type, code, redirect_uri } = req.body || {};
  if (grant_type !== 'authorization_code' || !code) {
    return res.status(400).json({ error: 'unsupported_grant_type' });
  }
  const rec = authCodes.get(code);
  if (!rec) return res.status(400).json({ error: 'invalid_grant' });
  if (rec.exp < now()) { authCodes.delete(code); return res.status(400).json({ error: 'expired_code' }); }
  if (redirect_uri && redirect_uri !== rec.redirect_uri) {
    return res.status(400).json({ error: 'redirect_uri_mismatch' });
  }
  authCodes.delete(code);
  const access_token = rand(32);
  tokens.set(access_token, { scope: rec.scope, exp: now()+3600 });
  res.json({ access_token, token_type: 'Bearer', expires_in: 3600, scope: rec.scope||'' });
});

// Health
app.get('/healthz', (_req,res)=>res.json({ ok:true }));

// Routes pour les outils MCP (sans auth pour ChatGPT)
app.post('/tools/search', async (req,res)=>{
  try {
    const { query } = req.body || {};
    if (!query) return res.status(400).json({ error:'query_required' });
    
    const r = await fetch('https://api.todoist.com/rest/v2/tasks', {
      headers:{ 'Authorization': `Bearer ${TODOIST_TOKEN}` }
    });
    const tasks = await r.json();
    const results = (Array.isArray(tasks)?tasks:[])
      .filter(t => (t.content||'').toLowerCase().includes(query.toLowerCase()))
      .map(t => ({ 
        id:String(t.id), 
        title:t.content, 
        text:t.description||'', 
        url:`https://todoist.com/showTask?id=${t.id}` 
      }));
    res.json({ results });
  } catch(e){ 
    res.status(500).json({ error:String(e) }); 
  }
});

app.post('/tools/fetch', async (req,res)=>{
  try {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error:'id_required' });
    
    const r = await fetch(`https://api.todoist.com/rest/v2/tasks/${id}`, {
      headers:{ 'Authorization': `Bearer ${TODOIST_TOKEN}` }
    });
    if (!r.ok) return res.status(r.status).json(await r.json());
    
    const t = await r.json();
    res.json({ 
      result: {
        id:String(t.id), 
        title:t.content, 
        text:t.description||'', 
        url:`https://todoist.com/showTask?id=${t.id}`, 
        metadata:{ 
          project_id:t.project_id, 
          due:t.due 
        } 
      }
    });
  } catch(e){ 
    res.status(500).json({ error:String(e) }); 
  }
});

// 4) SSE (ouvert) — accepte GET & POST, reste OUVERT
function sseHandler(req, res) {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });
  const tools = [
    { name:'search', description:'Recherche des tâches Todoist',
      parameters:{ type:'object', properties:{ query:{type:'string'} }, required:['query'] } },
    { name:'fetch', description:'Récupère une tâche Todoist par ID',
      parameters:{ type:'object', properties:{ id:{type:'string'} }, required:['id'] } }
  ];
  res.write(`event: tools\ndata: ${JSON.stringify({ tools })}\n\n`);
  const t = setInterval(()=>res.write(`event: ping\ndata: {}\n\n`), 15000);
  req.on('close', ()=>clearInterval(t));
}
app.get(['/sse','/sse/'], sseHandler);
app.post(['/sse','/sse/'], sseHandler);

/* ---------- À PARTIR D’ICI : AUTH (Bearer + optionnel x-mcp-secret) ---------- */
app.use((req,res,next)=>{
  const h = req.headers.authorization || '';
  if (!h.startsWith('Bearer ')) return res.status(401).json({ error:'missing_token' });
  const token = h.slice(7);
  const rec = tokens.get(token);
  if (!rec) return res.status(401).json({ error:'invalid_token' });
  if (rec.exp < now()) { tokens.delete(token); return res.status(401).json({ error:'expired_token' }); }
  if (SHARED && req.headers['x-mcp-secret'] !== SHARED) return res.status(401).json({ error:'unauthorized' });
  next();
});

// Outils MCP “wrap” Todoist
app.post('/mcp/search', async (req,res)=>{
  try {
    const { query } = req.body || {};
    if (!query) return res.status(400).json({ error:'query_required' });
    const r = await fetch('https://api.todoist.com/rest/v2/tasks', {
      headers:{ 'Authorization': `Bearer ${TODOIST_TOKEN}` }
    });
    const tasks = await r.json();
    const results = (Array.isArray(tasks)?tasks:[])
      .filter(t => (t.content||'').toLowerCase().includes(query.toLowerCase()))
      .map(t => ({ id:String(t.id), title:t.content, text:t.description||'', url:`https://todoist.com/showTask?id=${t.id}` }));
    res.json(results);
  } catch(e){ res.status(500).json({ error:String(e) }); }
});

app.post('/mcp/fetch', async (req,res)=>{
  try {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error:'id_required' });
    const r = await fetch(`https://api.todoist.com/rest/v2/tasks/${id}`, {
      headers:{ 'Authorization': `Bearer ${TODOIST_TOKEN}` }
    });
    if (!r.ok) return res.status(r.status).json(await r.json());
    const t = await r.json();
    res.json({ id:String(t.id), title:t.content, text:t.description||'', url:`https://todoist.com/showTask?id=${t.id}`, metadata:{ project_id:t.project_id, due:t.due } });
  } catch(e){ res.status(500).json({ error:String(e) }); }
});

app.listen(process.env.PORT||8080, ()=>console.log('Todoist MCP + OAuth server ready'));
