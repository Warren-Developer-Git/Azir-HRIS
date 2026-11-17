# Feature 3 Specification: Daily Time Records (DTR), Official Business (OB) & Attendance

**Project:** Multi-Tenant Human Resources Management System (HRMS)  
**Target Milestone:** Friday, November 20, 2026 Presentation  
**Design Standards:** Spec-Driven Development (SDD) & Test-Driven Development (TDD)  
**Tenant Isolation:** PostgreSQL Row-Level Security (RLS) + Multi-Tenant `tenant_id`  

---

## 1. Executive Summary

Feature 3 completes the end-to-end operational lifecycle by linking **Daily Attendance Tracking** with the **Philippine Payroll Computation Engine**.

### Core Problems Solved
1. **Remote & Field Deployed Workers**: Employees on-site or at client locations can punch in/out directly from mobile/web with a `FIELD_CLIENT_SITE` tag.
2. **Missed Punches & Deployment Exceptions**: Employees who forgot to punch or who were deployed without internet connectivity can file **Official Business (OB) Slips** or **Attendance Corrections**.
3. **1-Step Manager Approvals**: Direct managers approve OB and correction requests with 1 click; approved requests instantly update the DTR with zero absence penalty.
4. **Automated Payroll Ingestion**: Unpaid absences and severe tardiness automatically calculate during the **Payroll Run Compute** phase, eliminating manual deductions.

---

## 2. Database Schema Design (Prisma)

```prisma
enum WorkLocationType {
  OFFICE
  FIELD_CLIENT_SITE
  REMOTE_WFH
}

enum AttendanceSource {
  WEB_PUNCH
  BIOMETRIC_IMPORT
  CORRECTION_OB
}

enum AttendanceStatus {
  PRESENT
  LATE
  UNDERTIME
  ABSENT
  ON_LEAVE
  OFFICIAL_BUSINESS
  REST_DAY
  HOLIDAY
}

enum CorrectionType {
  MISSED_PUNCH
  OFFICIAL_BUSINESS
}

enum CorrectionStatus {
  PENDING
  APPROVED
  REJECTED
  CANCELLED
}

model AttendanceRecord {
  id                String            @id @default(dbgenerated("uuidv7()")) @db.Uuid
  tenantId          String            @db.Uuid
  employeeId        String            @db.Uuid
  date              DateTime          @db.Date
  timeIn            DateTime?
  timeOut           DateTime?
  locationType      WorkLocationType  @default(OFFICE)
  source            AttendanceSource  @default(WEB_PUNCH)
  status            AttendanceStatus  @default(PRESENT)
  lateMinutes       Int               @default(0)
  undertimeMinutes  Int               @default(0)
  overtimeHours     Decimal           @default(0.00) @db.Decimal(5, 2)
  notes             String?           @db.VarChar(255)
  createdAt         DateTime          @default(now())
  updatedAt         DateTime          @updatedAt

  tenant            Tenant            @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  employee          Employee          @relation(fields: [employeeId], references: [id], onDelete: Restrict)

  @@unique([tenantId, employeeId, date])
  @@index([tenantId, date])
}

model AttendanceCorrectionRequest {
  id              String            @id @default(dbgenerated("uuidv7()")) @db.Uuid
  tenantId        String            @db.Uuid
  employeeId      String            @db.Uuid
  date            DateTime          @db.Date
  type            CorrectionType    @default(MISSED_PUNCH)
  proposedTimeIn  DateTime?
  proposedTimeOut DateTime?
  locationType    WorkLocationType  @default(FIELD_CLIENT_SITE)
  destination     String?           @db.VarChar(255)
  reason          String            @db.VarChar(500)
  status          CorrectionStatus  @default(PENDING)
  decidedById     String?           @db.Uuid
  decidedAt       DateTime?
  decisionNote    String?           @db.VarChar(255)
  createdAt       DateTime          @default(now())
  updatedAt       DateTime          @updatedAt

  tenant          Tenant            @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  employee        Employee          @relation(fields: [employeeId], references: [id], onDelete: Restrict)
  decidedBy       Employee?         @relation("CorrectionDecidedBy", fields: [decidedById], references: [id])

  @@index([tenantId, employeeId])
  @@index([tenantId, status])
}
```

---

## 3. Work Shift & Attendance Calculation Rules

1. **Standard Working Hours (Asia/Manila)**:
   - Shift: 09:00 AM – 06:00 PM (9 hours elapsed, 1 hour unpaid meal break = 8 working hours).
   - Grace Period: 15 minutes (Clock-in between 09:01 – 09:15 is marked as `PRESENT`, no tardiness deducted).
   - Tardiness: Clock-in after 09:15 AM records `lateMinutes = timeIn - 09:00 AM`.
   - Undertime: Clock-out before 06:00 PM records `undertimeMinutes = 18:00 - timeOut`.
2. **Official Business (OB)**:
   - Automatically marks status as `OFFICIAL_BUSINESS` with `lateMinutes = 0`, `undertimeMinutes = 0`.
3. **Approved Leaves**:
   - If an approved `LeaveRequest` covers the date, DTR is set to `ON_LEAVE`.
4. **Sundays & Official Holidays**:
   - Automatically flagged as `REST_DAY` or `HOLIDAY`.

---

## 4. API Endpoints Plan

### Employee Endpoints
- `POST /attendance/punch`: Clock-In or Clock-Out with `locationType` (`OFFICE`, `FIELD_CLIENT_SITE`, `REMOTE_WFH`) and optional note.
- `GET /attendance/today`: Check current user's today's punch state.
- `GET /attendance/my-dtr?month=YYYY-MM`: View employee's monthly DTR grid with daily status and late/undertime minutes.
- `POST /attendance/corrections`: Submit an Attendance Correction or Official Business (OB) Slip.
- `GET /attendance/corrections`: List user's correction / OB slips.

### Manager & HR Endpoints
- `GET /attendance/team-dtr?date=YYYY-MM-DD`: View daily attendance across direct reports or all employees.
- `GET /attendance/corrections/awaiting`: Approvals list for direct managers.
- `POST /attendance/corrections/:id/decision`: Approve or reject with comment (1-step manager approval).
  - *On Approve*: Automatically creates/updates the `AttendanceRecord` for that employee and date!
- `POST /attendance/import-biometrics`: HR uploads biometrics CSV logs.

---

## 5. Automated Payroll Linkage

In `POST /payroll/runs/:id/compute`:
- For each employee in the active cutoff period:
  - Count `ABSENT` days (excluding paid leaves, rest days, holidays, and approved OB slips).
  - Compute absence deduction: `(monthlySalary / (workingDays * 2)) * absentDays`.
  - Sum `lateMinutes` + `undertimeMinutes` across the period.
  - Compute hourly deduction: `(monthlySalary / 22 / 8 / 60) * totalTardyMinutes`.
  - Auto-generate an itemized deduction adjustment `TARDINESS_ABSENCES` on the employee's payroll record!

---

## 6. Implementation Checklist & TDD Plan

- [ ] **Step 1**: Update `schema.prisma` with `AttendanceRecord` and `AttendanceCorrectionRequest` & run migrations.
- [ ] **Step 2**: Create pure domain rules in `attendance-rules.ts` & unit tests in `attendance-rules.spec.ts`.
- [ ] **Step 3**: Implement backend `AttendanceModule`, `AttendanceService`, `AttendanceController`.
- [ ] **Step 4**: Write comprehensive E2E tests in `attendance.e2e-spec.ts`.
- [ ] **Step 5**: Link DTR absences & tardiness into `PayrollService.computeRun`.
- [ ] **Step 6**: Build frontend UI at `/attendance` with Punch Widget, DTR Table, and OB Request Modal.
- [ ] **Step 7**: Add Attendance Approvals tab in `/approvals`.
