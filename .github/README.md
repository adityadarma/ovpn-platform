# GitHub Actions Setup

This directory contains GitHub Actions workflows for CI/CD.

## 📁 Workflows

### docker-publish.yml
Builds and publishes Docker images to GitHub Container Registry.

**Triggers:**
- Push to `main` or `develop` branches
- Version tags (e.g., `v1.0.0`)
- Pull requests to `main`
- Manual workflow dispatch

**Images Published:**
- `ghcr.io/adityadarma/ovpn-platform:api`
- `ghcr.io/adityadarma/ovpn-platform:web`
- `ghcr.io/adityadarma/ovpn-platform:agent`

## 🚀 Quick Setup

1. **Enable workflow permissions:**
   - Go to Settings → Actions → General
   - Under "Workflow permissions", select "Read and write permissions"
   - Save

2. **Push to trigger build:**
   ```bash
   git push origin main
   ```

3. **Check build status:**
   - Go to Actions tab
   - View workflow runs

## 📚 Full Documentation

See the [workflow file](.github/workflows/docker-publish.yml) for complete CI/CD configuration.
