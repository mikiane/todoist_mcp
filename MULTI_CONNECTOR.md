# Guide pour créer un connecteur multi-services

## Option 1 : Étendre le connecteur Todoist actuel

Vous pouvez ajouter les fonctionnalités Gmail et Google Calendar à votre connecteur Todoist existant.

### Modifications à apporter dans server.js

```javascript
// Ajouter ces outils dans la méthode 'tools/list'
case 'tools/list':
  res.json({
    jsonrpc: '2.0',
    id,
    result: {
      tools: [
        // Outils Todoist existants
        { 
          name: 'search', 
          description: 'Recherche des tâches Todoist',
          inputSchema: { ... }
        },
        { 
          name: 'fetch', 
          description: 'Récupère une tâche Todoist par ID',
          inputSchema: { ... }
        },
        // Nouveaux outils Gmail
        {
          name: 'gmail_search',
          description: 'Recherche des emails dans Gmail',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Requête de recherche Gmail'
              }
            },
            required: ['query']
          }
        },
        {
          name: 'gmail_send',
          description: 'Envoyer un email via Gmail',
          inputSchema: {
            type: 'object',
            properties: {
              to: { type: 'string', description: 'Destinataire' },
              subject: { type: 'string', description: 'Sujet' },
              body: { type: 'string', description: 'Corps du message' }
            },
            required: ['to', 'subject', 'body']
          }
        },
        // Nouveaux outils Google Calendar
        {
          name: 'calendar_list',
          description: 'Lister les événements du calendrier',
          inputSchema: {
            type: 'object',
            properties: {
              timeMin: { type: 'string', description: 'Date de début (ISO 8601)' },
              timeMax: { type: 'string', description: 'Date de fin (ISO 8601)' }
            }
          }
        },
        {
          name: 'calendar_create',
          description: 'Créer un événement dans le calendrier',
          inputSchema: {
            type: 'object',
            properties: {
              summary: { type: 'string', description: 'Titre de l\'événement' },
              start: { type: 'string', description: 'Date/heure de début' },
              end: { type: 'string', description: 'Date/heure de fin' }
            },
            required: ['summary', 'start', 'end']
          }
        }
      ]
    }
  });
  break;
```

### Variables d'environnement nécessaires

```bash
# Todoist (existant)
TODOIST_TOKEN=your_todoist_token

# Google APIs (à ajouter)
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_REFRESH_TOKEN=your_refresh_token
```

### Dépendances à ajouter

```bash
npm install googleapis
```

## Option 2 : Utiliser un proxy/gateway

Créer un service gateway qui route vers différents connecteurs :

```javascript
// gateway-server.js
app.post('/', async (req, res) => {
  const { method, params } = req.body;
  
  if (method === 'tools/call') {
    const { name } = params;
    
    // Router vers le bon service
    if (name.startsWith('todoist_')) {
      // Appeler le service Todoist
      const response = await fetch('https://todoist-service.run.app/', {
        method: 'POST',
        body: JSON.stringify(req.body),
        headers: { 'Content-Type': 'application/json' }
      });
      res.json(await response.json());
    } else if (name.startsWith('gmail_')) {
      // Appeler le service Gmail
      // ...
    } else if (name.startsWith('calendar_')) {
      // Appeler le service Calendar
      // ...
    }
  }
});
```

## Option 3 : Rotation des connecteurs

Créer des "profils" de connecteurs que vous activez selon vos besoins :

1. **Profil Productivité** : Todoist + Calendar
2. **Profil Communication** : Gmail + Slack
3. **Profil Complet** : Tous les services (mais limité à 3)

## Recommandation

La **meilleure approche** est d'étendre votre connecteur Todoist actuel pour inclure Gmail et Calendar. Cela vous permet d'avoir tous vos outils dans un seul connecteur, évitant ainsi la limite de 3 connecteurs.

### Avantages :
- Un seul connecteur à maintenir
- Pas de problème de limite
- Intégration plus fluide entre les services
- Possibilité de créer des actions combinées (ex: créer une tâche Todoist depuis un email)

### Étapes suivantes :
1. Installer les dépendances Google APIs
2. Configurer l'authentification OAuth2 pour Google
3. Ajouter les nouveaux endpoints dans server.js
4. Déployer la version mise à jour
5. Recréer le connecteur dans ChatGPT avec toutes les fonctionnalités
