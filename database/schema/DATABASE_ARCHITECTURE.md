# MUN COMPUTER — Database Architecture Documentation

**Engine:** MySQL 8.0 (`InnoDB`, `utf8mb4_unicode_ci`)  
**Version:** 1.0.0 (Phase 01 Foundation)  
**Source DDL:** `database/schema/schema.sql`

---

## Core Design Standards

Every table in the MUN COMPUTER schema enforces the following baseline columns:
1. **Primary Key:** `id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT`
2. **Foreign Keys:** Explicit `CONSTRAINT fk_* FOREIGN KEY` relations with appropriate `ON DELETE` rules (`RESTRICT` for financial/customer integrity, `CASCADE` for session/RBAC mappings, `SET NULL` for optional audit references)
3. **Status Field:** Enumerated `status` column governing lifecycle transitions
4. **Timestamps:** `created_at` and `updated_at` managed automatically by MySQL

---

## Table Inventory

| # | Table | Primary Purpose | Key Foreign Keys |
|---|-------|-----------------|------------------|
| 1 | `users` | System login accounts & branch assignment | `role_id -> roles.id` |
| 2 | `roles` | Role definitions (Administrator, Operator, Accountant) | — |
| 3 | `permissions` | Granular module/action capability definitions | — |
| 4 | `role_permissions` | Many-to-many RBAC mapping | `role_id -> roles.id`, `permission_id -> permissions.id` |
| 5 | `user_sessions` | Active JWT/session token hashes & expiry | `user_id -> users.id` |
| 6 | `customers` | Individual, Corporate, and Government clients | `created_by -> users.id` |
| 7 | `services` | Service catalog, fee schedules, SLA days | `created_by -> users.id` |
| 8 | `applications` | Customer service applications & status workflow | `customer_id -> customers.id`, `service_id -> services.id`, `assigned_employee_id -> employees.id` |
| 9 | `transactions` | Payment receipts, method, and settlement status | `application_id -> applications.id`, `customer_id -> customers.id` |
| 10 | `cashbook` | Daily counter credit/debit ledger & balance | `transaction_id -> transactions.id`, `created_by -> users.id` |
| 11 | `expenses` | Operational expense vouchers & approvals | `approved_by -> users.id`, `employee_id -> employees.id` |
| 12 | `income` | Categorized revenue streams & receipts | `transaction_id -> transactions.id`, `recorded_by -> users.id` |
| 13 | `employees` | Staff roster, designations, and user linkage | `user_id -> users.id` |
| 14 | `products` | Hardware & consumables catalog by SKU | `created_by -> users.id` |
| 15 | `inventory` | Stock quantities, reorder levels, locations | `product_id -> products.id`, `updated_by -> users.id` |
| 16 | `audit_logs` | Immutable action trail with JSON payload | `user_id -> users.id` |
| 17 | `settings` | Key-value system & company configuration | `updated_by -> users.id` |
| 18 | `notifications` | User-targeted operational alerts & read states | `user_id -> users.id` |

---

## Entity Relationship Summary

- **RBAC Security:** `roles` ↔ `role_permissions` ↔ `permissions`, linked to `users` and `user_sessions`.
- **Service Operations:** `customers` → `applications` ← `services`, assigned to `employees`.
- **Financial Flow:** `applications` → `transactions` → `cashbook` & `income`; operational outflows in `expenses`.
- **Inventory Flow:** `products` 1:1 `inventory` tracking stock status (`in_stock`, `low_stock`, `out_of_stock`).
- **Governance:** `audit_logs`, `settings`, and `notifications` linked to `users`.
