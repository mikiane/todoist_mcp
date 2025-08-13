# Todoist MCP Connector

Un connecteur MCP (Model Context Protocol) pour intégrer Todoist avec ChatGPT.

## Fonctionnalités

- **Recherche de tâches** : Recherchez des tâches dans votre compte Todoist
- **Récupération de tâches** : Obtenez les détails d'une tâche spécifique par son ID

## Déploiement sur Google Cloud Run

### Prérequis

1. Un compte Google Cloud Platform
2. Un token API Todoist (obtenir sur [Todoist Settings](https://todoist.com/app/settings/integrations/developer))
3. Google Cloud CLI installé

### Configuration

1. Clonez ce repository
2. Configurez les variables d'environnement dans Google Cloud Run :
   - `TODOIST_TOKEN` : Votre token API Todoist (requis)
   - `ISSUER_BASE` : L'URL de votre service Cloud Run (requis)
   - `MCP_SHARED_SECRET` : Secret partagé pour sécurité (optionnel)

### Déploiement

```bash
# Se connecter à Google Cloud
gcloud auth login

# Configurer le projet
gcloud config set project YOUR_PROJECT_ID

# Construire et déployer
gcloud run deploy todoist-mcp \
  --source . \
  --region europe-west1 \
  --allow-unauthenticated \
  --set-env-vars TODOIST_TOKEN=your_token,ISSUER_BASE=https://your-service-url.run.app
```

## Configuration dans ChatGPT

1. Allez dans ChatGPT → Paramètres → Connecteurs
2. Créez un nouveau connecteur MCP
3. URL : `https://your-service-url.run.app`
4. Le connecteur devrait se configurer automatiquement

## Endpoints

- `POST /` : Découverte MCP et gestion des appels d'outils
- `GET /.well-known/oauth-authorization-server` : Configuration OAuth
- `POST /tools/search` : Recherche de tâches
- `POST /tools/fetch` : Récupération d'une tâche
- `GET|POST /sse/` : Stream d'événements Server-Sent Events

## Architecture

Le serveur utilise Express.js et implémente le protocole MCP pour permettre à ChatGPT d'interagir avec l'API Todoist. Les requêtes sont gérées sans authentification pour les outils publics, avec une option d'OAuth pour les fonctionnalités avancées.

## Développement local

```bash
# Installer les dépendances
npm install

# Créer un fichier .env avec vos variables
cp .env.example .env

# Lancer le serveur
npm start
```

Le serveur démarre sur http://localhost:8080

## Licence

MIT
