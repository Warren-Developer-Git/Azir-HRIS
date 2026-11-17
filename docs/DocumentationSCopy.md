# Enterprise Multi-Tenant Human Resources Management System (HRMS) — Complete Project Documentation

> **Document Purpose:** Master reference soft copy prepared for capstone submission and technical documentation compilation. Every module, library, architecture choice, and development phase below reflects the verified implementation in this repository.

---

## 1. Title

**Azir Company Global Tech (ACGT) — Enterprise Multi-Tenant Human Resources Management System (HRMS) with Philippine Labor Law Compliance, Row-Level Security, and Cloud Storage Integration**

- **Project Type:** Full-Stack Multi-Tenant Web Application (Monorepo)
- **Target Domain:** Philippine Human Resources, Leave Administration, Attendance/DTR, Statutory Payroll, and Verifiable Document Issuance
- **Repository Workspace Structure:** `pnpm` Monorepo (`apps/web` Next.js Frontend + `apps/api` NestJS REST API)

---

## 2. Description of the System

The **Enterprise Multi-Tenant Human Resources Management System (HRMS)** is a full-stack web platform built to automate end-to-end human resource operations for Philippine organizations while enforcing strict tenant data isolation at the database engine level.

Unlike single-company HR tools that rely solely on application-level `WHERE` filters, this system enforces multi-tenancy inside **PostgreSQL Row-Level Security (RLS)** using a dual-role database architecture (`hrms_owner` for schema migrations and seeding; non-superuser `hrms_app` with `NOBYPASSRLS` for all runtime HTTP transactions scoped via `set_config('app.tenant_id', ...)`). Multiple independent companies (demonstrated via **Azir Company Global Tech** and **Bayanihan Foods**) share the same database schema without any possibility of cross-tenant data leakage.

The business domain implements deterministic **Philippine Labor Code** and statutory compliance rules in the `Asia/Manila` timezone across:
- **Leave Entitlements & Double-Entry Ledger Accounting** (SIL Art. 95, RA 11210 Expanded Maternity Leave, RA 8187 Paternity Leave, VL/SL, and holiday-aware working-day calculation),
- **Daily Time Records (DTR) & Official Business (OB) / Missed Punch Rectification**,
- **Semi-Monthly Philippine Payroll & Statutory Remittances** (SSS, PhilHealth, Pag-IBIG/HDMF, BIR TRAIN Law withholding tax),
- **Tamper-Evident HR Document Issuance** with scannable **QR verification**,
- **Cloud Object Storage** for employee avatars and supporting leave documents,
- **Automated Email & Holiday Integrations** with zero-cost cloud deployment readiness (**Vercel + Render + Supabase + GitHub Actions CI/CD**).

### System Architecture Overview

```text
Browser (Responsive Light/Dark Web UI)
   │
   ▼ HTTPS (X-Frame-Options, CSP, nosniff)
Next.js 16 App Router (Vercel — apps/web)
   │  Server-side `/api/*` Proxy Rewrite (API_URL)
   │  Preserves same-origin HttpOnly SameSite=Lax refresh cookies
   ▼
NestJS 12 REST API (Render Docker Container — apps/api)
   ├── Security Pipeline: Helmet, Compression, CORS, RequestLogger,
   │                      ValidationPipe, ThrottlerGuard, JwtAuthGuard, PermissionsGuard
   ├── Modules (12 NestJS modules + HealthController): Auth, Employees, Leave, Attendance, Payroll, Documents,
   │                                                    Settings, Dashboard, Notifications, Storage, Audit, Prisma, Common
   ├── External Integrations: Nager.Date Public Holidays API, Gmail SMTP / Resend API
   ├── Cloud Object Storage: Supabase Storage REST API (`sb_secret_` / `service_role`) + Local Disk Fallback
   ▼
PostgreSQL 16+ Database (Supabase / Local)
   ├── Role `hrms_app` (Runtime DML + Row-Level Security policies on tenant tables)
   ├── Role `hrms_owner` (Prisma schema migrations & seed administration)
   └── 21 Relational Models (UUIDv7 primary keys, append-only AuditLog & LeaveLedgerEntry)
```

---

## 3. Features of the System

### A. Multi-Tenant Authentication, RBAC & Field-Level Security
- **JWT + HttpOnly Refresh Token Rotation (`/login`, `apps/api/src/auth`):** Short-lived Bearer access tokens (`15m`) kept in memory on the client alongside `7d` refresh tokens stored in `httpOnly`, `SameSite=Lax`, `Secure` (in production) cookies. Fail-closed production checks require `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` whenever `NODE_ENV=production`.
- **Role-Based Access Control (4 Roles, 27 Fine-Grained Permissions):**
  - `EMPLOYEE`: Self-service leave filing, attendance punching/corrections, document requests, payslip viewing, profile/password management.
  - `MANAGER`: Team direct-report overview (`/team`), Step-1 leave approvals, 1-step OB/missed punch approvals, team notifications.
  - `HR`: Full directory & employee onboarding, Step-2 final leave approvals, leave balance grants & adjustments, payroll period/run generation & CSV/register export, document request issuance, audit log inspection.
  - `ADMIN`: Tenant-wide policies (leave types, holidays, departments), role assignment, payroll run approval & locking, system-wide audit access.
- **Field-Level Compensation Protection:** Unauthorized team reads (`GET /employees?scope=team` or manager views without `employee.write` / `payroll.view.all`) automatically strip `basicSalary` and `allowances` before serialization.
- **Self-Service Password Management:** Employees can change passwords from `/profile` with old-password verification (`bcryptjs`), minimum length validation, and audit logging.

### B. Role-Based Dashboard (`/dashboard`)
- Displays role-tailored widgets: personal leave balance breakdown, recent filings, team/company awaiting-approval queues, employees currently out-of-office, and department headcount summaries.

### C. Employee Directory, Team View & Profile Storage (`/employees`, `/team`, `/profile`)
- **Employee Onboarding & Management (`/employees/new`, `/employees/[id]`):** Create employees with department assignment, reporting manager hierarchy, gender/marital eligibility attributes, base salary/allowances, role assignment, and status lifecycle (`ACTIVE` / `INACTIVE`).
- **Profile Photo Cloud Upload & Gender-Silhouette Fallback (`/profile`):**
  - Client-side `400x400` center-cropped image encoding uploaded via multipart `FormData` to `POST /me/avatar` and `DELETE /me/avatar`.
  - Validated server-side via magic bytes (`JPEG`, `PNG`, `WEBP`), `2 MB` size limit, UUID-randomized object keys (`public/<tenantId>/avatars/<uuid>.<ext>`), and cleanup of replaced/orphaned objects.
  - Displays clean monochrome male/female silhouette SVG placeholders when no photo is set.

### D. Philippine Statutory Leave Management & Double-Entry Ledger (`/leave`, `/leave/new`, `/leave/[id]`, `/approvals`)
- **Pure Domain Compliance Engine (`Asia/Manila`):** Deterministic pure rules in `apps/api/src/leave/leave-rules.ts` enforcing:
  - **Vacation Leave (VL)** & **Sick Leave (SL)** (10 working days default)
  - **Service Incentive Leave (SIL — Labor Code Art. 95):** 5 working days, gated at `>= 12` months tenure
  - **Maternity Leave (RA 11210):** 105 calendar days for female employees
  - **Paternity Leave (RA 8187):** 7 working days for married male employees
- **Holiday & Overlap Validation:** Excludes Sundays and tenant Philippine Regular/Special holidays; blocks cross-year requests and overlapping active requests using PostgreSQL row locks (`FOR UPDATE`).
- **Double-Entry Leave Balance Ledger:** Immutable append-only `LeaveLedgerEntry` records (`GRANT`, `DEDUCT`, `ADJUST`) compute live available balances and guard against negative adjustments.
- **Adaptive Multi-Step Approval Workflow:**
  - Standard employees route through **Manager (Step 1) -> HR (Step 2)** with optimistic concurrency checks (`409 Conflict` protection).
  - Administrative/Manager filers use streamlined 1-step approval routing.
- **Deferred Cloud Supporting Document Attachments:**
  - Leave types with `requiresAttachment = true` enforce uploading `PDF`, `PNG`, `JPEG`, or `WEBP` files (`<= 5 MB`) stored under private tenant-scoped paths (`tenants/<tenantId>/leave-attachments/<uuid>.<ext>`).
  - Files remain client-side until form submission so abandoned drafts do not create orphan cloud objects.
  - Authorized tenant members download attachments securely on `/leave/[id]` via `GET /storage/download` with cross-tenant `403 Forbidden` isolation.

### E. Attendance, Daily Time Records (DTR) & Official Business (OB) (`/attendance`)
- **Web Clock-In / Clock-Out:** Records punches in `Asia/Manila` timezone with location tagging (`OFFICE`, `FIELD_CLIENT_SITE`, `REMOTE_WFH`).
- **DOLE Tardiness & Undertime Rules:** Evaluates `09:00–18:00` standard shift with 15-minute grace window and calculates minute-rate tardiness/undertime deductions.
- **Correction & OB Slip Workflow:** Employees submit missed-punch corrections or Official Business slips; 1-step manager approval automatically rectifies DTR status and waives tardiness/absence penalties for approved field work.

### F. Philippine Statutory Payroll & Register Reporting (`/payroll`, `/payroll/my-payslips`)
- **Payroll Period & Batch Calculation:** Computes semi-monthly gross-to-net pay incorporating unpaid leaves, attendance deductions, `1.25x` overtime, allowances, bonuses, and manual payroll adjustments (`PayrollAdjustment`).
- **Philippine Statutory Engines:** Computes employee & employer shares for **SSS**, **PhilHealth**, **Pag-IBIG (HDMF)**, and **BIR TRAIN Law** withholding tax tables.
- **Statutory Remittance, Register Export & Payslips:**
  - 1-click **CSV Payroll Register** export and HTML-escaped printable **A4 Accounting Summary**.
  - Multi-stage run lifecycle (`DRAFT` -> `SUBMITTED` -> `APPROVED` / locked) releasing employee self-service payslips automatically upon approval.

### G. Verifiable HR Documents & QR Verification (`/documents`, `/documents/manage`, `/verify/[code]`)
- **Document Request Lifecycle:** Supports Certificate of Employment (COE), COE with Compensation, Leave Balance Certification, and Certified Payslips with DOLE SLA tracking and HR approval queues.
- **Official Printable / Offline Templates & QR Verification:**
  - Embeds company branding and transparent HR e-signature assets with inline base64 support for clean A4 printing and offline `.html` download.
  - Issues unique verification codes (`IssuedDocument`) and scannable QR codes linked to the public `/verify/[code]` portal (`GET /documents/verify/:code`), displaying masked integrity confirmation without exposing private PII.

### H. External APIs & Cloud Services Integration
- **Public Holidays Auto-Sync (`Nager.Date` REST API):** Fetches official Philippine national holidays by year (`GET /holidays/external-preview`, `POST /holidays/sync`) with year bounds (`2000–2100`) and tenant duplicate protection (`skipDuplicates`).
- **Automated & Manual Email Notifications (`Gmail SMTP` via Nodemailer + `Resend` HTTPS Fallback):**
  - Sends HTML-escaped transactional emails for leave filings/decisions, attendance corrections, document approvals, and payslip releases, plus manual manager/HR team announcements (`10 req/min` throttled).
  - Supports `EMAIL_DEMO_OVERRIDE` to redirect synthetic `.test`/`.local` demo addresses safely to a test inbox, plus automatic `LOG_ONLY` fallback when credentials are omitted.
- **Cloud Object Storage (`Supabase Storage` REST + Local Disk Fallback):**
  - Supports modern Supabase `sb_secret_...` keys (`apikey` header) and legacy `service_role` JWTs (`Authorization: Bearer` + `apikey`), falling back cleanly to local disk (`apps/api/uploads/`) when cloud env vars are omitted.

### I. Organization Settings, Audit Trail & Application Security (`/settings`, `/audit-logs`)
- **Settings Management & Safe Soft-Deactivation:** Create/edit/deactivate departments, leave policies, and company holidays; in-use departments/leave types automatically soft-deactivate (`active = false`) instead of deleting historical records.
- **Immutable Compliance Audit Trail:** Records actor, action, entity, and before/after JSON snapshots across mutations; `hrms_app` PostgreSQL permissions explicitly revoke `UPDATE` and `DELETE` on `"AuditLog"`.
- **Security Hardening:** HTTP `helmet()`, `compression()`, strict `APP_WEB_URL` CORS allowlist, `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`), Next.js security headers (`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, `Content-Security-Policy`), and Express `trust proxy` configuration.

---

## 4. Tech Stack Used

| Layer | Technology / Library | Purpose & Verified Role in System |
|---|---|---|
| **Monorepo & Runtime** | **Node.js v24**, **pnpm 12.18.0** (`pnpm-workspace.yaml`), **TypeScript 5** | Manages shared workspace dependencies and end-to-end strict TypeScript checking across `apps/web` and `apps/api`. |
| **Frontend Framework** | **Next.js 16.4.6** (App Router, Turbopack), **React 19.3.0** | Server/client routing, `/api/*` reverse-proxy rewrites (`API_URL`), security headers, and multi-page HR portal. |
| **Frontend Styling & UI** | **Tailwind CSS 4.3.3**, **Lucide React 1.71**, `clsx`, `tailwind-merge`, `qrcode 1.5.4` | Monochrome Light/Dark theme UI, responsive layouts, icons, and client QR generation on certificates. |
| **Backend Framework** | **NestJS 12.0.1** (`@nestjs/core`, `@nestjs/platform-express`) | Modular REST API architecture (`13` modules), dependency injection, guards, interceptors, and exception handling. |
| **Database & ORM** | **PostgreSQL 16+**, **Prisma ORM 6.4.1** (`@prisma/client`, `prisma`) | Type-safe queries across `21` relational models, non-destructive SQL migrations, UUIDv7 IDs, and PostgreSQL RLS enforcement. |
| **Authentication & AuthZ** | **@nestjs/jwt 12.0.4**, **bcryptjs 3.0.3**, **cookie-parser 1.4.7** | Access/refresh JWT signing, password hashing, `httpOnly` cookie handling, and 27-permission RBAC guards. |
| **Validation & Security** | **class-validator 0.15.1**, **class-transformer 0.5.1**, **helmet 8.3.0**, **compression 1.8.2**, **@nestjs/throttler 6.7.1**, **multer** | Strict DTO validation, HTTP security headers, gzip compression, global/route rate limiting, and in-memory multipart upload limits. |
| **External APIs & Cloud** | **Supabase Storage REST API**, **Nodemailer 10.5.0** (Gmail SMTP), **Resend REST API**, **Nager.Date Public Holidays API** | Cloud bucket object storage (`sb_secret_` / `service_role`), transactional email delivery, and Philippine holiday sync. |
| **Testing & Code Quality** | **Vitest 4.1**, **Supertest**, **Node `node:test`**, **Oxlint 1.58**, **ESLint 9** (`eslint-config-next`) | TDD unit tests (`16` API suites / `76` tests + Web proxy tests), PostgreSQL RLS E2E suite, static type-aware linting. |
| **Containerization & CI/CD** | **Docker** (`node:24-alpine` multi-stage), **GitHub Actions** (`ci.yml`, `cd.yml`), **Vercel**, **Render** | Reproducible container builds, automated Postgres 16 E2E + lint + build CI pipeline, and `$0` cloud deployment blueprints. |

---

## 5. Process of Development

This project was engineered using a structured **Spec-Driven Development (SDD) + Test-Driven Development (TDD) + Review-First** workflow across 13 structured capstone activities:

### Stage 1: Brainstorming, Requirements Scoping & Architecture Decisions
- Initialized project scope from the HRMS brainstorming brief, prioritizing multi-tenant isolation, Philippine labor law accuracy, and zero-cost infrastructure portability.
- Recorded core technical decisions as **Architecture Decision Records (ADRs)** in `docs/decisions/`:
  - `0001-stack.md` (NestJS + Next.js + PostgreSQL monorepo),
  - `0002-rls-multitenancy.md` (dual-role `hrms_owner` / `hrms_app` PostgreSQL Row-Level Security),
  - `0003-prisma.md` (Prisma schema & migration workflow),
  - `0004-ledger-balances.md` (append-only double-entry leave ledger).

### Stage 2: Spec-Driven Design (SDD) & Implementation Planning
- Before major modules were coded, written specifications (`docs/superpowers/specs/`) and atomic implementation plans (`docs/superpowers/plans/`) defined exact schemas, API contracts, failure modes, and tenant boundaries:
  - Foundation & Leave (`2026-11-10-hrms-foundation-leave-design.md`)
  - Attendance/DTR & Payroll (`2026-11-12-hrms-attendance-dtr-spec.md`, `2026-11-12-hrms-payroll-attendance-spec.md`)
  - External APIs & Security Middleware (`2026-11-16-external-apis-and-middleware-spec.md`)
  - Cloud Object Storage (`2026-11-16-cloud-storage-design.md`)
  - Deployment & CI/CD (`2026-11-17-deployment-cicd-design.md`)

### Stage 3: Iterative Build Phases & Database Evolution (Non-Destructive Migrations)
- Features were built incrementally across 8 non-destructive Prisma migrations in `apps/api/prisma/migrations/`:
  1. `init` & `rls` — Core tenant, user, employee, department, leave, holiday, notification, and audit schema + RLS policies and `app_login_lookup` function.
  2. **Foundation, Auth & Leave Management** — Pure `Asia/Manila` leave engine, double-entry ledger, 2-step approval workflow, RBAC guards, and HR balance management.
  3. **Employee Self-Service & Brand Identity (`add_employee_avatar_url`)** — Organization branding (**Azir Company Global Tech**), password self-service, and initial profile avatar support.
  4. **Verifiable HR Documents (`add_document_requests`, `document_rls_and_verify`)** — Document request workflows, offline/print certificate templates, HR e-signature rendering, and `app_verify_document` public QR verification.
  5. **Philippine Statutory Payroll (`add_payroll`)** — Semi-monthly payroll periods/runs, SSS/PhilHealth/Pag-IBIG/BIR TRAIN computations, CSV register export, accounting print summary, and payslips.
  6. **Attendance, DTR & OB (`add_attendance`)** — Web clock-in/out with location tags, grace-period/undertime calculation, and 1-step OB/missed-punch rectification integrated into payroll.
  7. **External APIs & Security Middleware** — Nager.Date holiday preview/sync, Gmail SMTP + Resend transactional email dispatcher (`EMAIL_DEMO_OVERRIDE`), `helmet()`, `compression()`, CORS, `RequestLoggerMiddleware`, and `@nestjs/throttler`.
  8. **Cloud Object Storage (`add_storage_fields`)** — `StorageService` / `StorageController` with magic-byte validation, `Employee.avatarKey`, `LeaveRequest.attachmentKey`/`attachmentName`, live Supabase bucket (`azir-hris-files`) integration, and deferred attachment upload on leave submit.

### Stage 4: Strict Test-Driven Development (TDD: RED -> GREEN -> REFACTOR)
- Every critical rule and integration path followed **RED -> GREEN TDD**:
  1. **RED:** Write failing unit/integration tests verifying the exact requirement and observe failure (`leave-rules.spec.ts`, `attendance-rules.spec.ts`, `payroll-calculator.spec.ts`, `storage.service.spec.ts`, `storage.controller.spec.ts`, `profile-avatar.spec.ts`, `leave-attachment.spec.ts`, `email-templates.spec.ts`, `holidays-sync.spec.ts`, `security-hardening.spec.ts`, `employees-security.spec.ts`, `app.setup.spec.ts`, `health.controller.spec.ts`, `proxy-url.test.ts`).
  2. **GREEN:** Implement minimal, clean code to pass all assertions.
  3. **REFACTOR & VERIFY:** Extract shared helpers (eliminating duplicated logic such as JWT secret resolution, cookie options, and Supabase auth headers) and re-run full Vitest, TypeScript (`tsc --noEmit`), and linter (`oxlint` / `eslint`) suites.

### Stage 5: Pre-Deployment Security Audit & Remediation
- Conducted a structured security review across auth, RBAC, RLS, file storage, XSS sinks, and secrets handling:
  - Enforced fail-closed JWT secrets in `NODE_ENV=production` (`jwt-secrets.ts`),
  - Matched `secure` cookie flag on `logout()`,
  - Masked `basicSalary` and `allowances` on unauthorized manager/team reads,
  - Restricted `UpdateProfileDto.avatarUrl` to safe URI schemes and sizes,
  - Added Next.js HTTP security headers (`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `Content-Security-Policy`) and HTML-escaped print `<title>` templates,
  - Migrated Supabase Storage integration to support modern non-JWT `sb_secret_` API keys and deactivated legacy JWT keys.

### Stage 6: Containerization, CI/CD & Documentation
- Prepared production deployment artifacts (`apps/api/Dockerfile`, `.dockerignore`, `apps/api/prisma/supabase-init.sql`, `render.yaml`, `apps/web/vercel.json`, `.github/workflows/ci.yml`, `.github/workflows/cd.yml`) including `trust proxy` configuration, `API_URL` rewrite proxy, and `/health/ready` DB probing.
- Consolidated architecture specs, demo script, and this master project documentation for capstone review and repository handover.

---

## 6. Verified Verification Metrics (As of Final Check)

- **API Unit Test Suite (`pnpm --filter api exec vitest run --configLoader native`):** `16` test files passed, `76` tests passed (`0` failures).
- **Web Proxy Unit Suite (`node --test apps/web/lib/proxy-url.test.ts`):** `3` tests passed (`0` failures).
- **TypeScript Compilation (`tsc --noEmit --incremental false`):** `0` errors in both `apps/api` and `apps/web`.
- **API Static Linting (`oxlint --type-aware src/ test/`):** `0` errors across `122` files.
- **API E2E Suite (`vitest.config.e2e.ts`):** Automated in `.github/workflows/ci.yml` against `postgres:16-alpine` + full RLS dual-role setup (`setup.sql` + `prisma migrate deploy`).
