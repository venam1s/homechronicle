# CI move: GitLab CI → GitHub Actions

Status as of 2026-11-17. The code, issues and releases live on
[github.com/venam1s/homechronicle](https://github.com/venam1s/homechronicle);
CI still runs on GitLab (`.gitlab-ci.yml`, project `havuq/homechronicle`) on the
homelab runner on the NUC. This document tracks moving CI to GitHub Actions
without a gap in test coverage, beta deploys or releases.

## Why a self-hosted runner, not GitHub-hosted

The previous GitHub account's suspension most likely came from heavy hosted-runner
use. The homelab NUC already runs the GitLab runner and has the Docker daemon,
QEMU and LAN access to Dockhand that the beta deploy needs, so the GitHub runner
runs there too. The one hosted workflow kept is CodeQL (`codeql.yml`), weekly.

Running untrusted code is the cost of a self-hosted runner on a public repo: a
pull request from a fork executes whatever it contains. The repository's Actions
setting **"Require approval for all outside collaborators"** must stay on, and
the runner is never given a `pull_request_target` workflow.

## What exists now

| Piece | State |
|---|---|
| Runner | `hc-github-runner` stack on the NUC (`/data/stacks/hc-github-runner/compose.yaml`, image `myoung34/github-runner`, labels `self-hosted, nuc, homelab`). Its state and work dirs, and the runner's `externals/` (the bundled Node that actions run with), are bind-mounted at identical host paths: job containers are created through the host Docker socket and the runner hands them host paths, so a path that exists only inside the runner container mounts as empty. Registered to the repo. |
| `.github/workflows/ci.yml` | Port of `test`, `boot-smoke`, `deploy-beta`. Runs on push to `main`, pull requests, `workflow_dispatch`, and as a reusable workflow (`workflow_call`) for the release gate. Jobs run in `node:20-alpine` with `--cpus 2 --memory 2g`, matching the GitLab runner's caps. `deploy-beta` is gated on the repository variable `BETA_DEPLOY_FROM_GITHUB=true`. |
| `.github/workflows/release.yml` | Port of `validate-release`, `build-*`, `create-release`. Runs on `v*` tag pushes and `workflow_dispatch` (rebuild an existing tag). Builds `listener`, `web` and, for stable tags, `standalone` to Docker Hub with the same tag set (`version`, `major.minor`, `major`, `latest`; betas get `version`, `beta`), then creates the GitHub release via `scripts/github-release.mjs` with notes that `scripts/release-notes.mjs` builds from the `## [version]` section of `CHANGELOG.md` (a beta publishes the in-progress `— Unreleased` section behind a generated header, so beta notes are cumulative since the last GA; the stable release drops the section's `### Beta notes`). Every job is gated on the repository variable `RELEASES_FROM_GITHUB=true`. |
| `.github/actionlint.yaml` | Declares the custom runner labels so `actionlint` passes. |
| Removed | `docker.yml` (release-event trigger, pushed to GHCR, GA lock), `cache-maintenance.yml`, `cleanup-containers.yml`: GitHub-era workflows that would have misfired on hosted runners once Actions is enabled. |

The GitLab pipeline is unchanged and remains the CI of record. The GitHub
workflows cannot deploy or publish anything until the two variables are set, so
enabling Actions only adds a second, parallel test run on the same host.

## Cutover (done 2026-11-18)

GitHub Actions is the CI of record. `.gitlab-ci.yml` is deleted and the GitLab
runner stack on the NUC is stopped. What changed, in order:

1. **Actions enabled** with `allowed_actions=all` and fork-PR approval
   `all_external_contributors`. Two `ci.yml` runs passed on the `nuc` runner
   (the first attempt failed until the runner's `externals/` were on the host).
2. **Variables** `BETA_DEPLOY_FROM_GITHUB=true` and `RELEASES_FROM_GITHUB=true`
   set; they remain as kill switches.
3. **Secrets** (all six set on 2026-11-18 by the user) with `pbpaste | gh secret set NAME -R venam1s/homechronicle`
   or from `~/.config/homelab/tokens.env` in the user's own shell (Claude's
   session is not allowed to copy secrets between stores):
   `DOCKER_HUB_USER`, `DOCKER_HUB_TOKEN` (values in the GitLab CI variables of
   the same name), `DOCKHAND_TOKEN` (= `DOCKHAND_API_TOKEN`),
   `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, and optionally
   `GITLAB_RELEASE_TOKEN` (a GitLab project access token, scope `api`, for the
   release mirror step).
4. **Beta deploy** moved to `ci.yml` (`deploy-beta`). Dockhand repository 4,
   which git stack 10 builds from, now points at
   `https://github.com/venam1s/homechronicle.git` with no credential (public
   repo); a sync confirmed it pulls `main`.
5. **Releases** moved to `release.yml`. The `release` job also mirrors each
   release to GitLab via `scripts/gitlab-release.mjs`, so installs up to
   v0.5.0 (which only check GitLab) keep seeing updates. The first real test is
   the next `vX.Y.Z-beta.N` tag; rebuild a tag by hand with
   `gh workflow run release.yml -f tag=...`.
6. **Docs site**: a direct-upload Cloudflare Pages project `homechronicle-docs`
   receives `docs/` from the `docs` job of `ci.yml` on every push to main
   (wrangler). On 2026-11-18 the custom domain `homechronicle.net` and its DNS
   CNAME were moved to it from the old GitLab-sourced project `homechronicle`
   (about a minute of 522 while the certificate came up). The old project is
   kept, detached, as a rollback: re-attach the domain and point the CNAME back
   at `homechronicle.pages.dev`. `www.homechronicle.net` still points at a
   GitHub Pages leftover and was not touched.
7. **Skills and docs** rewritten: `release`, `beta-release`, `beta-release-git`
   skills, `CONTRIBUTING.md`, `docs/guide/testing.md` (CI section),
   `docs/guide/docker-compose.md`.

Still GitLab-dependent on purpose: the mirror receives `main`, tags and
releases; issue images copied from GitLab issues live on GitLab uploads. The
GitLab project stays public and read-only.

## Runner operations

- Logs: `ssh nuc docker logs -f hc-github-runner`. Healthy start ends with
  `Listening for Jobs`.
- The registration token in `/data/stacks/hc-github-runner/.env` is a one-hour
  token used only on first start; the registration itself persists in
  `state/`. To re-register (new labels, moved repo), stop the stack, empty
  `state/`, write a fresh token to `.env`
  (`gh api -X POST repos/venam1s/homechronicle/actions/runners/registration-token --jq .token`)
  and start it again.
- Jobs run in containers created through the host socket. The GitLab runner's
  buildx builder is `multiarch`; the GitHub workflow uses `gh-multiarch`, so the
  two never fight over one BuildKit container.
- Capacity: the GitLab runner allows 2 concurrent jobs and this runner 1, each
  job capped at 2 CPUs / 2 GB, on an 8-thread, 32 GB host.
