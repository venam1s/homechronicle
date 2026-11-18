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
| `.github/workflows/release.yml` | Port of `validate-release`, `build-*`, `create-release`. Runs on `v*` tag pushes and `workflow_dispatch` (rebuild an existing tag). Builds `listener`, `web` and, for stable tags, `standalone` to Docker Hub with the same tag set (`version`, `major.minor`, `major`, `latest`; betas get `version`, `beta`), then creates the GitHub release from the `## [version]` section of `CHANGELOG.md` via `scripts/github-release.mjs`. Every job is gated on the repository variable `RELEASES_FROM_GITHUB=true`. |
| `.github/actionlint.yaml` | Declares the custom runner labels so `actionlint` passes. |
| Removed | `docker.yml` (release-event trigger, pushed to GHCR, GA lock), `cache-maintenance.yml`, `cleanup-containers.yml`: GitHub-era workflows that would have misfired on hosted runners once Actions is enabled. |

The GitLab pipeline is unchanged and remains the CI of record. The GitHub
workflows cannot deploy or publish anything until the two variables are set, so
enabling Actions only adds a second, parallel test run on the same host.

## Cutover steps

1. **Enable Actions** on the repo with fork-PR approval required for all
   outside collaborators (done 2026-11-18):
   ```
   gh api -X PUT repos/venam1s/homechronicle/actions/permissions -F enabled=true -f allowed_actions=all
   gh api -X PUT repos/venam1s/homechronicle/actions/permissions/fork-pr-contributor-approval -f approval_policy=all_external_contributors
   ```
   The runner shows **Idle** in Settings › Actions › Runners once it can take
   jobs. Run `gh workflow run ci.yml` and compare with the GitLab run.
2. **Soak** for a release cycle: every push to `main` runs tests on both CIs.
   Fix any divergence in the GitHub port before going further.
3. **Secrets**: `gh secret set DOCKER_HUB_USER`, `DOCKER_HUB_TOKEN`,
   `DOCKHAND_TOKEN` (paste from the clipboard: `pbpaste | gh secret set NAME`;
   never type a token on the command line).
4. **Beta deploy**: set `gh variable set BETA_DEPLOY_FROM_GITHUB --body true`
   and, in the same change, delete `deploy-beta` from `.gitlab-ci.yml` so a push
   does not trigger two Dockhand builds (the second has no-op'd before). Repoint
   Dockhand git stack 10 at the GitHub repo URL.
5. **Releases**: set `gh variable set RELEASES_FROM_GITHUB --body true`, delete
   `validate-release`, `build-*`, `create-release` and `github-release` from
   `.gitlab-ci.yml`, and test with the next beta tag before a GA. Update the
   `release`, `beta-release` and `beta-release-git` skills and `CONTRIBUTING.md`
   (which says GitHub PRs get no CI run).
6. **Docs site**: relink the Cloudflare Pages project `homechronicle` to the
   GitHub repo, branch `main`.
7. **Retire GitLab CI**: remove `.gitlab-ci.yml`, drop GitLab from `origin`'s
   push URLs, keep the GitLab project as a read-only mirror (installs up to
   v0.5.0 only check GitLab for updates; the listener's update check already
   asks GitHub first). Remove the `hc-git-runner` stack from the NUC last.

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
