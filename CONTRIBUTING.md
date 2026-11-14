<!-- generated-by: gsd-doc-writer -->
# Contributing to HomeChronicle

HomeChronicle is an AGPL-3.0 project. Contributions are welcome — bug reports, feature requests, documentation fixes, and code changes alike.

The repository is at [github.com/venam1s/homechronicle](https://github.com/venam1s/homechronicle), with issues and pull requests there. It is mirrored to [gitlab.com/havuq/homechronicle](https://gitlab.com/havuq/homechronicle), where CI runs.

## Reporting Bugs

Open an issue on [GitHub](https://github.com/venam1s/homechronicle/issues). Include:

- HomeChronicle version (from the web UI footer or `docker inspect`)
- Host OS and architecture (e.g., Linux amd64, Raspberry Pi arm64)
- Relevant listener logs (`docker compose logs listener`)
- Steps to reproduce and expected vs. actual behavior

For security vulnerabilities, do not open a public issue. See [SECURITY.md](SECURITY.md) for the private disclosure process.

## Requesting Features

Open a GitHub issue describing the feature. Describe the use case, not just the implementation — explaining what you are trying to accomplish helps evaluate fit with the project's self-hosted focus.

## Local Development Setup

See [docs/guide/environment-variables.md](docs/guide/environment-variables.md) for the full variable reference.

**Prerequisites:** Node.js 20+, Docker with Compose v2, PostgreSQL accessible (via Docker).

```bash
git clone https://github.com/venam1s/homechronicle.git
cd homechronicle
cp .env.example .env          # fill in POSTGRES_PASSWORD and API_TOKEN
./scripts/dev-local.sh
```

`dev-local.sh` starts a Postgres container via Docker Compose, installs dependencies in `listener/` and `web/` if needed, then runs the listener (`http://localhost:3001`) and the Vite dev server (`http://localhost:5173`) side by side. Press `Ctrl+C` to stop both.

If Docker is not available, start Postgres separately and set `DATABASE_URL` in `.env` before running the listener and web dev servers individually:

```bash
# Listener
cd listener && npm run dev

# Web (separate terminal)
cd web && npm run dev
```

## Running Tests

Tests must pass before submitting a pull request. CI runs both suites on Node 20.

```bash
# Listener (Node.js built-in test runner)
cd listener && npm test

# Web (Vitest + jsdom)
cd web && npm test
```

There is no coverage threshold enforced in CI, but new code should include tests that match the naming conventions below.

## Coding Conventions

No linter or formatter is configured. Style is maintained manually — please match the surrounding code.

- **Module system:** ES modules throughout (`import`/`export`). No CommonJS.
- **File naming:** kebab-case for all source files (`events-router.js`, `matter-controller.js`). React components use PascalCase (`Timeline.jsx`).
- **Indentation:** 2 spaces.
- **Strings:** single quotes.
- **Semicolons:** required.
- **Trailing commas:** required in multi-line arrays and objects.
- **Imports:** always include the `.js` or `.jsx` extension. No path aliases — use relative paths.
- **Functions:** camelCase (`insertEvent`, `parseIntInRange`). Factory functions use `create` prefix (`createEventsRouter`). React hooks use `use` prefix (`useEvents`).
- **Constants:** `UPPER_SNAKE_CASE` at module level.
- **SQL:** snake_case column and table names.
- **Error handling:** wrap route handlers in `try/catch`; return `{ error: 'message' }` with 4xx/5xx status.

Test files mirror the source name with a `.test.` suffix (`alerts.processor.test.js`, `Toast.test.jsx`). Integration tests use `.integration.test.js`; E2E specs use `.spec.js`.

## Commit Message Style

This project uses [Conventional Commits](https://www.conventionalcommits.org/). Each commit message must have a type and an optional scope:

```
<type>(<scope>): <short description>
```

Common types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`.

Common scopes: `ui`, `api`, `db`, `listener`, `docker`, `ci`.

Examples from the repository:

```
feat(ui): add toast center positions and adjust offset for sticky header
fix(api): allow top-center and bottom-center toast positions
docs: expand v0.1.6-beta.3 changelog with all recent changes
refactor(listener): extract events router into dedicated module
```

Do not add `Co-Authored-By` trailers to commits.

## Submitting a Pull Request

1. Fork the repository on GitHub and create a branch from `main`.
2. Branch names should follow the pattern `feat/short-description` or `fix/short-description`.
3. Make your changes with appropriately scoped commits.
4. Ensure both test suites pass locally (`cd listener && npm test`, `cd web && npm test`).
5. Open a pull request against `main`. The description should explain the motivation and link any related issue.
6. CI does not run on GitHub pull requests (it runs on the maintainer's GitLab pipeline), so step 4 is the check — say in the description that both suites pass.

## License

By contributing, you agree that your contributions will be licensed under the [GNU Affero General Public License v3.0](LICENSE).
