# HRMS Foundation + Leave (Milestone 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A multi-tenant HRMS where employees file leave, managers then HR approve it, and admin/HR manage employees and settings. CRUD works on both sides and it can be demoed live on Friday 2026-11-13.

**Architecture:** pnpm monorepo with a NestJS API (`apps/api`, port 4000) and a Next.js web app (`apps/web`, port 3000). The web app proxies `/api/*` to the API, so everything is same-origin. One local PostgreSQL 18 database, shared by all tenants, isolated by Row-Level Security. The API connects as a non-owner role, and every tenant query runs inside `withTenant()`, which sets `app.tenant_id` first.

**Tech Stack:** Node 24, pnpm (corepack), NestJS ≥ 11, Prisma ≥ 6, PostgreSQL 18 (native Windows install), Jest + supertest, @nestjs/jwt, bcryptjs, class-validator, Next.js ≥ 15 App Router, Tailwind CSS v4, shadcn/ui (neutral base), lucide-react.

**Spec:** `docs/superpowers/specs/2026-11-10-hrms-foundation-leave-design.md` (read it alongside this plan).

## Global Constraints

- Every tenant-owned table has `tenantId` (uuid) and an RLS policy. The API runtime never uses the owner role.
- IDs are UUIDv7 via Postgres 18 `uuidv7()`: `@default(dbgenerated("uuidv7()")) @db.Uuid`.
- Dates of leave and holidays are Postgres `DATE` (`@db.Date`), handled in code as `'YYYY-MM-DD'` strings. "Today" means today in `Asia/Manila`.
- Whole days only. Leave year = calendar year. A request may not cross Dec 31.
- Roles are fixed: `ADMIN`, `HR`, `MANAGER`, `EMPLOYEE`. Guards check **permissions**, never role names.
- Employees are deactivated, never hard-deleted. Leave requests are cancelled, never deleted.
- Visual style: black/white/greys. Statuses use text + icon + shade, never colour. Red only for errors and destructive actions.
- Ponytail: no abstraction, option or dependency without a current use. Deliberate limits get a `// shortcut: <ceiling>, <upgrade trigger>` comment.
- Each task ends with a commit and pauses for owner review. The review note includes "what it does / why / concepts / what to look at first / how to explain this".
- Prisma naming defaults (PascalCase tables, camelCase columns). Raw SQL quotes identifiers (`"tenantId"`).

## Review Focus

1. **Manila "today":** a request starting today, filed at 07:00 Manila (23:00 UTC the day before), is accepted. A request for yesterday is rejected. Test in Task 7 with an injected clock.
2. **Double submit:** two simultaneous requests that each fit the balance but together exceed it → exactly one succeeds. Test in Task 7 (row lock on the employee).
3. **Double approval:** two HR users approve the same request at once → one `DEDUCT` entry, the second call gets 409. Test in Task 8.
4. **Manager missing or inactive:** filing goes straight to `PENDING_HR`. An inactive user can't log in. Tests in Tasks 5 and 7.
5. **Range with no working days** (weekend only, or only holidays) → 400 `"Selected dates contain no leave days"`. Test in Task 7.

---

## File Structure

```
package.json                 root scripts: dev, db:setup, db:reset, test
pnpm-workspace.yaml          apps/*
apps/api/
  .env.example               APP_DATABASE_URL, OWNER_DATABASE_URL, TEST_APP_DATABASE_URL, TEST_OWNER_DATABASE_URL, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET
  prisma/schema.prisma       all models
  prisma/setup.sql           creates roles hrms_owner/hrms_app and DBs hrms/hrms_test (run once as postgres)
  prisma/migrations/*        generated + one hand-written RLS migration
  prisma/seed.ts             demo data (2 tenants), dates relative to today
  src/main.ts, app.module.ts
  src/prisma/prisma.service.ts      withTenant(), loginLookup()
  src/auth/                         auth.controller/service, jwt-auth.guard, permissions.ts, permissions.guard, decorators.ts
  src/leave/leave-rules.ts          pure functions: day counting, eligibility, dates
  src/leave/leave-requests.*        controller/service/dto: file, list, edit, cancel, decide
  src/leave/balances.*              balance read, grant, adjust
  src/employees/                    controller/service/dto (+ /me/profile)
  src/settings/                     departments, leave-types, holidays controllers/services
  src/audit/audit.service.ts        record(tx, entry), plus audit-logs controller
  src/notifications/                notify(tx, ...), controller
  test/                             jest integration tests (supertest), global-setup.ts, helpers.ts
apps/web/
  next.config.ts                    rewrites /api/:path* → http://localhost:4000/:path*
  lib/api.ts                        fetch wrapper: bearer token in memory, 401 → refresh once → retry
  lib/auth-context.tsx              user + token, can(permission)
  lib/permissions.ts                copy of ROLE_PERMISSIONS map (shortcut: duplicated, move to packages/shared if it changes often)
  components/ui/*                   shadcn
  components/status-badge.tsx, app-sidebar.tsx, notification-bell.tsx
  app/login/page.tsx
  app/(app)/layout.tsx              auth gate + sidebar by permission
  app/(app)/dashboard, leave, leave/new, leave/[id], approvals, employees, employees/new,
          employees/[id], team, profile, settings/{departments,leave-types,holidays}, audit
README.md, ARCHITECTURE.md, docs/decisions/*.md
```

---

### Task 0 (owner, manual): Machine prerequisites

- [ ] **Step 1:** Install PostgreSQL 18 from the official EDB Windows installer. Keep port 5432, remember the `postgres` password, skip Stack Builder.
- [ ] **Step 2:** Add `C:\Program Files\PostgreSQL\18\bin` to the user PATH. Open a new terminal. `psql --version` should print 18.x.
- [ ] **Step 3:** Run `corepack enable`, then `pnpm --version` should print a version number.

### Task 1: Monorepo skeleton

**Files:** Create `package.json`, `pnpm-workspace.yaml`, `.gitignore`, `.editorconfig`, `apps/api/*` (Nest CLI scaffold, `--package-manager pnpm --strict`), `apps/web/*` (create-next-app: TypeScript, Tailwind, App Router, ESLint, no `src/`), `apps/web/next.config.ts`.

**Interfaces:** Produces `GET /health → { ok: true }` (public) and root scripts `pnpm dev` (both apps in parallel), `pnpm test` (api tests).

- [ ] **Step 1:** Scaffold both apps. Delete the scaffold's sample controller/service and the starter page content.
- [ ] **Step 2:** Write the failing test `apps/api/test/health.e2e-spec.ts`: `GET /health` → 200, body `{ ok: true }`.
- [ ] **Step 3:** Run `pnpm --filter api test:e2e`. Expected: FAIL (404).
- [ ] **Step 4:** Add `HealthController`. API listens on 4000. Add the web rewrite `/api/:path*` → `http://localhost:4000/:path*`.
- [ ] **Step 5:** Run the test. Expected: PASS. Then run `pnpm dev` and open `http://localhost:3000/api/health`. Expected: `{"ok":true}`.
- [ ] **Step 6:** Commit `chore: monorepo skeleton with NestJS api and Next.js web`.

### Task 2: Schema, database roles, RLS, `withTenant`

**Files:** Create `apps/api/prisma/setup.sql`, `prisma/schema.prisma`, migration `…_init`, hand-written migration `…_rls`, `src/prisma/prisma.service.ts`, `test/global-setup.ts`, `test/helpers.ts`, `test/rls.e2e-spec.ts`, `.env.example`.

**Interfaces:**
- Produces `PrismaService.withTenant<T>(tenantId: string, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T>`. It opens an interactive transaction, runs `SELECT set_config('app.tenant_id', $1, true)`, then `fn(tx)`.
- Produces `PrismaService.loginLookup(email: string): Promise<{ id, tenantId, passwordHash, active } | null>`, which calls SQL function `app_login_lookup(p_email text)` (SECURITY DEFINER, owned by `hrms_owner`, returns those columns from `"User"` where `email = lower(p_email)`).
- Produces test helpers `resetDb()` (as owner: `prisma migrate reset --force --skip-seed` against the test DB, then seed) and `appPrisma()` (PrismaService on `TEST_APP_DATABASE_URL`).

**Models (enums in brackets):**
- `Tenant { id, name, createdAt }`
- `User { id, tenantId, email @unique, passwordHash, roles Role[], active Boolean @default(true), createdAt }`, `Role [ADMIN HR MANAGER EMPLOYEE]`
- `Employee { id, tenantId, userId @unique, employeeNo, firstName, lastName, departmentId?, position, managerId? (self relation "Reports"), hireDate @db.Date, gender [MALE FEMALE], maritalStatus [SINGLE MARRIED WIDOWED SEPARATED], phone?, address?, status [ACTIVE INACTIVE] }` with `@@unique([tenantId, employeeNo])`, `@@index([tenantId, managerId])`
- `Department { id, tenantId, name, active }` with `@@unique([tenantId, name])`
- `LeaveType { id, tenantId, code, name, kind [YEARLY PER_EVENT], defaultDays Int, countingMode [WORKING_DAYS CALENDAR_DAYS], eligibleGender Gender?, eligibleMaritalStatus MaritalStatus?, minServiceMonths Int @default(0), requiresAttachment Boolean @default(false), active }` with `@@unique([tenantId, code])`
- `LeaveLedgerEntry { id, tenantId, employeeId, leaveTypeId, year Int, type [GRANT ADJUST DEDUCT], days Int (signed; DEDUCT negative), reason?, requestId? @unique, createdById (User), createdAt }` with `@@index([tenantId, employeeId, leaveTypeId, year])`
- `LeaveRequest { id, tenantId, employeeId, leaveTypeId, startDate @db.Date, endDate @db.Date, days Int, reason, status [PENDING_MANAGER PENDING_HR APPROVED REJECTED CANCELLED], createdAt, updatedAt }` with `@@index([tenantId, employeeId, status])`
- `LeaveApproval { id, tenantId, requestId, step [MANAGER HR], approverId (Employee), decision [APPROVED REJECTED], comment?, decidedAt }`
- `Holiday { id, tenantId, date @db.Date, name, type [REGULAR SPECIAL] }` with `@@unique([tenantId, date])`
- `Notification { id, tenantId, recipientId (User), message, link?, readAt?, createdAt }` with `@@index([tenantId, recipientId, readAt])`
- `AuditLog { id, tenantId, actorId (User), action, entity, entityId, before Json?, after Json?, createdAt }` with `@@index([tenantId, createdAt])`

**setup.sql:** `CREATE ROLE hrms_owner LOGIN CREATEDB PASSWORD 'hrms_owner_dev'`, `CREATE ROLE hrms_app LOGIN PASSWORD 'hrms_app_dev'`, `CREATE DATABASE hrms OWNER hrms_owner`, `CREATE DATABASE hrms_test OWNER hrms_owner`. These are dev-only passwords, stated in the README.

**RLS migration:** for every table except `_prisma_migrations`: `ENABLE ROW LEVEL SECURITY` (not FORCE; the owner must bypass for migrations, seed and `app_login_lookup`). Policy: `USING ("tenantId" = current_setting('app.tenant_id', true)::uuid) WITH CHECK (same)`. `Tenant` uses `"id"` instead. Grants: `USAGE` on schema; `SELECT, INSERT, UPDATE, DELETE` on all tables to `hrms_app`; then `REVOKE UPDATE, DELETE ON "AuditLog" FROM hrms_app` (append-only audit). `ALTER DEFAULT PRIVILEGES FOR ROLE hrms_owner` grants the same on future tables. Create `app_login_lookup` and `GRANT EXECUTE` to `hrms_app`.

- [ ] **Step 1:** Write `setup.sql` and run `pnpm db:setup` (`psql -U postgres -f apps/api/prisma/setup.sql`). Expected: no errors.
- [ ] **Step 2:** Write the schema. Run `prisma migrate dev --name init` (as owner), then add the `rls` migration with `--create-only` and fill it in. Migrate again.
- [ ] **Step 3:** Write the failing test `test/rls.e2e-spec.ts`. As owner, insert tenants A and B, each with one Department. Then, through `appPrisma()`:
```ts
it('sees only its own tenant rows', async () => {
  const rows = await db.withTenant(A, tx => tx.department.findMany());
  expect(rows.map(r => r.tenantId)).toEqual([A]);
});
it('sees nothing without a tenant set', async () => {
  expect(await db.$queryRaw`SELECT * FROM "Department"`).toEqual([]);
});
it('cannot insert into another tenant', async () => {
  await expect(db.withTenant(A, tx => tx.department.create({ data: { tenantId: B, name: 'X' } }))).rejects.toThrow();
});
it('cannot update/delete audit logs', /* as app role: update → rejects (permission denied) */);
it('loginLookup finds user across tenants', /* returns tenantId of B's user */);
```
- [ ] **Step 4:** Run it. Expected: FAIL (`withTenant` not defined).
- [ ] **Step 5:** Implement `PrismaService` (extends PrismaClient on `APP_DATABASE_URL`) with `withTenant` and `loginLookup`.
- [ ] **Step 6:** Run the tests. Expected: PASS.
- [ ] **Step 7:** Commit `feat(db): schema, roles and row-level security with withTenant`.

### Task 3: Leave rules (pure functions)

**Files:** Create `apps/api/src/leave/leave-rules.ts`, `apps/api/src/leave/leave-rules.spec.ts`.

**Interfaces (produces):**
- `todayInManila(now?: Date): string` returns `'YYYY-MM-DD'`
- `countLeaveDays(start: string, end: string, mode: 'WORKING_DAYS' | 'CALENDAR_DAYS', holidays: Set<string>): number`. Inclusive. WORKING_DAYS skips Sat, Sun and holidays.
- `serviceMonths(hireDate: string, onDate: string): number` counts full months.
- `isEligibleToFile(type: LeaveTypeRule, emp: { gender, maritalStatus }): boolean` checks gender and marital status only.
- `isEligibleForGrant(type, emp: { hireDate }, onDate: string): boolean`. `kind === 'YEARLY'` and `serviceMonths >= minServiceMonths`.
- `type LeaveTypeRule = Pick<LeaveType, 'kind'|'defaultDays'|'countingMode'|'eligibleGender'|'eligibleMaritalStatus'|'minServiceMonths'>`

- [ ] **Step 1:** Write the failing tests:
```ts
expect(countLeaveDays('2026-11-13','2026-11-16','WORKING_DAYS',new Set())).toBe(2);   // Fri..Mon
expect(countLeaveDays('2026-11-14','2026-11-15','WORKING_DAYS',new Set())).toBe(0);   // weekend
expect(countLeaveDays('2026-11-27','2026-12-01','WORKING_DAYS',new Set(['2026-11-30']))).toBe(2); // Bonifacio Day skipped
expect(countLeaveDays('2026-11-14','2026-11-15','CALENDAR_DAYS',new Set())).toBe(2);
expect(todayInManila(new Date('2026-11-10T23:00:00Z'))).toBe('2026-11-11');
expect(serviceMonths('2025-11-11','2026-11-10')).toBe(11);
expect(serviceMonths('2025-11-10','2026-11-10')).toBe(12);
// SIL (minServiceMonths 12): eligible for grant at 12 months, not at 11
// Paternity (MALE, MARRIED): female → false; single male → false; married male → true
// Maternity (FEMALE): male → false
```
- [ ] **Step 2:** Run `pnpm --filter api test leave-rules`. Expected: FAIL.
- [ ] **Step 3:** Implement. Parse `'YYYY-MM-DD'` as UTC midnight and step by days in UTC (no local-time Date math). `todayInManila` uses `Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' })`.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit `feat(leave): pure leave rules for day counting and eligibility`.

### Task 4: Seed and reset

**Files:** Create `apps/api/prisma/seed.ts`. Modify the root `package.json` (`db:reset` = owner `prisma migrate reset --force`, which runs the seed) and the api `package.json` (prisma seed config).

**Interfaces:** Consumes `isEligibleForGrant`, `todayInManila`. Produces the demo accounts below (password `Demo1234!` for all, bcryptjs cost 10). Tests rely on these emails.

**Seed contents (dates relative to `todayInManila()` so the demo never goes stale):**
- Tenant **Acme Manila Corp**. Departments Engineering, Operations, Human Resources. 12 employees in a tree: `admin@acme.test` [ADMIN, EMPLOYEE], `hr@acme.test` and `hr2@acme.test` [HR, EMPLOYEE], `manager@acme.test` [MANAGER, EMPLOYEE] managing `employee@acme.test` (female, married, hired 2 years ago) and 5 others, plus `newhire@acme.test` (hired 3 months ago, so no SIL) and `depthead@acme.test` [MANAGER, EMPLOYEE] with no manager. Everyone not listed under `manager@acme.test` (including `manager@acme.test` and `newhire`) reports to `depthead`.
- Tenant **Bayanihan Foods Inc.** 5 employees: `admin@bayanihan.test`, `hr@bayanihan.test`, `manager@bayanihan.test`, `employee@bayanihan.test`, +1.
- Leave types per tenant (PH preset): `SIL` 5 YEARLY WORKING min 12; `VL` 10 YEARLY WORKING; `SL` 10 YEARLY WORKING; `MAT` 105 PER_EVENT CALENDAR FEMALE; `PAT` 7 PER_EVENT WORKING MALE+MARRIED.
- Holidays per tenant: Philippine 2026 regular and special non-working days, checked against the official 2026 proclamation. Must include 2026-11-30 Bonifacio Day, 2026-12-08, 2026-12-24, 2026-12-25, 2026-12-30, 2026-12-31.
- GRANT entries for the current year for every eligible employee × YEARLY type.
- Leave requests for Acme in each status (2 PENDING_MANAGER, 1 PENDING_HR, 2 APPROVED with matching DEDUCT rows and approvals, 1 REJECTED, 1 CANCELLED), starting at today + 7 or later.

- [ ] **Step 1:** Write the seed. It runs as owner, so no `withTenant` is needed.
- [ ] **Step 2:** Run `pnpm db:reset`. Expected: completes. Check in psql as `hrms_owner`: `SELECT count(*) FROM "User"` = 17.
- [ ] **Step 3:** Commit `feat(db): demo seed with two tenants and reset script`.

### Task 5: Authentication and permissions (API)

**Files:** Create `src/auth/{auth.controller,auth.service,jwt-auth.guard,permissions,permissions.guard,decorators}.ts`, `test/auth.e2e-spec.ts`. Modify `main.ts` (cookie-parser, global ValidationPipe `whitelist: true, forbidNonWhitelisted: true`) and `app.module.ts` (global guards in the order JwtAuthGuard → PermissionsGuard).

**Interfaces (produces):**
- `type AuthUser = { userId: string; tenantId: string; employeeId: string; roles: Role[] }`. JWT payload `{ sub, tid, eid, roles }`. Access token lasts 15 min and is signed with `JWT_ACCESS_SECRET`.
- `type Permission = 'employee.read.all' | 'employee.write' | 'team.read' | 'role.assign' | 'department.write' | 'leaveType.write' | 'holiday.write' | 'balance.adjust' | 'leave.file' | 'leave.approve.manager' | 'leave.approve.hr' | 'audit.read'`
- `ROLE_PERMISSIONS: Record<Role, Permission[]>`:
  ADMIN → department.write, leaveType.write, holiday.write, role.assign, employee.read.all, audit.read ·
  HR → employee.read.all, employee.write, balance.adjust, leave.approve.hr, audit.read ·
  MANAGER → team.read, leave.approve.manager ·
  EMPLOYEE → leave.file
- `hasPermission(user: AuthUser, p: Permission): boolean`
- Decorators: `@Public()`, `@RequirePermission(...p: Permission[])` (any of), `@CurrentUser()`
- Endpoints: `POST /auth/login {email,password}` → `{ accessToken, user: { id, email, roles, employeeId, name, tenantName } }` and sets cookie `refresh` (JWT 7 d, `JWT_REFRESH_SECRET`, httpOnly, sameSite lax, path `/`). `POST /auth/refresh` → same body. `POST /auth/logout` → clears the cookie. `GET /auth/me` → the user.
- The refresh token is stateless. `// shortcut: refresh tokens can't be revoked before expiry, add a token table when logout-everywhere is needed`

- [ ] **Step 1:** Write the failing tests:
  - login with `employee@acme.test`/`Demo1234!` → 200, has `accessToken`, `set-cookie` contains `refresh=` and `HttpOnly`
  - wrong password → 401 `"Invalid email or password"`. Unknown email → the same 401 and message
  - inactive user (set `active=false` as owner) → the same 401
  - `GET /auth/me` without a token → 401. With a token → the user's email
  - `POST /auth/refresh` with the cookie → new `accessToken`. Without it → 401
  - unit: `hasPermission(hr, 'leave.approve.hr') === true`, `hasPermission(employee, 'employee.read.all') === false`, multi-role user gets the union
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement with `@nestjs/jwt` directly (no passport). Login uses `loginLookup`, then `bcryptjs.compare`, then loads the employee and tenant name through `withTenant`.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit `feat(auth): JWT login, refresh cookie and permission guards`.

### Task 6: Web shell (login, layout, theme)

**Files:** Create `apps/web/lib/{api,auth-context,permissions}.ts(x)`, `app/login/page.tsx`, `app/(app)/layout.tsx`, `app/(app)/dashboard/page.tsx` (placeholder greeting), `components/app-sidebar.tsx`, `components/status-badge.tsx`. Run shadcn init (neutral) and add button, input, label, card, table, dialog, select, textarea, badge, dropdown-menu, sonner, sheet.

**Interfaces (produces):**
- `api<T>(path: string, init?: RequestInit): Promise<T>`. Prefixes `/api`, adds `Authorization: Bearer`, retries once after `POST /api/auth/refresh` on 401, and throws `ApiError { status, message }`.
- `useAuth(): { user, can(p: Permission): boolean, login(email, pw), logout() }`. On mount it calls refresh to restore the session.
- `<StatusBadge status={LeaveStatus} />`: PENDING_* = outline + Clock ("Pending manager" / "Pending HR"), APPROVED = solid black + Check, REJECTED = white with black border + X, CANCELLED = grey + Ban.
- Sidebar links are shown by permission: Dashboard, My Leave (leave.file), Approvals (leave.approve.manager or leave.approve.hr), Team (team.read), Employees (employee.read.all), Settings (department.write), Audit (audit.read), Profile.

- [ ] **Step 1:** Apply ui-ux-pro-max to the monochrome palette and font pairing. Set CSS variables in `globals.css` (neutral greys, `--destructive` the only red).
- [ ] **Step 2:** Build login → dashboard redirect, the auth gate in `(app)/layout.tsx` (unauthenticated → `/login`), sidebar and logout. Make it responsive: the sidebar becomes a Sheet below `md`.
- [ ] **Step 3:** Verify by hand: log in as `employee@acme.test` and see only Dashboard, My Leave, Profile. Log in as `hr@acme.test` and also see Approvals, Employees, Audit. Reload: you're still logged in. Logout → `/login`.
- [ ] **Step 4:** Commit `feat(web): login, app shell and monochrome theme`.

### Task 7: Leave filing API (file, list, view, edit, cancel, balances)

**Files:** Create `src/leave/{leave.module,leave-requests.controller,leave-requests.service,balances.service,dto}.ts`, `src/audit/audit.service.ts`, `src/settings/` read endpoints, `test/leave-filing.e2e-spec.ts`.

**Interfaces:**
- Consumes `withTenant`, `leave-rules`, `AuthUser`, `@RequirePermission`.
- Produces `AuditService.record(tx, { actorId, action: 'create'|'update'|'deactivate'|'delete'|'decide'|'cancel', entity: string, entityId, before?, after? }): Promise<void>`
- Produces `BalancesService.summary(tx, employeeId, year): Promise<Array<{ leaveTypeId, code, name, balance, pending, available }>>` (YEARLY types only; `pending` = sum of `days` in PENDING_* requests)
- Produces `Clock` provider (`now(): Date`), overridable in tests
- Endpoints (all need auth):
  `GET /leave-types` (active), `GET /holidays?year=`, `GET /departments` (active), available to any signed-in user ·
  `GET /leave/balances?year=` (own) ·
  `POST /leave/requests {leaveTypeId, startDate, endDate, reason}` (leave.file) ·
  `GET /leave/requests?scope=mine|awaiting|all&status=` (`awaiting` = PENDING_MANAGER where I'm the employee's manager, plus PENDING_HR if I have leave.approve.hr and the request isn't mine. `all` needs leave.approve.hr) ·
  `GET /leave/requests/:id` (own, my report's, or HR) → includes `approvals[]`, `employee`, `leaveType` ·
  `PATCH /leave/requests/:id` (own, PENDING_MANAGER only) · `POST /leave/requests/:id/cancel` (own, PENDING_*)

**File / edit validation, in order, inside one `withTenant` transaction that starts with `SELECT 1 FROM "Employee" WHERE id = $1 FOR UPDATE`:**
1. `startDate <= endDate`, else 400 `"End date must be on or after start date"`
2. `startDate >= todayInManila(clock.now())`, else 400 `"Leave cannot start in the past"`
3. same calendar year, else 400 `"A request cannot cross into another year; file two requests"`
4. type active and `isEligibleToFile`, else 400 `"You are not eligible for this leave type"`
5. `days = countLeaveDays(...)` with the tenant's holidays. If 0 → 400 `"Selected dates contain no leave days"`
6. PER_EVENT: `days <= defaultDays`, else 400 `"Maximum is {defaultDays} days per request"`
7. no overlap with own PENDING_*/APPROVED requests (excluding self when editing), else 409 `"Overlaps an existing request"`
8. YEARLY: `days <= available`, else 400 `"Not enough balance (available: {n})"`
- Status: PENDING_MANAGER if the employee has a manager whose status is ACTIVE, else PENDING_HR. Audit `create`/`update`/`cancel`.
- Someone else's request (not your report, not HR) → **404** (don't reveal it exists).

- [ ] **Step 1:** Write the failing tests (clock fixed at `2026-11-10T01:00:00Z` unless stated):
  - employee files 2 VL days → 201, status `PENDING_MANAGER`, `days: 2`. Balances show `pending: 2, available: 8`
  - `depthead@acme.test` files → status `PENDING_HR`. Same after deactivating `manager@acme.test` for one of their reports
  - each validation rule 1–8 returns its exact status and message (one test each, including Sat–Sun → "no leave days", and `newhire` has no SIL row, so filing SIL → 400 balance)
  - clock `2026-11-10T23:00:00Z`: start `2026-11-11` → 201. Start `2026-11-10` → 400 past
  - two parallel `POST`s of 6 VL days each (balance 10) → exactly one 201, the other 400
  - PATCH after the manager approved → 409 `"Only requests pending manager approval can be edited"`
  - cancel → `CANCELLED`, pending released. Cancel an APPROVED request → 409 `"Approved leave cannot be cancelled yet"`
  - `employee@bayanihan.test` GET of an Acme request id → 404. Acme employee GET of a colleague's (not their report's) request → 404
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit `feat(leave): file, edit, cancel and list leave requests with balances`.

### Task 8: Approval API (manager → HR, deduction, notifications)

**Files:** Modify `leave-requests.controller/service.ts`. Create `src/notifications/notifications.service.ts`, `test/leave-approval.e2e-spec.ts`.

**Interfaces:**
- Produces `NotificationsService.notify(tx, recipientUserIds: string[], message: string, link?: string): Promise<void>`
- Endpoint `POST /leave/requests/:id/decision { decision: 'APPROVED'|'REJECTED', comment?: string }`

**Rules:**
- PENDING_MANAGER: caller must be the request employee's `managerId` (and hold leave.approve.manager), else 404. APPROVED → PENDING_HR, notify every HR user in the tenant except the requester.
- PENDING_HR: caller holds leave.approve.hr and isn't the requester, else 404 (for HR's own request: 403 `"You cannot approve your own request"`). APPROVED → APPROVED, and for YEARLY write `DEDUCT` (`days: -request.days`, `year`, `requestId`).
- REJECTED at either step: `comment` required, else 400 `"A reason is required to reject"`. Status → REJECTED.
- Status changes use `updateMany({ where: { id, status: expected } })`. Count 0 → 409 `"This request was already decided"`. The approval row, ledger row, notification and audit go in the same transaction.
- Notify the requester on every decision: `"Your {type} leave ({start}–{end}) was approved by your manager"` / `"…approved by HR"` / `"…rejected: {comment}"`. Link `/leave/{id}`.

- [ ] **Step 1:** Write the failing tests:
  - full path: employee files → manager approves (status PENDING_HR, 1 approval row) → hr approves (APPROVED, balance `balance: 8, pending: 0`, 1 DEDUCT row)
  - MAT request approved → no ledger row
  - another manager (not theirs) deciding → 404. Employee deciding → 403 (missing permission)
  - `hr@acme.test` files, manager approves; `hr@acme.test` decides → 403 own request. `hr2@acme.test` approves → APPROVED
  - reject without comment → 400. Reject with comment → REJECTED, requester has a notification containing the comment
  - two parallel HR approvals → one 200, one 409. Exactly one DEDUCT row
  - after the manager approves, HR users have a notification. The requester has one after each decision
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit `feat(leave): two-step approval with balance deduction and notifications`.

### Task 9: Web: employee leave pages

**Files:** Create `app/(app)/leave/page.tsx` (balance cards + my requests table with status filter), `leave/new/page.tsx` (type select showing only types the user is eligible for, date inputs, reason. No client-side day counting: the server computes days and its validation messages are shown on the form), `leave/[id]/page.tsx` (details, approval history timeline, Edit when PENDING_MANAGER, Cancel with confirm dialog when pending).

**Interfaces:** Consumes the Task 7 endpoints and `StatusBadge`.

- [ ] **Step 1:** Build the pages. Show server error messages inline on the form (toast for success). Show empty states ("No leave requests yet").
- [ ] **Step 2:** Verify by hand as `employee@acme.test`: file VL for next Mon–Tue, see it Pending manager, edit the dates, cancel it, and see the balance return. Filing on a weekend shows the server message.
- [ ] **Step 3:** Commit `feat(web): employee leave pages`.

### Task 10: Web: approvals page → **STOP POINT A (thin slice demo-able)**

**Files:** Create `app/(app)/approvals/page.tsx` (table of `scope=awaiting`: employee, type, dates, days, current step) and an approve/reject dialog (reason textarea, required for reject). Link each row to `/leave/[id]`, which shows the same decision buttons when the user can decide.

- [ ] **Step 1:** Build it.
- [ ] **Step 2:** Verify the full slice by hand: employee files → `manager@acme.test` approves → `hr@acme.test` approves → employee sees Approved and a reduced balance. Run `pnpm test`: all green.
- [ ] **Step 3:** Commit `feat(web): approvals page for managers and HR`. **Pause: this is the minimum presentable demo.**

### Task 11: Employees API

**Files:** Create `src/employees/{employees.module,controller,service,dto}.ts`, `test/employees.e2e-spec.ts`.

**Endpoints:**
- `GET /employees?search=&scope=all|team&status=` (`all` needs employee.read.all, `team` needs team.read and returns direct reports). Offset paging `page`, `pageSize` max 50. `// shortcut: offset paging, switch to keyset when a tenant passes ~10k employees`
- `POST /employees` (employee.write) `{ firstName, lastName, email, employeeNo, departmentId?, position, managerId?, hireDate, gender, maritalStatus, roles?: Role[] (default [EMPLOYEE]) }` → 201 `{ employee, temporaryPassword }`. Generate the password with `crypto.randomBytes(9).toString('base64url')`. Lower-case the email. Duplicate email or employeeNo → 409 with a field-specific message. Assigning roles other than EMPLOYEE at creation needs role.assign.
- `GET /employees/:id` (employee.read.all, own manager, or self)
- `PATCH /employees/:id` (employee.write). Manager can't be self or create a cycle: 400 `"Manager cannot report to this employee"`
- `POST /employees/:id/deactivate` (employee.write): status INACTIVE, user.active false. You can't deactivate yourself.
- `PUT /employees/:id/roles { roles }` (role.assign): must include EMPLOYEE. An admin can't remove their own ADMIN.
- `POST /employees/:id/reset-password` (employee.write) → `{ temporaryPassword }`
- `GET /me/profile`, `PATCH /me/profile { phone?, address? }` (self, any role, only these fields)
- Every write is audited with before/after (exclude `passwordHash`).

- [ ] **Step 1:** Write the failing tests: HR creates an employee → can log in with the temporary password. Duplicate email → 409 `"Email is already in use"`. Employee calling `GET /employees` → 403. Manager `scope=team` returns exactly their 6 reports. Deactivated employee can't log in. Manager cycle → 400. Admin sets roles; removing own ADMIN → 400 `"You cannot remove your own admin role"`. Self profile PATCH with `position` → 400 (non-whitelisted). Each write creates an AuditLog row. Bayanihan HR can't GET an Acme employee → 404.
- [ ] **Step 2:** Run them. Expected: FAIL. **Step 3:** Implement. **Step 4:** Run again. Expected: PASS.
- [ ] **Step 5:** Commit `feat(employees): employee CRUD, roles, deactivation and self profile`.

### Task 12: Web: employees, team and profile pages

**Files:** Create `app/(app)/employees/page.tsx` (search, status filter, paging), `employees/new/page.tsx` (shows the temporary password once in a dialog with a copy button), `employees/[id]/page.tsx` (edit form, roles checkboxes if `can('role.assign')`, Deactivate and Reset password with confirm dialogs, balances section placeholder for Task 15), `team/page.tsx` (direct reports + their upcoming approved leave), `profile/page.tsx`.

- [ ] **Step 1:** Build them. **Step 2:** Verify by hand as HR (create → log in as the new user in a private window), as manager (team), and as employee (profile edit).
- [ ] **Step 3:** Commit `feat(web): employee management, team and profile pages`.

### Task 13: Settings API (departments, leave types, holidays)

**Files:** Create `src/settings/{departments,leave-types,holidays}.{controller,service}.ts`, `dto`, `test/settings.e2e-spec.ts`.

**Endpoints** (writes need department.write / leaveType.write / holiday.write respectively; all audited):
- `POST|PATCH /departments[/:id]`, `DELETE /departments/:id`: hard-delete if no employees reference it, else set `active=false` and return `{ deactivated: true }`.
- `POST|PATCH /leave-types[/:id]`, `DELETE /leave-types/:id`: hard-delete if no requests or ledger rows, else deactivate. `code` can't be changed after creation.
- `POST|PATCH /holidays[/:id]`, `DELETE /holidays/:id`: always hard-delete (existing requests keep their stored `days`). Duplicate date → 409.
- `GET /leave-types?includeInactive=true` and `GET /departments?includeInactive=true` for admins.

- [ ] **Step 1:** Write the failing tests: admin creates/edits/deletes an unused department (404 afterwards). Deleting a used department → `{ deactivated: true }` and it's still listed with `includeInactive`. Same for leave types. Duplicate holiday date → 409 `"A holiday already exists on this date"`. HR calling `POST /departments` → 403. A deactivated leave type can't be filed (→ 400 not eligible).
- [ ] **Step 2–4:** Fail → implement → pass.
- [ ] **Step 5:** Commit `feat(settings): departments, leave types and holidays CRUD`.

### Task 14: Web: settings pages

**Files:** Create `app/(app)/settings/{departments,leave-types,holidays}/page.tsx`. Each is a table with a create/edit dialog and delete with confirm (toast "Deactivated because it is in use" when `{ deactivated: true }`). Holidays have a year switcher. The leave type form exposes kind, days, counting mode, eligibility, and min service months.

- [ ] **Step 1:** Build. **Step 2:** Verify by hand as `admin@acme.test`: add a company holiday next Wednesday, then as employee a Tue–Thu VL request counts 2 days.
- [ ] **Step 3:** Commit `feat(web): settings pages`.

### Task 15: Balances: grant and adjust → **STOP POINT B (professor's CRUD bar fully met)**

**Files:** Modify `balances.service.ts` and the leave controller. Create `test/balances.e2e-spec.ts`. Modify `employees/[id]/page.tsx` (balances table + Adjust dialog) and the HR dashboard placeholder (a "Grant {year} balances" button).

**Endpoints:**
- `POST /leave/balances/grant { year }` (balance.adjust) → `{ created: number }`. For each ACTIVE employee × active YEARLY type where `isEligibleForGrant(type, emp, todayInManila())` and no GRANT exists for (employee, type, year): insert GRANT `defaultDays`. Idempotent. One audit row `{ action: 'create', entity: 'LeaveGrantRun', after: { year, created } }`.
- `GET /employees/:id/balances?year=` (balance.adjust or employee.read.all)
- `POST /employees/:id/balance-adjustments { leaveTypeId, year, days (non-zero int), reason (required) }` (balance.adjust). The result must not make the balance negative: 400 `"Adjustment would make the balance negative"`.

- [ ] **Step 1:** Write the failing tests: grant 2027 → `created` = eligible count, and a second run → `created: 0`. `newhire` gets VL/SL but not SIL. An adjustment of +2 shows balance 12. An adjustment of −20 → 400. Employee calling grant → 403.
- [ ] **Step 2–4:** Fail → implement → pass. Then do the UI and verify by hand.
- [ ] **Step 5:** Commit `feat(leave): grant annual balances and HR adjustments`. **Pause: CRUD on both sides complete.**

### Task 16 (cuttable, 4th): Notifications UI

**Files:** Create `src/notifications/notifications.controller.ts`: `GET /notifications` → `{ items (latest 20), unread }`, `POST /notifications/:id/read`, `POST /notifications/read-all` (own only; others' → 404). Create `components/notification-bell.tsx` (header bell with unread count, dropdown, polls every 30 s. `// shortcut: polling, move to SSE when it matters`).

- [ ] **Step 1:** Test: after a manager approves, the requester's `GET /notifications` shows `unread: 1`, and after read-all `unread: 0`. Marking another user's notification → 404. Fail → implement → pass.
- [ ] **Step 2:** Build the bell and verify by hand. **Step 3:** Commit `feat(notifications): in-app notification list and bell`.

### Task 17 (cuttable, 3rd): Audit log screen

**Files:** Create `src/audit/audit-logs.controller.ts`: `GET /audit-logs?entity=&before=<createdAt cursor>` (audit.read), 50 per page, newest first. Create `app/(app)/audit/page.tsx` (table: when, who, action, entity, and an expandable before/after JSON).

- [ ] **Step 1:** Test: HR sees Acme rows only. Employee → 403. Fail → implement → pass.
- [ ] **Step 2:** Build the page. **Step 3:** Commit `feat(audit): audit log viewer`.

### Task 18 (cuttable, 5th, reduce to lists): Dashboards

**Files:** Create `GET /dashboard` returning only the sections the caller's permissions allow: `myBalances`, `myRecentRequests` (5), `awaitingMe` (count + 5), `teamOnLeaveThisWeek`, `headcount` (active employees by department, HR/Admin). Modify `app/(app)/dashboard/page.tsx` (cards per section, Grant button for HR from Task 15).

- [ ] **Step 1:** Test: employee response has no `headcount` key. HR has it. Manager's `awaitingMe.count` equals the seeded PENDING_MANAGER count for their reports. Fail → implement → pass.
- [ ] **Step 2:** Build. **Step 3:** Commit `feat(dashboard): role-based dashboard`.

### Task 19: Docs and demo readiness (due Thursday night) → **STOP POINT C**

**Files:** Create `README.md` (what & why, screenshots of 4 screens in `docs/screenshots/`, setup steps from Task 0, `pnpm db:setup && pnpm db:reset && pnpm dev`, demo accounts table, architecture diagram (mermaid), roadmap from spec §2 non-goals, shortcut ledger from `/ponytail-debt`). Create `ARCHITECTURE.md` (rules: tenantId + RLS on every table, `withTenant` only, permissions not roles, no heavy work in handlers, naming, deactivate don't delete, scale plan from the brainstorm). Create `docs/decisions/0001-stack.md`, `0002-rls-multitenancy.md`, `0003-prisma.md`, `0004-ledger-balances.md`. Create `docs/demo-script.md` (5-minute click path + "how to explain" talking points per part).

- [ ] **Step 1:** Write the docs. Run `/ponytail-audit` over the repo and fix anything rated as a bug or risk.
- [ ] **Step 2:** Rehearse: `pnpm db:reset`, follow the demo script end to end, record a backup screen video.
- [ ] **Step 3:** Commit `docs: README, architecture, decisions and demo script`.

### Task 20 (stretch, cut 1st and 2nd): CI and end-to-end test

- [ ] **Step 1 (cut 2nd):** Playwright test `apps/web/e2e/leave-flow.spec.ts`: employee files → manager approves → HR approves → employee sees "Approved". Run against `pnpm db:reset` data. Commit.
- [ ] **Step 2 (cut 1st):** `.github/workflows/ci.yml`: Postgres 18 service, run setup.sql, migrate, `pnpm test`, `pnpm --filter web build`. README badge. Commit.

---

## Suggested schedule

| When | Tasks |
|---|---|
| Tue night | 0, 1, 2 |
| Wed | 3–10 (Stop A) |
| Thu | 11–15 (Stop B), 19 (Stop C); 16–18 only if ahead |
| Fri morning | `pnpm db:reset`, rehearse once, present |
