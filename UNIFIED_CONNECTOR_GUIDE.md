# Guide : Créer un connecteur unifié Todoist + Gmail + Calendar

## 1. Installation des dépendances

```bash
npm install googleapis google-auth-library
```

## 2. Configuration OAuth2 Google

### Étape 1 : Créer les credentials Google
1. Aller sur [Google Cloud Console](https://console.cloud.google.com)
2. Créer un nouveau projet ou sélectionner un existant
3. Activer les APIs : Gmail API et Google Calendar API
4. Créer des credentials OAuth2
5. Ajouter les scopes nécessaires :
   - `https://www.googleapis.com/auth/gmail.modify`
   - `https://www.googleapis.com/auth/calendar`

### Étape 2 : Variables d'environnement
```env
# Todoist
TODOIST_TOKEN=your_todoist_token

# Google OAuth2
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_REDIRECT_URI=https://your-service.run.app/oauth/callback

# Si vous avez déjà un refresh token
GOOGLE_REFRESH_TOKEN=your_refresh_token
```

## 3. Structure du code

### Initialisation des clients

```javascript
import { google } from 'googleapis';

// Client OAuth2
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// Si vous avez un refresh token
if (process.env.GOOGLE_REFRESH_TOKEN) {
  oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN
  });
}

// Clients API
const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
```

### Handlers pour Gmail

```javascript
async function handleGmailSearch(args, id, res) {
  try {
    const { query, maxResults = 10 } = args;
    
    const response = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults
    });
    
    const messages = await Promise.all(
      (response.data.messages || []).map(async (msg) => {
        const details = await gmail.users.messages.get({
          userId: 'me',
          id: msg.id
        });
        
        const headers = details.data.payload.headers;
        return {
          id: msg.id,
          subject: headers.find(h => h.name === 'Subject')?.value,
          from: headers.find(h => h.name === 'From')?.value,
          date: headers.find(h => h.name === 'Date')?.value,
          snippet: details.data.snippet
        };
      })
    );
    
    res.json({
      jsonrpc: '2.0',
      id,
      result: { content: messages }
    });
  } catch (error) {
    res.json({
      jsonrpc: '2.0',
      id,
      error: {
        code: -32603,
        message: 'Gmail search failed',
        data: error.message
      }
    });
  }
}
```

### Handlers pour Calendar

```javascript
async function handleCalendarListEvents(args, id, res) {
  try {
    const { timeMin, timeMax, calendarId = 'primary' } = args;
    
    const response = await calendar.events.list({
      calendarId,
      timeMin: timeMin || new Date().toISOString(),
      timeMax: timeMax || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      singleEvents: true,
      orderBy: 'startTime'
    });
    
    const events = (response.data.items || []).map(event => ({
      id: event.id,
      summary: event.summary,
      start: event.start.dateTime || event.start.date,
      end: event.end.dateTime || event.end.date,
      location: event.location,
      description: event.description
    }));
    
    res.json({
      jsonrpc: '2.0',
      id,
      result: { content: events }
    });
  } catch (error) {
    res.json({
      jsonrpc: '2.0',
      id,
      error: {
        code: -32603,
        message: 'Calendar list failed',
        data: error.message
      }
    });
  }
}
```

## 4. Déploiement

### Mettre à jour cloudbuild.yaml
```yaml
steps:
  - name: 'gcr.io/cloud-builders/docker'
    args: ['build', '-t', 'gcr.io/$PROJECT_ID/unified-connector', '.']
  
  - name: 'gcr.io/cloud-builders/docker'
    args: ['push', 'gcr.io/$PROJECT_ID/unified-connector']
  
  - name: 'gcr.io/cloud-builders/gcloud'
    args:
      - 'run'
      - 'deploy'
      - 'unified-connector'
      - '--image=gcr.io/$PROJECT_ID/unified-connector'
      - '--region=europe-west1'
      - '--platform=managed'
      - '--allow-unauthenticated'
      - '--set-secrets=TODOIST_TOKEN=TODOIST_TOKEN:latest,GOOGLE_CLIENT_ID=GOOGLE_CLIENT_ID:latest,GOOGLE_CLIENT_SECRET=GOOGLE_CLIENT_SECRET:latest,GOOGLE_REFRESH_TOKEN=GOOGLE_REFRESH_TOKEN:latest'
      - '--set-env-vars=ISSUER_BASE=https://unified-connector-$PROJECT_NUMBER.europe-west1.run.app'
```

## 5. Test du connecteur unifié

```bash
# Tester un outil Todoist
curl -X POST https://your-service.run.app/ \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "id": 1,
    "params": {
      "name": "todoist_search",
      "arguments": {"query": "meeting"}
    }
  }'

# Tester Gmail
curl -X POST https://your-service.run.app/ \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "id": 2,
    "params": {
      "name": "gmail_search",
      "arguments": {"query": "from:important@example.com"}
    }
  }'
```

## 6. Avantages du connecteur unifié

✅ **Un seul connecteur** = pas de limite de 3 connecteurs
✅ **Intégration croisée** possible (créer une tâche depuis un email)
✅ **Maintenance simplifiée**
✅ **Performance optimisée**
✅ **Gestion unifiée des erreurs**

## 7. Migration depuis les connecteurs séparés

1. Implémenter tous les outils dans le nouveau connecteur
2. Tester chaque fonctionnalité
3. Déployer le connecteur unifié
4. Dans ChatGPT : supprimer les anciens connecteurs
5. Ajouter le nouveau connecteur unifié

## Notes importantes

- Les tokens Google expirent, implémentez le refresh automatique
- Respectez les quotas API de chaque service
- Loggez les erreurs pour faciliter le debug
- Considérez un cache pour les requêtes fréquentes
