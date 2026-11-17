# HRMS — Foundation + Leave Management (Milestone 1) Design

Date: 2026-11-10 · Status: draft for approval
Source: "HRMS Brainstorming Summary" (owner's earlier brainstorm) + design conversation.

## 1. Intent and the why

A multi-tenant Human Resources Management System (many client companies, one system) with three sides: **admin/HR**, **manager**, **employee**. Built on free tools.

Priorities, in order:

1. **School submission + live presentation on Friday 2026-11-13.** The professor's only requirement: _CRUD operations working on both the user (employee) side and the admin side._ No rubric or required documents.
2. **Portfolio piece afterwards**, judged mainly from the GitHub repo (code, README, architecture write-up, tests).
3. Possibly sold to companies someday — not a driver now, but don't paint it into a corner.

The owner is a student who must **understand and explain every part** in the presentation Q&A. So the build happens in small pieces the owner reviews and learns from (§9).

## 2. Goals, non-goals, anti-goals

**Goals (Milestone 1 / Friday)**

- Foundation: sign-in, companies (tenants) isolated by Postgres Row-Level Security, fixed roles with permission guards, departments, employees with reporting lines, audit log.
- One complete showcase workflow: **Leave Management** with Philippine defaults and a two-step approval (manager → HR).
- Visible CRUD on both sides (§6).
- Reliable live demo: one-command local start, seeded demo data, reset script.
- Repo that reads well: README, ARCHITECTURE.md, tests for the risky logic.

**Non-goals for Milestone 1** (go on the README roadmap / final presentation slide): Excel import/export, email notifications, approval handoff-while-away and fallback-approver chains, field-level hiding of salary/government IDs, custom roles UI, configurable approval-chain UI, platform-owner UI, leave cash conversion, automatic accrual, MFA, Redis/BullMQ, deployment/hosting, all other modules (attendance, payroll, recruitment, performance, L&D, benefits, expenses). Also still out of scope from the brainstorm: AI, mobile app, third-party integrations.

**Anti-goals** (failure even if it "works")

- The demo breaks in front of the class.
- Code the owner can't explain.
- Over-built: abstractions, config, or scale machinery with no current use (see Ponytail, §8).
- One company able to see another's data.

## 3. Constraints

- **Deadline:** working and presentable by Friday 2026-11-13 (~3 days). Owner can put in many hours, but review/learning time is the bottleneck.
- **Zero cost:** free tools only. No hosting needed for Friday (demo runs locally).
- **Machine:** Windows laptop. Installed: Node 24, git. **Not installed: pnpm, Docker.** pnpm is enabled via `corepack enable`. Postgres source is open (§11-1).
- **Philippine context:** first country rules are Philippine labor law; Data Privacy Act is the relevant privacy law (for the write-up).

## 4. Approaches considered

|                 | Approach                                                                                                                        | Trade-off                                                                                                                                                                                                                         |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A ✅ chosen** | Planned stack, trimmed: NestJS API + Next.js web in a pnpm monorepo, Prisma, Postgres + RLS. Redis/BullMQ dropped until needed. | Matches the brainstorm and long-term plan — nothing thrown away after Friday. NestJS's controller → service → database layering (with guards in front) is easy to explain. Costs ~half a day of setup and two apps to understand. |
| B               | Next.js only (route handlers/server actions) + Prisma + Postgres                                                                | Fastest, least code to learn. Drops NestJS; later migration means a backend rewrite; permission checks less structured.                                                                                                           |
| C               | Supabase (DB + auth + RLS) + Next.js                                                                                            | Auth and tenant isolation nearly free. Little backend code of the owner's own to show; vendor lock-in; departs from the brainstorm.                                                                                               |

Owner picked **A**. B remains the emergency fallback if setup goes badly — not planned.

**ORM:** Prisma over Drizzle (decided — already in the stack, more learning material; RLS works via a per-request transaction, §7).

## 5. What the owner decided

- Multi-tenant, shared database, `tenant_id` on every tenant-owned table, enforced by Postgres RLS (from brainstorm).
- UUIDv7 IDs; JWT access token + refresh token in an httpOnly cookie; string permissions checked by NestJS guards (from brainstorm).
- Showcase workflow = **Leave**.
- Leave rules: **Philippines first**, built as a configurable engine with a Philippine preset, so another country is a new preset, not new code.
- Approval flow: **employee → direct manager** (operational/schedule check) **→ HR** (policy verification, record-keeping). HR approval makes it official.
- Fallback when a manager can't approve (manager's manager, then HR) and handoff-while-away: **agreed as the design**, deferred past Friday.
- Working style: small pieces, owner reviews and learns from each (§9).
- Skills: ui-ux-pro-max for UI; Ponytail as the "senior dev who hates unnecessary code" (§8).
- Friday is a school submission + presentation; CRUD on both sides is the bar.

## 6. Scope for Friday

### Roles (fixed for Milestone 1)

| Role          | Can                                                                                                |
| ------------- | -------------------------------------------------------------------------------------------------- |
| Company Admin | Company settings, users/roles assignment, departments, leave types, holidays                       |
| HR            | All employee records (CRUD), final leave approval/rejection, grant/adjust balances, view audit log |
| Manager       | View own team, first-step leave approval/rejection, team leave calendar/list                       |
| Employee      | View/edit own profile (limited fields), view own balances, file/edit/cancel own leave              |

A user can hold several roles (an HR officer is also an employee who files leave). Permissions are named strings (e.g. `employee.read`, `leave.approve.manager`, `leave.approve.hr`) mapped to roles in code/seed; guards check permissions, not role names — so custom roles later need no rewrite.

### CRUD map (the professor's bar)

| Side       | Create / Read / Update / Delete                                                                    |
| ---------- | -------------------------------------------------------------------------------------------------- |
| Admin / HR | Employees, departments, leave types, holidays; approve/reject leave; balance adjustments           |
| Manager    | Read team; approve/reject leave                                                                    |
| Employee   | Own profile (read/update), own leave requests (create, read, update while pending manager, cancel) |

"Delete" for employees means **deactivate** (soft) — HR records are never hard-deleted. Leave requests are cancelled, not deleted. Departments/leave types/holidays may be hard-deleted only when unused, otherwise deactivated. _(Builder's call on exact mechanics.)_

### Leave Management

**Philippine preset (seeded per company, editable by admin):**
| Type | Days | Counting | Eligibility (Friday) |
|---|---|---|---|
| Service Incentive Leave (Labor Code Art. 95) | 5 / year | working days | ≥ 12 months service |
| Vacation Leave (company-defined) | e.g. 10 / year | working days | everyone |
| Sick Leave (company-defined) | e.g. 10 / year | working days | everyone |
| Maternity (RA 11210) | 105 per event (+15 if solo parent — roadmap) | calendar days | female |
| Paternity (RA 8187) | 7 per event | working days | male, married |

Roadmap preset additions: Solo Parent Leave (RA 8972 as amended by RA 11861 — 7 working days, ≥ 6 months service), VAWC leave (RA 9262 — 10 days), Special Leave for Women (RA 9710 — up to 60 days), maternity extras, SIL cash conversion, SIL exclusions for small establishments.

Leave type config fields (engine, not hard-coded): name, code, default days, counting mode (`WORKING_DAYS` | `CALENDAR_DAYS`), eligibility (gender, marital status, minimum service months), requires attachment (bool, attachment upload itself may be roadmap), active.

**Balances are a ledger.** Each change is a row: `GRANT`, `ADJUST` (+/-, with reason, by HR), `DEDUCT` (on final approval), `RESTORE` (if an approved leave is later cancelled — roadmap). Balance = sum of entries for (employee, leave type, year). **Pending** days are not ledger rows: available = balance − days in the employee's pending requests of that type. _(My call: avoids hold/release rows; same behaviour.)_ Grants for Friday come from the seed plus an HR "grant annual balances" action — no automatic accrual.

**Day counting:** working-days types skip Saturdays, Sundays, and the company's holidays; calendar-days types count every day. Whole days only for Friday (half-days roadmap). _(My call.)_ Holidays: seeded Philippine 2026 regular + special non-working days per company; admin CRUD on holidays is in scope.

**Request lifecycle**

```
PENDING_MANAGER → (manager approves) → PENDING_HR → (HR approves) → APPROVED [DEDUCT entry written]
       │                                   │
       ├─ manager rejects → REJECTED       ├─ HR rejects → REJECTED
       └─ employee cancels → CANCELLED     └─ employee cancels → CANCELLED
```

- Submit validates: eligibility, dates not in the past (_my call; HR may need backdating later_), no overlap with the employee's own pending/approved requests, enough available balance.
- Rejection requires a reason. Rejected requests are final; the employee files a new one.
- Employee may **edit** only while `PENDING_MANAGER`; may **cancel** while pending. Cancelling an `APPROVED` request = roadmap (goes back through HR).
- Each decision is stored as an approval record (step, approver, decision, comment, timestamp) — the history shown on the request page.
- **Friday fallback rule:** an employee with no manager (e.g. a department head) skips straight to `PENDING_HR`. Nobody approves their own request at any step; an HR officer's own request must be approved by a different HR user. _(Full fallback chain + handoff deferred.)_
- Concurrency: approval and deduction happen in one database transaction; a step can only be decided once (status check in the same transaction). _(My call.)_

**Notifications (Friday):** in-app list only — to manager on submit, to HR after manager approval, to employee on each decision. Unread count in the header.

**Audit log (Friday):** every create/update/deactivate on employees, departments, leave types, holidays, balance adjustments, and every leave decision → row with tenant, actor, action, entity, entity id, before/after JSON, timestamp. HR/Admin get a basic read-only list.

### Dashboards

Simple role-based landing pages: Employee (balances, recent requests), Manager (requests awaiting me, team on leave this week), HR (requests awaiting HR, headcount), Admin (setup links). _(Exact content: builder's call, guided by ui-ux-pro-max.)_

## 7. Architecture (decided parts)

- **Repo:** pnpm workspace monorepo, `apps/api` (NestJS), `apps/web` (Next.js App Router). Shared package only if real duplication appears (Ponytail).
- **Tenancy & RLS:** every tenant-owned table has `tenant_id` (indexes lead with `tenant_id`) and an RLS policy `tenant_id = current_setting('app.tenant_id')::uuid`. The API connects as a **non-owner, non-superuser** DB role so RLS actually applies. Each request runs its queries inside a transaction that first calls `set_config('app.tenant_id', <from JWT>, true)` (Prisma client extension or equivalent). Migrations/seed run as the owner role. **A test must prove** a user of Company A cannot read or write Company B's rows even if the query forgets to filter.
- **Auth:** email + password (hashed with argon2 or bcrypt — builder's call), email unique across the system (_my call; simplest login_). Access JWT (~15 min) carries user id, tenant id, roles; refresh token in httpOnly cookie. No sign-up page — users created by admin/HR or seed. Platform-owner functions (creating tenants) = seed only for Friday.
- **Permissions:** `@RequirePermission('leave.approve.hr')`-style guard in NestJS. Ownership checks (own profile, own requests, own team) in services.
- **No heavy work in request handlers** — nothing heavy exists in Milestone 1, so no queue yet. Documented as a rule in ARCHITECTURE.md.
- **Scale:** documented in ARCHITECTURE.md (partitioning, keyset pagination, pooling, caching, queues) but not built. Deliberate shortcuts carry `shortcut: <ceiling>, <upgrade trigger>` comments (Ponytail convention).
- **Frontend:** Next.js App Router, Tailwind CSS + shadcn/ui, responsive (phone + desktop), accessibility first per ui-ux-pro-max.
- **Testing:** API unit/integration tests (Jest, NestJS default) against a real Postgres for RLS, permissions, balance math, day counting, and the approval state machine. One Playwright end-to-end happy path (submit → manager → HR → balance updated) if time allows. GitHub Actions CI is a stretch goal.
- **Docs:** README (what it is, screenshots, how to run, demo accounts, roadmap, shortcut ledger), ARCHITECTURE.md (rules from the brainstorm), short decision records (stack, RLS, Prisma, ledger balances).

## 8. Skills used during the build

UI: **ui-ux-pro-max** (primary), tailwind-design-system, react-ui-patterns, nextjs-app-router-patterns.
Lean code: **ponytail** (full level) while building, **ponytail-review** on each piece before the owner sees it, **ponytail-debt** for the shortcut ledger. Where Ponytail conflicts with this design, the design wins and the trade-off is written down.
Conventions: cc-skill-coding-standards, typescript-expert, lint-and-validate.
Backend: nestjs-expert (note: it leans TypeORM — use prisma-expert for data), prisma-expert, postgres-best-practices, auth-implementation-patterns, cc-skill-security-review.
Testing: test-driven-development, javascript-testing-patterns, e2e-testing-patterns.
Build/repo/docs: monorepo-management, docker-expert, github-actions-templates (stretch), architecture-decision-records, readme, commit.

## 9. How the work is delivered

- One small piece at a time (e.g. "leave tables + migration + tests", "manager approval endpoint"), never a whole module at once.
- Each piece comes with: what it does, why it's built this way, concepts involved, what to look at first, and a short **"how to explain this"** note usable for slides/Q&A.
- Owner reviews and approves before the next piece. One commit per piece.
- **Order should protect Friday:** get a thin end-to-end slice (login → file leave → manager → HR → balance) working early, then widen CRUD screens, then polish/docs. Demo-readiness (seed, reset script, backup screen recording) is planned work, not an afterthought — due Thursday night.

## 10. Demo data

Two companies (to show isolation), each with departments, ~10–15 employees with a reporting tree, one account per role with known demo passwords (listed in README, demo only), seeded balances, 2026 PH holidays, and a few requests in each status. A reset script restores this state before presenting.

## 11. Open items

1. **Postgres on Windows:** install Docker Desktop (enables one-command start; needs WSL2, can be slow to set up), install Postgres natively, or use a free hosted Postgres (Neon/Supabase free tier; needs internet during the demo). _Owner to decide._
2. Exact field lists per entity — builder's call within reason (employee: names, email, employee number, department, position, manager, hire date, gender, marital status, status).

## 12. Left to the builder

Folder structure inside each app, validation library, component breakdown, page layouts and visual style (via ui-ux-pro-max), test file organisation, exact seed contents, naming beyond ARCHITECTURE.md conventions, and the precise order of pieces in the plan (respecting §9).
