# Deployment — Railway

## Environment variables
Set these in the Railway dashboard (never commit to repo):
- OPENAI_API_KEY
- SESSION_SECRET
- JIRA_CLIENT_ID
- JIRA_CLIENT_SECRET
- CONFLUENCE_CLIENT_ID (if separate)
- CONFLUENCE_CLIENT_SECRET (if separate)
- PORT (Railway sets this automatically)
- NODE_ENV=production

## Persistent volume
Mount a Railway volume at /app/data
This persists sessions.db and connection tokens across deploys.
Without this volume, all sessions are lost on redeploy.

## Deploy steps
1. Connect the GitHub repo to Railway
2. Set all env vars above in Railway dashboard
3. Add a volume mounted at /app/data
4. Railway auto-deploys on push to main

## Local Docker test
cd discovery-intake-webapp
docker build -t discovery-studio .
docker run -p 3000:3000 --env-file .env -v $(pwd)/data:/app/data discovery-studio
