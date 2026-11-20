# MUN COMPUTER — Enterprise Business Management Platform

**Version:** 1.0.0  
**Current Milestone:** Enterprise ERP Integration (Phase 01 Foundation + Phase 02 Security/RBAC + Phase 03 Master Settings + Q1–51 Operational CRM, Dynamic Services, Workflow, Document Vault, Cash/Ledger, Delivery & MIS)  
**Copyright:** © 2026 MUN COMPUTER.

---

## Overview

MUN COMPUTER combines four integrated layers:
1. **Phase 01 — Foundation & UI:** White & black high-contrast enterprise interface, left sidebar navigation, global search, quick actions, and PHP/MySQL blueprints.
2. **Phase 02 — Security & Three-Level RBAC:** `ADMIN`, `MANAGER`, and `STAFF` roles, `scrypt` password hashing, server SVG CAPTCHA, HMAC OTP 2FA, HttpOnly cookie + CSRF protection, account lockout, automatic User ID generation (`MC-AD-YYYY13-0001`), and immutable security/audit logs.
3. **Phase 03 — Master Settings & Global Configuration:** Light & Dark Mode, multi-language interface (`EN | বাংলা | हि`), `INR ₹` (`en-IN`) & `DD/MM/YYYY` (`Asia/Kolkata`) formatting, 22 modular Master Settings sections, A4 print/PDF templates & preview, AES-256-GCM encrypted backups, and 60-minute inactivity auto-logout.
4. **Enterprise ERP Operations (`server/erpStore.ts` & `server/erpRoutes.ts`):**
   - **Customer CRM (`MCC-YYYY-YY-NNNNNN`):** Duplicate mobile/Aadhaar check & Manager/Admin override, masked Aadhaar (`XXXX-XXXX-1234`) + Admin-only audited decrypt, Mobile OTP verification, 7 separate consent categories, 360° profile, ID card print, bulk CSV preview/import, Admin customer merge, and soft delete/restore.
   - **Services & Dynamic Form Builder (`MCS-YYYY-YY-NNNNNN`):** Categories with Manager proposal -> Admin approval, `Profit = Charge − Cost`, 15-field-type versioned Dynamic Form Builder preserving historical schemas per application, required document checklists, SLA & pause rules, and automation triggers.
   - **Application Lifecycle (`MCA-YYYY-YY-NNNNNN`):** Dual creation flows (Workflow A: Customer First, Workflow B: Service First with inline customer intake), duplicate check & override audit, strict 12-status state machine (`Draft` -> `Submitted` -> `Under Review` -> `Processing` / `Pending Customer` / `Pending Office` -> `Approved` / `Rejected` / `Completed` / `Cancelled` / `On Hold` / `Reopened`), Staff record-level isolation, self-claim & reassignment approvals, dynamic reference numbers with uniqueness validation, and separate internal vs customer-facing notes.
   - **Private Document Vault:** Private authenticated upload/download (`contentBase64` stripped from list endpoints), PDF/JPG/JPEG/PNG <= 10 MB only (executables blocked `422`), Verify/Reject (mandatory reason), replacement versioning, and mandatory document submission gate (overridable only by Manager/Admin with documented reason).
   - **Financial Ledger, Delivery & Refunds (`MCR-`, `MCI-`, `MCD-`, `MCRF-`):** Cash/UPI/Bank payments with UPI manual verification, Expenses ledger, Delivery handover confirmation (`MCD-...`), Cancellation requests, guarded Refunds (`MCRF-...`), and 20 MIS Reports with audited CSV/Excel/PDF exports.

---

## Database & External Services Configuration

1. **MySQL 8.0 Database:** Apply `database/schema/schema.sql`, `database/migrations/002_phase02_security_rbac.sql`, `database/migrations/003_phase03_master_settings.sql`, and `database/migrations/004_enterprise_erp_q1_51.sql`, then configure `DB_*` in `.env` (this preview executes against an in-memory TypeScript store with identical validation & schemas).
2. **SMS / Email / WhatsApp / Dynamic QR Gateways:** Configure provider credentials in `.env` or Master Settings `API Integrations`. Without external gateway credentials, customer OTPs use Sandbox Preview and consent-eligible external messages are truthfully recorded as `Not Configured` (never fabricated as sent).
3. **Employee HR, Products & Inventory:** Remain in `Phase 02 Planned` placeholder views and are not wired to production database tables in this milestone.

---

## Demo Test Accounts (Seeded in `server/securityStore.ts`)

| Role | User ID | Password |
|---|---|---|
| **ADMIN** | `MC-AD-202613-0001` | `Admin@2026!` |
| **MANAGER** | `MC-MN-202613-0002` | `Manager@2026!` |
| **STAFF** | `MC-ST-202613-0003` | `Staff@2026!` |

---

## Commands

```bash
# Install dependencies
npm install

# Run full-stack Express + Vite dev server on port 3000
npm run dev

# Run all automated integration tests (Security + Phase 03 + Enterprise ERP)
npm test

# Type-check & production build
npm run lint
npm run build
```
