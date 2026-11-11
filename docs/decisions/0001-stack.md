# 1. Monorepo Tech Stack Selection

Date: 2026-11-10

## Status
Accepted

## Context
We need a robust, production-grade architecture for an enterprise Multi-Tenant Human Resources Management System (HRMS) specializing in Philippine statutory leave compliance for a Friday presentation/capstone and portfolio centerpiece.

Key constraints:
- Monorepo structure with clean separation of concerns.
- Strict type safety from database to frontend.
- Modern high-contrast monochrome design aesthetic (black, white, neutral grays).
- High scalability, testability, and auditability.

## Decision
We selected the following stack:
1. **Frontend:** Next.js 16 (App Router, Turbopack, React 19, TypeScript)
   - Tailwind CSS v4 for clean, high-performance styling.
   - Lucide Icons for iconography.
   - Client-side auth session context with httpOnly JWT refresh cookies.
2. **Backend:** NestJS 12 (TypeScript, Express)
   - Modular architecture (Auth, Employees, Leave, Settings, Notifications, Audit, Dashboard).
   - Class-validator DTOs for strict input validation.
   - Built-in Vitest test runner for unit and end-to-end testing.
3. **Database:** PostgreSQL 18.6 with Row-Level Security (RLS)
   - Dual-role database security (`hrms_owner` for migrations/DDL, `hrms_app` for web queries).
   - Session variable `app.current_tenant_id` for hardware-level multi-tenant isolation.
4. **Monorepo Tools:** pnpm workspaces.

## Consequences
- **Positive:** Full TypeScript end-to-end; strict separation between web UI and API; zero chance of cross-tenant data leaks due to database-level RLS.
- **Trade-offs:** Running e2e tests requires configuring test database roles with RLS bypass privileges for test setup/teardown.
