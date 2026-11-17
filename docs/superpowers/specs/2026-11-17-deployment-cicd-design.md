# Deployment & CI/CD Design Spec (Activity 12)

**Date:** 2026-11-17  
**Status:** Proposed (Awaiting Review)  
**Target Stack:** `$0` Capstone Demo Topology — **Vercel** (`apps/web`) + **Render Docker** (`apps/api`) + **Supabase** (PostgreSQL + Cloud Storage) + **GitHub Actions** (CI/CD)

---

## 1. Goals & Constraints
- **Zero-cost capstone demo hosting:** Public HTTPS website accessible worldwide using free tiers (`Vercel` + `Render` + `Supabase`), while keeping container artifacts portable for a future KVM VPS if upgraded.
- **Same-origin cookie security:** Preserve `httpOnly`, `SameSite=Lax`, `Secure` refresh cookies and strict `connect-src 'self'` CSP by proxying browser `/api/*` requests through Next.js rewrites (`API_URL`).
- **Reverse-proxy correctness:** Ensure `@nestjs/throttler` identifies client IPs behind Vercel/Render/Nginx proxies instead of throttling all traffic under one proxy IP.
- **Automated CI quality gates:** Every push/PR runs lint, typechecks, unit tests, PostgreSQL + RLS E2E tests, production builds, and Docker image build validation before deployment.

---

## 2. Deployment Architecture

```
Browser ──HTTPS──▶ Vercel (apps/web Next.js 16)
                     │
                     │ /api/* rewrite ──▶ API_URL (server-only env var)
                     ▼
                   Render Free Web Service (apps/api Dockerfile, Node 24)
                     ├──▶ Supabase PostgreSQL (APP_DATABASE_URL / OWNER_DATABASE_URL)
                     ├──▶ Supabase Storage REST (azir-hris-files)
                     └──▶ Gmail SMTP / Resend API
```

### Key Decisions
1. **Dynamic Next.js API Proxy (`apps/web/next.config.ts`):**
   - Replace hardcoded `http://localhost:4000/:path*` rewrite target with pure helper `resolveApiRewriteBase(process.env.API_URL)` (defaults to `http://localhost:4000`, trims whitespace and trailing slashes).
   - `API_URL` is server-side only (never prefixed with `NEXT_PUBLIC_`).
2. **Express `trust proxy` & Readiness Probe (`apps/api`):**
   - `configureApp(app)` in `apps/api/src/app.setup.ts` calls `app.getHttpAdapter().getInstance().set('trust proxy', 1)` when an Express instance is present (`typeof instance?.set === 'function'`) so `req.ip` reflects `X-Forwarded-For` from the outer reverse proxy cleanly.
   - `HealthController` keeps `GET /health` fast (`{ ok: true }`) for liveness probes and adds `@Public() @Get('ready')` running `SELECT 1` via `PrismaService.$queryRaw` (`200 { ok: true, database: 'up' }` on success, `503 ServiceUnavailableException` when DB is unreachable).
3. **Production Container (`apps/api/Dockerfile` & `.dockerignore`):**
   - Multi-stage `node:24-alpine` Dockerfile:
     - `builder`: `corepack enable`, installs frozen workspace dependencies (`pnpm install --frozen-lockfile`), runs `prisma generate`, builds `apps/api` (`pnpm --filter api build`).
     - `runner`: non-root `node` user (`uid 1000`), copies built `dist/`, `prisma/` migrations/schema, and production `node_modules`; runs `prisma migrate deploy && node dist/main.js` on startup.
4. **Cloud Database Initialization (`apps/api/prisma/supabase-init.sql`):**
   - Idempotent SQL script creating the non-superuser `hrms_app` role required by migration `20261110144053_rls` before `prisma migrate deploy` runs on a fresh Supabase/cloud Postgres instance.
5. **Blueprints & Platform Configs:**
   - `render.yaml` defining the `azir-hris-api` Docker service (`healthCheckPath: /health`, explicit `sync: false` secrets).
   - `apps/web/vercel.json` defining monorepo install/build commands cleanly for Vercel (`Root Directory: apps/web`).
   - `.env.example` updates (`apps/api/.env.example`, `apps/web/.env.example`) documenting required deployment variables cleanly with placeholders.
6. **GitHub Actions Workflows:**
   - `.github/workflows/ci.yml` (`push` + `pull_request`):
     - `verify-api`: `oxlint`, `tsc --noEmit`, `vitest` unit suite (`--configLoader native`), `nest build`.
     - `e2e-api`: `postgres:16` service container, runs `setup.sql` + `prisma migrate deploy` against `hrms_test`, runs `vitest` E2E suite.
     - `verify-web`: `tsc --noEmit`, `eslint` on key web config/lib, `next build`.
     - `verify-docker`: builds `apps/api/Dockerfile` to guarantee container build integrity.
   - `.github/workflows/cd.yml` (on `push` to `main` after CI passes):
     - Safely triggers Render deployment webhook when `secrets.RENDER_DEPLOY_HOOK_URL` is configured (no-ops cleanly with notice before secrets are linked; Vercel auto-deploys via GitHub integration).

---

## 3. Security & Verification Guardrails
- No secrets committed anywhere (`sync: false` in `render.yaml`, `${{ secrets.* }}` in workflows, `.env*` in `.dockerignore` and `.gitignore`).
- All runtime code additions (`resolveApiRewriteBase`, `trust proxy` configuration, `/health/ready` DB probe) follow strict **RED -> GREEN TDD** before CI/Dockerfile/blueprint assembly.
