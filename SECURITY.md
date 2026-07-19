# Security Policy

## Supported versions

The `main` branch is the only supported release line for this project (v0.x).

## Reporting a vulnerability

**Do not open a public GitHub issue for security problems.**

Please use one of:

1. **[GitHub Security Advisories](https://github.com/007vasy/residuality-app/security/advisories/new)** (preferred) — private report to maintainers.
2. Email **ben@apexai.info** with subject `[StressForge security]` and enough detail to reproduce.

We aim to acknowledge reports within a few business days. Please give us a reasonable window before public disclosure.

## What to report

- Auth bypass, privilege escalation, or IDOR on projects/members
- Exposure of BYOK LLM keys, JWTs, or MCP tokens
- Injection into Neo4j Cypher paths or request parsing
- SSRF, XSS, or remote code execution
- Abuse vectors that defeat rate limits / registration controls on a public deploy

Out of scope for private reports (use normal issues instead): pure UX bugs, documentation typos, and theoretical issues that require already having admin GCP/Neo4j credentials.

## Hardening notes for operators

Public demos should set:

| Variable | Suggested demo value |
|---|---|
| `MIN_INSTANCES` / `MAX_INSTANCES` | `0` / `1` (cost + correct in-memory rate limits) |
| `ALLOW_REGISTRATION` | `true` with invite, or `false` for gallery-only |
| `REGISTRATION_INVITE_CODE` | strong random string if registration is open to invitees |
| `MAX_PROJECTS_PER_USER` | `3`–`5` |
| `AUTH_RATE_LIMIT_MAX` / `AI_RATE_LIMIT_MAX` | keep defaults or tighten |
| `JWT_SECRET` / `APP_ENCRYPTION_KEY` | generated once; never rotate casually |

LLM spend is **BYOK** (users bring Anthropic keys). Still rate-limit AI routes so a single IP cannot hammer the process.
