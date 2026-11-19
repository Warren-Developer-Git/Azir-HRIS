# Azir Company Global Tech (ACGT) — Enterprise Multi-Tenant HRMS

A production-grade, multi-tenant **Human Resources Management System** specialized for **Philippine Labor Law Compliance** across **Leave Management**, **Attendance / DTR / Official Business (OB)**, **Statutory Payroll**, **Verifiable HR Documents**, and **Cloud Object Storage**, with database-level tenant isolation enforced by **PostgreSQL Row-Level Security (RLS)**.

Built with **Next.js 16 (App Router)**, **React 19**, **NestJS 12**, **Prisma ORM 6**, **PostgreSQL 16+**, and **Tailwind CSS v4** in a `pnpm` workspace monorepo.

---

## Quick Start & Local Setup

### Prerequisites
- **Node.js 24+** (LTS / v24.19 verified)
- **pnpm 12.18.0** (`corepack enable`)
- **PostgreSQL 16+** running locally on port `5432`

### 1. Install Dependencies
```bash
git clone <your-repo-url>
cd HumanResources-Management-System
pnpm install
```

### 2. Configure Environment Variables
Copy the example environment templates (never commit real `.env` files):
```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```
Key optional integrations in `apps/api/.env`:
- **Cloud Object Storage:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (`sb_secret_...` or `service_role` JWT), `SUPABASE_STORAGE_BUCKET` (falls back to `apps/api/uploads/` local disk when omitted).
- **Email Delivery:** Gmail REST API over HTTPS (`GMAIL_CLIENT_ID` + `GMAIL_CLIENT_SECRET` + `GMAIL_REFRESH_TOKEN`, optional `GMAIL_SENDER_EMAIL` — recommended on Render free tier), `SMTP_USER` + `SMTP_PASS` (Gmail App Password), and/or `RESEND_API_KEY`, plus `EMAIL_DEMO_OVERRIDE` for routing synthetic `.test` demo notifications safely (falls back to `LOG_ONLY` mode when omitted).

### 3. Initialize PostgreSQL Roles, Migrations & Seed Data
```bash
# Run dual-role database setup (creates hrms_owner, hrms_app, hrms, and hrms_test)
psql -U postgres -f apps/api/prisma/setup.sql

# Apply non-destructive Prisma migrations & generate client
pnpm --filter api exec prisma migrate deploy
pnpm --filter api exec prisma generate

# Seed tenants (Azir Company Global Tech & Bayanihan Foods), employees, holidays & ledgers
pnpm --filter api exec prisma db seed
```
*(Avoid `pnpm db:reset` on active databases with custom records.)*

### 4. Start Development Servers
```bash
pnpm dev
```
- **Web Portal:** http://localhost:3000
- **API Server:** http://localhost:4000 (Live health: `/health`, DB readiness: `/health/ready`)

---

## Demo Accounts (Password: `Demo1234!`)

| User / Persona | Email | Roles | Key Capabilities |
| :--- | :--- | :--- | :--- |
| **Gabriela Silang** | `employee@acgt.test` | `EMPLOYEE` | Web clock-in/out, OB slips & missed punches, statutory leave + attachments, document requests, payslips, profile avatars & password change. |
| **Manuel Quezon** | `manager@acgt.test` | `MANAGER`, `EMPLOYEE` | Step-1 leave approvals, 1-step OB/missed-punch approvals, team roster (`/team`) with field-level salary protection. |
| **Maria Clara** | `hr@acgt.test` | `HR`, `EMPLOYEE` | Step-2 final leave approvals, employee management, balance grants/adjustments, payroll generation & CSV/register export, document issuance. |
| **Alejandro Reyes** | `admin@acgt.test` | `ADMIN`, `EMPLOYEE` | Organization settings (departments, leave types, Nager.Date holiday sync), role assignment, payroll approvals, audit logs. |

---

## Core Modules & Capabilities

1. **Philippine Statutory Leave & Double-Entry Ledger (`apps/api/src/leave`, `/leave`, `/approvals`):**
   - Pure deterministic rules in `Asia/Manila` timezone for **SIL (Art. 95)**, **Maternity Leave (RA 11210 — 105 calendar days)**, **Paternity Leave (RA 8187 — 7 working days)**, **VL**, and **SL**, excluding Sundays and tenant Philippine holidays.
   - Immutable append-only `LeaveLedgerEntry` (`GRANT`, `DEDUCT`, `ADJUST`), `FOR UPDATE` overlap guards, optimistic concurrency checks (`409 Conflict`), and deferred supporting document uploads on submit.
2. **Attendance, Daily Time Records (DTR) & Official Business (`apps/api/src/attendance`, `/attendance`):**
   - Web clock-in/out with location tags (`OFFICE`, `FIELD_CLIENT_SITE`, `REMOTE_WFH`), 9:00 AM – 6:00 PM shift with 15-minute grace window, minute-rate tardiness/undertime computation, and 1-step manager OB/missed-punch approval.
3. **Philippine Statutory Payroll & Payslips (`apps/api/src/payroll`, `/payroll`, `/payroll/my-payslips`):**
   - Semi-monthly gross-to-net calculation integrating unpaid leave, tardiness/absences, `1.25x` overtime, allowances, bonuses, and manual adjustments.
   - Computes **SSS**, **PhilHealth**, **Pag-IBIG (HDMF)**, and **BIR TRAIN Law** withholding tax, with CSV payroll register export, printable A4 accounting summary, and self-service payslip release.
4. **Verifiable HR Documents & QR Verification (`apps/api/src/documents`, `/documents`, `/verify/[code]`):**
   - COE, COE with Compensation, Leave Certification, and Certified Payslip issuance with HR e-signature rendering, offline `.html` save, and public QR verification (`/verify/[code]`).
5. **Cloud Object Storage (`apps/api/src/storage`, `/profile`, `/leave/new`):**
   - Magic-byte validated uploads (`JPEG`, `PNG`, `WEBP`, `PDF`) via Supabase Storage REST (`sb_secret_` & legacy JWT support) or local disk fallback, with tenant-prefix enforcement (`tenants/<tenantId>/...`) on protected downloads.
6. **External APIs & Security Hardening (`apps/api/src/settings`, `apps/api/src/notifications`, `apps/api/src/auth`):**
   - **Nager.Date API** Philippine holiday preview/sync, **Gmail SMTP (Nodemailer)** + **Resend** fallback notifications, `helmet()`, `compression()`, `@nestjs/throttler`, Express `trust proxy`, fail-closed production JWT secrets, Next.js security headers (`CSP`, `X-Frame-Options`, `nosniff`), and immutable audit logging.

---

## Deployment & CI/CD (`$0` Capstone Stack)
- **Web (`apps/web`):** Deploy on **Vercel** (`apps/web/vercel.json`) with server env var `API_URL` pointing to your backend origin (`/api/*` proxies cleanly to keep `SameSite=Lax` refresh cookies same-origin).
- **API (`apps/api`):** Deploy containerized via `apps/api/Dockerfile` and `render.yaml` on **Render** (`healthCheckPath: /health`).
- **Database & Files:** **Supabase** PostgreSQL (run `apps/api/prisma/supabase-init.sql` once before `prisma migrate deploy`) + Supabase Storage bucket.
- **GitHub Actions:** [.github/workflows/ci.yml](.github/workflows/ci.yml) runs API lint, TypeScript checks, unit tests, PostgreSQL 16 E2E tests, Next.js build, and Docker image build verification; [.github/workflows/cd.yml](.github/workflows/cd.yml) triggers Render deployment after CI passes on `main`.

---

## Testing & Verification
```bash
# API Unit Tests (16 suites, 76 tests passing)
pnpm --filter api exec vitest run --configLoader native

# Web Proxy Utility Tests (3 tests passing)
node --test apps/web/lib/proxy-url.test.ts

# Typechecks
pnpm --filter api exec tsc --noEmit --incremental false -p tsconfig.build.json
pnpm --filter web exec tsc --noEmit --incremental false

# API Lint & Production Builds
pnpm --filter api lint
pnpm --filter api build
pnpm --filter web build

# API E2E Suite (requires local/CI PostgreSQL on localhost:5432 with hrms_test migrated)
pnpm --filter api exec vitest run --config ./vitest.config.e2e.ts --configLoader native
```

---

## Documentation Links
- [Complete Project Documentation Soft Copy](docs/DocumentationSCopy.md)
- [System Architecture & Technical Specifications](ARCHITECTURE.md)
- [5-Minute Capstone Demo Script](docs/demo-script.md)
- [Architecture Decision Records (ADRs)](docs/decisions/)
- [Specs & Implementation Plans](docs/superpowers/)
