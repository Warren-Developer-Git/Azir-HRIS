# HRMS 5-Minute Capstone Demo Script

Use this click-through script to deliver a smooth, high-impact 5-minute presentation for professors and technical evaluators.

---

## ⏱️ Timeline Overview
- **0:00 - 0:45:** System Architecture & RLS Multi-Tenancy Explanation
- **0:45 - 1:45:** Philippine Labor Law Statutory Leave Filing (Maria Santos - Employee)
- **1:45 - 2:45:** Two-Step Approval Workflow (Juan Dela Cruz - Manager & Anna Reyes - HR)
- **2:45 - 3:45:** Balance Ledgers & HR Adjustments (Anna Reyes - HR)
- **3:45 - 4:30:** Organization Settings & Soft-Deactivation (Carlos Tan - Company Admin)
- **4:30 - 5:00:** Audit Trail Logs & Q&A

---

## Step 1: Login & Theme Toggle (0:00 - 0:45)
1. Open `http://localhost:3000` in your browser.
2. **Talking Points:**
   - *"Good day, professors. Today I am presenting our Enterprise Human Resources Management System, specialized for Philippine labor law compliance with hardware-grade PostgreSQL Row-Level Security."*
   - Point out the **1-Click Demo Login** buttons and the **Light / Dark Mode Toggle** (monochrome design system).
3. Click **"Maria Santos (Employee)"** to sign in instantly.

---

## Step 2: Employee Leave Filing (0:45 - 1:45)
1. You land on the **Dashboard**:
   - Point out **My Available Leave (25 days)**, **Recent Filings**, and **Leave Policies**.
2. Click **"File Leave Request"** (or navigate to `/leave/new`).
3. Select **Vacation Leave (VL)**.
   - Pick dates: e.g. `2026-11-25` to `2026-11-27` (3 days).
   - Enter reason: `Family trip to Tagaytay`.
4. Click **"Submit Leave Request"**.
5. **Talking Points:**
   - *"The system automatically runs our pure domain rules in Asia/Manila timezone, validating working days against Philippine regular and special non-working holidays (excluding Sundays and holidays)."*
   - Show the request timeline: it is now `PENDING_MANAGER`.

---

## Step 3: Two-Step Approval Hub (1:45 - 2:45)
1. Log out, then click **"Juan Dela Cruz (Manager)"**.
2. Check the **Notification Bell** in the top-right header:
   - Notice the unread badge `[1]`: *"Gabriela Silang / Maria Santos requested 3 day(s) of Vacation Leave."*
3. Click **Approvals** on the sidebar:
   - Point out the request in the review table.
4. Click **"Approve / Reject"**, enter a comment (`Approved, cover arranged`), and click **"Confirm Approval"**.
   - Status updates immediately to `PENDING_HR`.
5. Log out, then click **"Anna Reyes (HR Admin)"**.
6. Check Approvals:
   - Point out the request is now in Step 2 (HR Review).
   - Click **"Approve / Reject"** and click **"Confirm Approval"**.
   - Notice the status updates to `APPROVED` and a `DEDUCT` ledger entry is appended atomically.

---

## Step 4: Balances & HR Adjustments (2:45 - 3:45)
1. As Anna Reyes (HR), navigate to **Employees** (`/employees`).
2. Search for `Maria Santos` and click her profile.
3. Scroll down to **Leave Entitlements & Balances**:
   - Show the live balance deduction (25 days minus 3 days = 22 available).
4. Click **"Adjust Balance"**:
   - Select `Vacation Leave`.
   - Enter `+2` days, reason: `Overtime compensatory credit`.
   - Click **"Save Adjustment"**.
   - Show that the balance instantly updates to 24 available!
5. Demonstrate safety:
   - Click **"Adjust Balance"** again and try to deduct `-50` days.
   - Show the server error alert: *"Adjustment would make the balance negative"*.

---

## Step 5: Admin Settings & Soft-Deactivation (3:45 - 4:30)
1. Log out and log in as **"Carlos Tan (Company Admin)"**.
2. Click **Settings** (`/settings`):
   - Switch through tabs: **Leave Types**, **Holidays**, **Departments**.
3. Click **"Add Holiday"**:
   - Add a company holiday: `Ninoy Aquino Day` (Date: `2026-08-21`, Type: `SPECIAL`).
4. Click **Departments** tab:
   - Try to delete `Engineering` (which has active employees).
   - Show the alert: *"Department is currently assigned to employee(s) and has been deactivated rather than deleted."*
   - Explain the soft-deactivation pattern preserving relational integrity.

---

## Step 6: Immutable Compliance Audit Trail (4:30 - 5:00)
1. Click **Audit Log** (`/audit-logs`):
   - Show the complete compliance trail of every filing, approval, balance adjustment, and setting modification.
2. Click any log row to expand the **Before / After JSON state inspector**.
3. Conclude:
   - *"Every write action in the system is auditable, multi-tenant isolated via Postgres RLS, and strictly type-safe from Postgres to Next.js. Thank you, and I am now open to your questions."*
