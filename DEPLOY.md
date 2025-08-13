# Guide de déploiement sur Google Cloud Run

Ce guide explique comment déployer le connecteur MCP Todoist sur Google Cloud Run.

## Prérequis

1. **Compte Google Cloud Platform** avec un projet actif
2. **Google Cloud CLI** (`gcloud`) installé et configuré
3. **Token API Todoist** (obtenir sur [Todoist Developer](https://todoist.com/app/settings/integrations/developer))
4. **Git** installé

## Étapes de déploiement

### 1. Configuration initiale

```bash
# Se connecter à Google Cloud
gcloud auth login

# Définir le projet (remplacer YOUR_PROJECT_ID par votre ID de projet)
gcloud config set project YOUR_PROJECT_ID

# Activer les APIs nécessaires
gcloud services enable run.googleapis.com
gcloud services enable cloudbuild.googleapis.com
gcloud services enable secretmanager.googleapis.com
```

### 2. Configuration des secrets

```bash
# Créer le secret pour le token Todoist
echo -n "YOUR_TODOIST_TOKEN" | gcloud secrets create TODOIST_TOKEN --data-file=-

# (Optionnel) Créer le secret pour MCP_SHARED_SECRET
echo -n "YOUR_SECRET_KEY" | gcloud secrets create MCP_SHARED_SECRET --data-file=-

# Donner les permissions au compte de service Cloud Run
gcloud secrets add-iam-policy-binding TODOIST_TOKEN \
  --member="serviceAccount:YOUR_PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

### 3. Déploiement initial

```bash
# Cloner le repository
git clone https://github.com/mikiane/todoist_mcp.git
cd todoist_mcp

# Déployer sur Cloud Run
gcloud run deploy todoist-mcp \
  --source . \
  --region europe-west1 \
  --allow-unauthenticated \
  --set-secrets="TODOIST_TOKEN=TODOIST_TOKEN:latest" \
  --set-env-vars="ISSUER_BASE=https://todoist-mcp-YOUR_PROJECT_NUMBER.europe-west1.run.app"
```

### 4. Configuration automatique du déploiement (CI/CD)

#### Option A : Via Cloud Build Triggers (Recommandé)

1. Aller sur [Cloud Build Triggers](https://console.cloud.google.com/cloud-build/triggers)
2. Cliquer sur "Create Trigger"
3. Configurer :
   - **Name** : `todoist-mcp-deploy`
   - **Event** : Push to a branch
   - **Source** : Connecter votre repo GitHub
   - **Branch** : `^main$`
   - **Build Configuration** : Cloud Build configuration file
   - **Location** : `/cloudbuild.yaml`

4. Créer le fichier `cloudbuild.yaml` :

```yaml
steps:
  - name: 'gcr.io/cloud-builders/docker'
    args: ['build', '-t', 'gcr.io/$PROJECT_ID/todoist-mcp', '.']
  
  - name: 'gcr.io/cloud-builders/docker'
    args: ['push', 'gcr.io/$PROJECT_ID/todoist-mcp']
  
  - name: 'gcr.io/cloud-builders/gcloud'
    args:
      - 'run'
      - 'deploy'
      - 'todoist-mcp'
      - '--image=gcr.io/$PROJECT_ID/todoist-mcp'
      - '--region=europe-west1'
      - '--platform=managed'
      - '--allow-unauthenticated'
      - '--set-secrets=TODOIST_TOKEN=TODOIST_TOKEN:latest'
      - '--set-env-vars=ISSUER_BASE=https://todoist-mcp-${_PROJECT_NUMBER}.europe-west1.run.app'

timeout: '1200s'
```

#### Option B : GitHub Actions

Créer `.github/workflows/deploy.yml` :

```yaml
name: Deploy to Cloud Run

on:
  push:
    branches: [ main ]

env:
  PROJECT_ID: YOUR_PROJECT_ID
  SERVICE: todoist-mcp
  REGION: europe-west1

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - uses: google-github-actions/auth@v1
      with:
        credentials_json: ${{ secrets.GCP_SA_KEY }}
    
    - uses: google-github-actions/setup-gcloud@v1
    
    - name: Build and Push Container
      run: |-
        gcloud builds submit --tag gcr.io/$PROJECT_ID/$SERVICE
    
    - name: Deploy to Cloud Run
      run: |-
        gcloud run deploy $SERVICE \
          --image gcr.io/$PROJECT_ID/$SERVICE \
          --region $REGION \
          --platform managed \
          --allow-unauthenticated \
          --set-secrets="TODOIST_TOKEN=TODOIST_TOKEN:latest" \
          --set-env-vars="ISSUER_BASE=https://$SERVICE-YOUR_PROJECT_NUMBER.$REGION.run.app"
```

### 5. Variables d'environnement

Le service nécessite les variables suivantes :

| Variable | Description | Requis |
|----------|-------------|--------|
| `TODOIST_TOKEN` | Token API Todoist | ✅ |
| `ISSUER_BASE` | URL de base du service (sans slash final) | ✅ |
| `MCP_SHARED_SECRET` | Secret partagé pour sécurité supplémentaire | ❌ |
| `PORT` | Port du serveur (par défaut: 8080) | ❌ |

### 6. Mise à jour des variables après déploiement

```bash
# Obtenir l'URL du service
SERVICE_URL=$(gcloud run services describe todoist-mcp \
  --region=europe-west1 \
  --format='value(status.url)')

# Mettre à jour ISSUER_BASE
gcloud run services update todoist-mcp \
  --region=europe-west1 \
  --update-env-vars="ISSUER_BASE=$SERVICE_URL"
```

### 7. Vérification du déploiement

```bash
# Vérifier le statut
gcloud run services describe todoist-mcp --region=europe-west1

# Tester l'endpoint
curl -X POST $SERVICE_URL \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "initialize",
    "id": 1,
    "params": {
      "protocolVersion": "2025-03-26",
      "capabilities": {},
      "clientInfo": {
        "name": "test",
        "version": "1.0.0"
      }
    }
  }'
```

### 8. Monitoring et logs

```bash
# Voir les logs en temps réel
gcloud logging tail 'resource.type="cloud_run_revision" \
  AND resource.labels.service_name="todoist-mcp"' \
  --project=YOUR_PROJECT_ID

# Voir les métriques
gcloud monitoring dashboards list --filter="displayName:todoist-mcp"
```

## Configuration dans ChatGPT

1. Aller dans **ChatGPT → Settings → Connectors**
2. Cliquer sur **Create new connector**
3. Entrer l'URL : `https://todoist-mcp-YOUR_PROJECT_NUMBER.europe-west1.run.app`
4. Le connecteur devrait se configurer automatiquement

## Dépannage

### Erreur "Service not found"
```bash
# Vérifier que le service existe
gcloud run services list --region=europe-west1
```

### Erreur "Permission denied"
```bash
# Vérifier les permissions IAM
gcloud run services get-iam-policy todoist-mcp --region=europe-west1
```

### Erreur "Secret not found"
```bash
# Lister les secrets
gcloud secrets list

# Recréer le secret si nécessaire
echo -n "YOUR_TOKEN" | gcloud secrets create TODOIST_TOKEN --data-file=-
```

### Logs d'erreur
```bash
# Voir les dernières erreurs
gcloud logging read 'severity=ERROR AND resource.labels.service_name="todoist-mcp"' \
  --limit=10 \
  --format=json
```

## Sécurité

### Recommandations

1. **Utiliser les secrets** : Ne jamais mettre les tokens en clair dans le code
2. **Activer MCP_SHARED_SECRET** : Pour une couche de sécurité supplémentaire
3. **Limiter les accès** : Utiliser `--no-allow-unauthenticated` si possible
4. **Auditer régulièrement** : Vérifier les logs d'accès

### Configuration sécurisée
```bash
# Déployer avec authentification requise
gcloud run deploy todoist-mcp \
  --source . \
  --region europe-west1 \
  --no-allow-unauthenticated \
  --set-secrets="TODOIST_TOKEN=TODOIST_TOKEN:latest,MCP_SHARED_SECRET=MCP_SHARED_SECRET:latest"

# Autoriser uniquement certains comptes
gcloud run services add-iam-policy-binding todoist-mcp \
  --member="user:email@example.com" \
  --role="roles/run.invoker" \
  --region=europe-west1
```

## Maintenance

### Mise à jour du service
```bash
# Après des modifications du code
git add .
git commit -m "Description des changements"
git push origin main

# Le déploiement automatique se déclenchera si configuré
```

### Rollback
```bash
# Lister les révisions
gcloud run revisions list --service=todoist-mcp --region=europe-west1

# Revenir à une révision précédente
gcloud run services update-traffic todoist-mcp \
  --to-revisions=todoist-mcp-00015-abc=100 \
  --region=europe-west1
```

## Support

Pour toute question ou problème :
- Ouvrir une issue sur [GitHub](https://github.com/mikiane/todoist_mcp)
- Consulter les [logs Cloud Run](#monitoring-et-logs)
