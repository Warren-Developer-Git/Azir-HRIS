# Deployment & CI/CD Implementation Plan (Activity 12)

**Spec:** [2026-11-17-deployment-cicd-design.md](../specs/2026-11-17-deployment-cicd-design.md)  
**Workflow:** Strict TDD (`RED` failing test -> `GREEN` minimal code -> `REFACTOR`) + Review-First

---

## Bite-Sized Tasks

### Task 1: Express `trust proxy` Configuration & `/health/ready` Readiness Probe (TDD)
- **RED:**
  - Create `apps/api/src/app.setup.spec.ts` asserting `configureApp(app)` sets `'trust proxy'` to `1` on the HTTP adapter instance.
  - Expand `apps/api/src/health.controller.spec.ts` testing `ready()`: returns `{ ok: true, database: 'up' }` when `prisma.$queryRaw` succeeds and throws `ServiceUnavailableException` when `prisma.$queryRaw` fails.
  - Run `vitest` and verify failures (`RED`).
- **GREEN:**
  - Update `apps/api/src/app.setup.ts` to call `instance.set('trust proxy', 1)` safely when `getHttpAdapter()?.getInstance()?.set` exists.
  - Update `apps/api/src/health.controller.ts` to inject optional `PrismaService` and implement `@Public() @Get('ready')` (`SELECT 1`).
  - Run `vitest` (`GREEN`).

### Task 2: Dynamic `API_URL` Rewrite Helper in `apps/web` (TDD)
- **RED:**
  - Add pure helper spec `apps/web/lib/proxy-url.spec.ts` (runnable via `tsx` / `node --test` cleanly without adding Vitest to `apps/web`) asserting:
    - Defaults to `http://localhost:4000` when `API_URL` is undefined/blank
    - Strips trailing slashes (`https://api.example.com/` -> `https://api.example.com`)
    - Throws on invalid non-`http(s)://` URLs
- **GREEN:**
  - Create `apps/web/lib/proxy-url.ts` exporting `resolveApiProxyTarget(rawUrl?: string)` and wire `apps/web/next.config.ts` `rewrites()` to `${resolveApiProxyTarget(process.env.API_URL)}/:path*`.
  - Verify tests pass cleanly + `pnpm --filter web exec tsc --noEmit --incremental false`.

### Task 3: Production Container (`apps/api/Dockerfile`, `.dockerignore`) & Cloud DB Bootstrap (`supabase-init.sql`)
- Create `.dockerignore` excluding local artifacts, `.env*`, `node_modules`, `dist`, `.next`, `apps/api/uploads`.
- Create multi-stage `apps/api/Dockerfile` (`node:24-alpine`, `pnpm@12.18.0`, `prisma generate`, `nest build`, non-root `node` user running `prisma migrate deploy && node dist/main.js`).
- Create `apps/api/prisma/supabase-init.sql` (idempotent `hrms_app` role setup for Supabase PostgreSQL) and `apps/api/package.json` `"start:migrate:prod"` script.

### Task 4: Vercel & Render Deployment Blueprints + `.env.example` Files
- Create `render.yaml` (`azir-hris-api` Docker service with `/health` check & `sync: false` secrets).
- Create `apps/web/vercel.json` (Next.js monorepo build & install commands).
- Update `apps/api/.env.example` and create `apps/web/.env.example` (`API_URL`).

### Task 5: GitHub Actions CI & CD Workflows
- Create `.github/workflows/ci.yml` (`verify-api`, `e2e-api` with Postgres 16 + `setup.sql`, `verify-web`, `verify-docker`).
- Create `.github/workflows/cd.yml` (`workflow_run` on `CI` completion on `main`, optional `RENDER_DEPLOY_HOOK_URL` trigger).

### Task 6: Final Verification & Deployment Checklist
- Run full unit tests (`vitest`), typechecks (`tsc` API & Web), linters (`oxlint`, targeted `eslint`), YAML/Dockerfile syntax checks, and provide exact click-by-click Vercel + Render + Supabase deployment steps.
