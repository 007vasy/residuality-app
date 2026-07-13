# Plan: Code review, local UI test, GCP deploy scripts (review + fix)

## Context

StressForge (pnpm monorepo: Fastify API, React SPA, Neo4j, optional BYOK LLM/MCP) needs three things:

1. **Code review** of app + deploy surface  
2. **Local UI test** (Docker stack + chrome-devtools browser checks)  
3. **GCP Cloud Run scripts** — review and harden only; **no live deploy**. Target is a **dedicated project later** (not `apexai-pa-prod`).

Chrome DevTools MCP is already working (stable + auto-connect). Local `.env` exists with `APP_ENCRYPTION_KEY`. Host ports **7474/7687** are taken by `codegarden-neo4j`.

---

## 1. Code review (findings to validate + report)

### Architecture (sound)

| Layer | Role |
|---|---|
| `packages/core` | Schema + compute (criticality, contagion, incidence); parity tests |
| `packages/db` | Neo4j driver, migrate, seeds, gallery |
| `packages/llm` / `mcp` | BYOK Claude + MCP tools |
| `apps/api` | REST + SSE + WS + `/mcp` + optional static SPA (`WEB_DIST`) |
| `apps/web` | Matrix/graph UI |

Public gallery routes under `/api/public/*` (no auth). Auth: email/password + optional Google/X. Health: `GET /health`. Cloud Run single container serves SPA via `WEB_DIST=/app/web`.

### Blockers / bugs

| Severity | Issue | Location |
|---|---|---|
| **P0** | Local/prod **Compose Dockerfiles** still filter `@residuality/*`; packages are `@stressforge/*` — `docker compose build` fails | `apps/api/Dockerfile`, `apps/web/Dockerfile` |
| **P0** | **`setup.sh` secret rotation on every re-run**: if `JWT_SECRET` / `APP_ENCRYPTION_KEY` blank in `config.env`, script **always** `openssl rand` and **adds a new Secret Manager version**; Cloud Run uses `:latest` → **invalidates sessions and BYOK-encrypted keys on every redeploy**. Contradicts “idempotent” docs | `deploy/cloud-run/setup.sh` ~83–88 |
| **P1** | Host Neo4j ports **7474/7687** conflict with other containers | `docker-compose.yml` publish map |
| **P2** | Vite dev proxy targets **4099**; API default **4000** | `apps/web/vite.config.ts` (Docker path unaffected) |
| **P2** | Service still runs `migrate()` on every boot; OK with `MAX_INSTANCES=1`, races if raised | `apps/api/src/index.ts` |
| **Note** | `Dockerfile.cloudrun` package filters are **correct** (`@stressforge/*`) | — |

### GCP script review (good design)

- Least-privilege runtime SA + per-secret `secretAccessor`  
- Service: `SEED_EXAMPLES=false`; one-shot Job runs `seed-cli.js` (no `loadConfig` / no encryption key needed)  
- PUBLIC_BASE_URL/CORS patched after first deploy to real `*.run.app` URL  
- `MAX_INSTANCES=1` documents WS collab limit  
- `bash -n setup.sh` already OK  

### GCP script improvements to implement (no deploy)

1. **Only generate secrets if missing** in Secret Manager (or if config.env provides a value); never silently rotate existing secrets on redeploy.  
2. Optionally print/warn which secrets were created vs reused.  
3. Document that `config.env` must not be committed; ensure `config.env` in `.gitignore` if missing.  
4. Optional: note Cloud Build SA needs AR push rights (usually auto with project Owner); domain mapping command may need modern `gcloud beta run domain-mappings` on newer SDKs — document only.  
5. Leave `config.env` **uncreated** or only create a **local gitignored template copy with placeholders** — no real Aura credentials (user chose review-only + dedicated project later).

### Out of scope for this pass

- Creating GCP project / Aura DB / running `setup.sh` deploy  
- OAuth app registration  
- Full security audit  

---

## 2. Local UI test

### Prep fixes

1. Rename `@residuality/*` → `@stressforge/*` in `apps/api/Dockerfile` and `apps/web/Dockerfile`.  
2. Avoid Neo4j port clash: publish host ports e.g. `7475:7474` and `7688:7687` in `docker-compose.yml` (container-internal Bolt stays `bolt://neo4j:7687`).  
3. Confirm `.env` has `APP_ENCRYPTION_KEY` (already set).

### Bring-up

```bash
docker compose up --build -d
docker compose ps
docker compose logs api --tail 100
```

Wait for neo4j healthy + API migrations/seed.

### Automated checks

| Check | Expect |
|---|---|
| `GET http://localhost:8080/` | 200 HTML |
| `GET http://localhost:8080/api/...` via nginx | proxy works |
| `GET http://localhost:4000/health` | `{ ok: true }` |
| `GET http://localhost:8080/api/public/projects` | JSON gallery (if seed ran) |

### Browser (chrome-devtools)

1. `navigate_page` → `http://localhost:8080`  
2. Snapshot: gallery / home, About, Stressor library, Sign in  
3. Register (or login) → create project → Seed demo if present → open Matrix, toggle stressor if UI allows  
4. Note console errors via `list_console_messages`  
5. Report pass/fail with screenshots only if useful  

### Unit tests (quick confidence)

```bash
pnpm -r test   # core parity tests at minimum
pnpm -r typecheck  # if time allows
```

---

## 3. GCP deploy scripts — review + fix only

### Files

| Path | Action |
|---|---|
| `deploy/cloud-run/setup.sh` | **Fix** secret create-if-missing / no silent rotate |
| `deploy/cloud-run/README.md` | Note secret behavior + dedicated project + prereqs |
| `deploy/cloud-run/config.env.example` | Clarify blank secrets = generate **once** only |
| `deploy/cloud-run/cloudbuild.yaml` | Review only (OK as-is) |
| `Dockerfile.cloudrun` | Review only (correct package names) |
| `.gitignore` | Ensure `deploy/cloud-run/config.env` ignored |

### Secret logic (target behavior)

```text
if config.env has JWT_SECRET non-empty → write that version
else if secret JWT_SECRET already exists in SM → do not add a version
else → openssl rand, create secret + first version
(same for APP_ENCRYPTION_KEY)
Always upsert NEO4J_* from config (password may rotate intentionally when operator updates config.env)
```

### Deliverable for GCP

Written review covering: prereqs (Aura, dedicated `PROJECT_ID`, gcloud roles), what setup.sh does step-by-step, cost/scaling notes, secret rotation fix, “do not deploy into shared prod”, how to run later:

```bash
# later, after creating project + Aura:
cp deploy/cloud-run/config.env.example deploy/cloud-run/config.env
# fill PROJECT_ID, NEO4J_URI, NEO4J_PASSWORD
./deploy/cloud-run/setup.sh
```

---

## 4. Execution order

1. Fix Compose Dockerfiles (`@stressforge/*`).  
2. Remap local Neo4j host ports.  
3. `docker compose up --build -d` + HTTP smoke.  
4. chrome-devtools UI walkthrough.  
5. `pnpm -r test` (and typecheck if quick).  
6. Fix `setup.sh` secret idempotency + README/example notes + gitignore.  
7. Final report: code findings, UI results, GCP readiness checklist (no deploy).

---

## Critical files

- `apps/api/Dockerfile`, `apps/web/Dockerfile` — package rename  
- `docker-compose.yml` — Neo4j host ports  
- `.env` — local secrets (no commit)  
- `apps/api/src/{index,app,config,seed-cli}.ts` — runtime/deploy semantics  
- `deploy/cloud-run/setup.sh`, `README.md`, `config.env.example`, `cloudbuild.yaml`  
- `Dockerfile.cloudrun`  
- `apps/web/src/{App,ProjectView,api}.tsx` — UI under test  

## Verification

- Compose stack healthy; UI loads in Chrome; public API returns projects or empty gallery cleanly  
- `setup.sh` re-run with empty secrets does **not** create new JWT/enc versions when secrets already exist (unit-testable by inspecting script logic; full SM test skipped without project)  
- `bash -n deploy/cloud-run/setup.sh` still clean  
- Report delivered in chat  

## Already done (prior session)

- chrome-devtools MCP: `--channel=stable --auto-connect`, remote debugging enabled, tools live  
