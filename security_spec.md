# Security Specification — MUN COMPUTER Firestore Rules

## 1. Data Invariants
1. **Identity & Privilege Invariant**: Non-admin users can only register their own profile (`users/{uid}`) with `role == 'STAFF'` and `status == 'ACTIVE'`, and cannot escalate their own `role` or write to `admins/{uid}`.
2. **PII Isolation Invariant**: User PII (`email`, `mobile`, `address`) is isolated in `users/{uid}/private/{docId}` and readable/writable only by `isOwner(uid)` or `isAdmin()`. Customer PII (`customers/{customerId}`) is readable only by its creator (`createdByUid == request.auth.uid`) or Admin.
3. **Temporal & Ownership Integrity Invariant**: All `create` writes must set `createdByUid == request.auth.uid`, `createdAt == request.time`, and `updatedAt == request.time`. All `update` writes must preserve `createdByUid` and `createdAt` unchanged and set `updatedAt == request.time`.
4. **Relational Consistency Invariant**: `applications` must reference an existing `customers/{customerId}` and `services/{serviceId}`. `payments` and `refunds` must reference an existing `applications/{applicationNo}`.
5. **Terminal State Locking Invariant**: Once an application reaches `Completed` or `Cancelled`, or a refund reaches `Processed` or `Rejected`, non-admin updates are denied.
6. **Zero-Trust List Query Invariant**: Every `allow list` rule evaluates `resource.data` against `request.auth.uid` (or explicit `isBootstrappedAdmin()` / `isAdmin()` privileges).

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Unauthenticated Write**: `create /customers/CUST-1` with `auth == null` -> `PERMISSION_DENIED`.
2. **Unverified Email Admin Spoof**: `create /customers/CUST-1` with `auth.token.email == 'muncomputer2019@gmail.com'` (non-admin UID) and `email_verified == false` -> `PERMISSION_DENIED`.
3. **Self-Assigned Admin Escalation**: `create /users/uid1` with `role: 'ADMIN'` -> `PERMISSION_DENIED`.
4. **Role Mutation via Update-Gap**: `update /users/uid1` changing `role` from `'STAFF'` to `'ADMIN'` -> `PERMISSION_DENIED`.
5. **Shadow / Ghost Field Injection**: `create /customers/CUST-1` with extra field `isAdminVerified: true` -> `PERMISSION_DENIED`.
6. **Cross-Owner Identity Spoofing**: `create /customers/CUST-1` with `createdByUid: 'other_uid'` -> `PERMISSION_DENIED`.
7. **PII Blanket Read**: Non-admin reading `users/other_uid/private/info` -> `PERMISSION_DENIED`.
8. **Client-Spoofed Timestamp**: `create /customers/CUST-1` with `createdAt: '2026-01-01T00:00:00Z'` instead of `request.time` -> `PERMISSION_DENIED`.
9. **Path ID Poisoning**: `create /customers/bad$id..` or 500-char document ID -> `PERMISSION_DENIED`.
10. **String Size Exhaustion**: `create /customers/CUST-1` with 200KB `fullName` -> `PERMISSION_DENIED`.
11. **Orphaned Application Create**: `create /applications/APP-1` referencing non-existent `customerId` -> `PERMISSION_DENIED`.
12. **Terminal State Tampering**: Non-admin updating `status` on an application whose existing status is `'Completed'` -> `PERMISSION_DENIED`.

## 3. CSC Digital Service Center Invariants
7. **Dual Bootstrapped Admin Invariant**: Verified Google accounts `muncomputer2019@gmail.com` and `mamunreja335@gmail.com`, pinned master admin UID `1ftA1pw2Q5b1wxciGoSsNUqQPmF2`, explicit `admins/{uid}` markers, and active `ADMIN` documents in `users/{uid}` hold `isAdmin()` privileges.
8. **CSC Rate & Slab Integrity Invariant**: Only Admins can write `cscCustomCategories`, `cscServiceOverrides`, `cscRateHistory`, and `pvcSlabs`; non-admin operators/customers are blocked at Firestore rule layer.
9. **Customer Portal Strict Isolation Invariant**: Users with role `CUSTOMER` can only `get` or `list` `cscOrders`, `pvcOrders`, `cscGrievances`, and `cscDocuments` where `existing().customerUid == request.auth.uid || existing().createdByUid == request.auth.uid`, and can never read other customers' records or write to admin collections.
10. **Sensitive Financial Credential Prohibition**: Application logic rejects and never stores OTP, Aadhaar OTP, UPI PIN, ATM PIN, CVV, or bank passwords anywhere in Firestore documents.

