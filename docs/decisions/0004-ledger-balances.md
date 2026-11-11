# 4. Double-Entry Inspired Leave Ledger for Balances

Date: 2026-11-10

## Status
Accepted

## Context
Storing a mutable integer `leaveBalance` on an employee table leads to race conditions, balance drift, and lack of accountability when discrepancies occur.

## Decision
We adopted an immutable ledger model:
1. Every balance change is an append-only row in `LeaveLedgerEntry`:
   - `GRANT`: Initial annual quota allocation (positive integer).
   - `DEDUCT`: Deduction when a leave request is fully approved (negative integer, referencing `leaveRequestId`).
   - `ADJUST`: Manual HR credit or debit (signed integer with required reason).
2. The current balance is computed on the fly by summing ledger entries for `(employeeId, leaveTypeId, year)`.
3. Net available days are computed as: `currentBalance - pendingRequests`.
4. Approvals lock rows using optimistic row state matching (`UPDATE ... WHERE id = req.id AND status = 'PENDING_HR'`). If concurrency fails, a `409 ConflictException` is returned.

## Consequences
- 100% audit trail of every day credited, deducted, or adjusted.
- Zero mathematical drift.
- Historical reconstruction of balances at any past date.
