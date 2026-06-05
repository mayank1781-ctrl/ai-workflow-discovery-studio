# Personal GitHub Upload Steps

Use this when uploading the sanitized AI Workflow Discovery Studio package to a personal GitHub account before moving it into a work GitHub or GitHub Enterprise environment.

## Recommended Repository Settings

- Repository name: `ai-workflow-discovery-studio`
- Visibility: private
- Initialize with README: no
- Add .gitignore: no
- Add license: no

This package already includes the app, docs, `.gitignore`, enterprise setup notes, and validation scripts.

## Command-Line Upload

From the root of this folder:

```bash
git status
git branch -M main
git remote add origin https://github.com/<your-github-username>/ai-workflow-discovery-studio.git
git push -u origin main
```

If `origin` already exists, replace it with the correct repository URL:

```bash
git remote set-url origin https://github.com/<your-github-username>/ai-workflow-discovery-studio.git
git push -u origin main
```

## GitHub Desktop Upload

If command-line authentication is inconvenient:

1. Open GitHub Desktop.
2. Choose **File > Add Local Repository**.
3. Select this folder.
4. Choose **Publish repository**.
5. Keep the repository private.
6. Use `ai-workflow-discovery-studio` as the repository name.

## Before Sharing

Confirm the repository does not contain:

- `discovery-intake-webapp/.env.local`
- `discovery-intake-webapp/data/`
- `node_modules/`
- API keys, Microsoft client secrets, GitHub tokens, or local machine paths

The included checks are:

```bash
node scripts/check-work-environment-readiness.mjs
node scripts/check-enterprise-transfer-kit.mjs
```

## Work Environment Path

After the personal repository is uploaded, the preferred enterprise path is:

1. Create an approved private repository in the work GitHub organization.
2. Push this same package to that work repository.
3. Configure branch protection and required checks.
4. Keep secrets out of Git; use approved environment variables or GitHub Actions secrets only after review.
5. Follow `WORK_ENVIRONMENT_STANDUP_RUNBOOK.md` and `CODEX_WORK_COMPUTER_HANDOFF.md` on the work computer.
