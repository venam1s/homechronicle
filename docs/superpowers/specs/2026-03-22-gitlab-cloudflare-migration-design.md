# Migration: GitHub → GitLab + Cloudflare Pages + Docker Hub

**Date:** 2026-03-22
**Status:** Active
**Goal:** Migrate hosting while GitHub account is suspended; keep return path easy.

## 1. Source Code → GitLab

- Create `gitlab.com/havuq/homechronicle` project
- Push all branches and tags: `git push gitlab --all --tags`
- Keep `.github/workflows/` in the repo untouched for easy return
- Update Dockhand remote URL to point at GitLab

## 2. Static Site (homechronicle.net) → Cloudflare Pages

- Connect GitLab repo to Cloudflare Pages
- Build config: no build command, output directory = `docs/`
- Custom domain: `homechronicle.net` (DNS already on Cloudflare — auto-configured)
- Keep `docs/CNAME` file (harmless on Pages, needed if returning to GitHub Pages)

## 3. Container Images → Docker Hub

Namespace change (Docker Hub doesn't support nested paths):

| Current (GHCR) | New (Docker Hub) |
|---|---|
| `ghcr.io/havuq/homechronicle/listener` | `havuq/homechronicle-listener` |
| `ghcr.io/havuq/homechronicle/web` | `havuq/homechronicle-web` |
| `ghcr.io/havuq/homechronicle/standalone` | `havuq/homechronicle-standalone` |

Files to update:
- `docker-compose.yml` — default image values
- `docker-compose.portainer.yml` — if it references GHCR
- `docs/docker-compose.example.yml` — user-facing docs
- `.env.example` — add `IMAGE_REGISTRY` prefix variable

## 4. CI → GitLab CI (`.gitlab-ci.yml`)

### Test stage (replaces `ci.yml`)
- Trigger: merge requests to `main`
- Node 20, `npm ci` + `npm test` for listener and web

### Build + push stage (replaces `docker.yml`)
- Trigger: tags matching `v*`
- Build listener, web, standalone images
- Trivy scan (CRITICAL/HIGH)
- Push to Docker Hub
- Tag strategy:
  - Beta tags (`v*-beta.*`): push `X.Y.Z-beta.N` + `beta`
  - Stable tags (`vX.Y.Z`): push `X.Y.Z` + `X.Y` + `X` + `latest`
- Release validation: monotonic version check (ported from GitHub Actions script)
- Skip standalone image for beta releases (save build minutes)

### SAST stage (replaces `codeql.yml`)
- GitLab built-in SAST template (free, runs on default branch + MRs)

### Container cleanup (replaces `cleanup-containers.yml`)
- Not needed on Docker Hub — manage tag retention via Hub settings or scheduled pipeline

## 5. Reversibility Strategy

- `.github/workflows/` stays in the repo — re-enable by switching remote
- `IMAGE_REGISTRY` env var in compose files: switch between `havuq/homechronicle-` (Docker Hub) and `ghcr.io/havuq/homechronicle/` (GHCR)
- `docs/CNAME` retained for GitHub Pages compatibility
- GitLab CI and GitHub Actions coexist — each only runs on its own platform
