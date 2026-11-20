# MUN COMPUTER — Security & Business API Architecture

**Version:** 1.0.0 (Phase 01 Foundation + Phase 02 Security & User Management)  
**Runnable Server:** `server.ts` + `server/app.ts` (Express + TypeScript)  
**PHP Blueprint:** `backend/api/routes.php` & `backend/services/UserIdSequenceService.php`

---

## 1. Authentication & Security Transport

- **Cookies:** `mun_session` issued as `HttpOnly; SameSite=Lax; Path=/` (plus `Secure` in production).
- **CSRF Protection:** Double-submit `mun_csrf` cookie paired with `X-CSRF-Token` request header on authenticated `POST`, `PUT`, `PATCH`, and `DELETE` calls.
- **Rate Limiting:** Sliding-window per-IP throttle on `/api/auth/*` returning `429 Too Many Requests`.
- **Password Hashing:** `scrypt` (`N=16384, r=8, p=1`) with per-user 16-byte random salt and `timingSafeEqual` verification (PHP blueprint uses `PASSWORD_ARGON2ID`).
- **CAPTCHA:** Server-generated SVG challenge (`GET /api/auth/captcha`) verified via single-use HMAC-SHA256 hash.
- **OTP Security:** Numeric 6-digit OTPs hashed with HMAC-SHA256 (`otp_verifications`), 5-minute TTL, 30-second resend cooldown, max 5 attempts, never written to application logs.

---

## 2. Phase 02 Endpoints

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/api/auth/captcha` | Public | Issues single-use SVG CAPTCHA challenge |
| `POST` | `/api/auth/login` | Public | Validates User ID, password, CAPTCHA, lockout; issues Login OTP |
| `POST` | `/api/auth/verify-otp` | Public | Verifies Login or Mobile OTP; sets HttpOnly session cookie |
| `POST` | `/api/auth/resend-otp` | Public | Re-issues OTP respecting resend cooldown |
| `POST` | `/api/auth/mobile-otp/send` | Public | Dispatches mobile verification OTP for registration |
| `POST` | `/api/auth/forgot-password` | Public | Issues Password Reset OTP challenge |
| `POST` | `/api/auth/reset-password` | Public | Resets password via OTP and revokes all prior sessions |
| `POST` | `/api/auth/logout` | Auth | Invalidates current session and clears cookies |
| `GET` | `/api/auth/me` | Auth | Returns active user profile, effective permissions, and session |
| `GET` | `/api/users` | `users.VIEW` | Lists authorized users (Manager cannot view Admin) |
| `POST` | `/api/users` | `users.ADD` | Admin creates Manager/Staff; Manager submits Staff approval request |
| `GET` | `/api/users/:id` | Auth / `users.VIEW` | Inspects profile with masked Aadhaar |
| `PUT` | `/api/users/:id` | Self / `users.EDIT` | Updates editable profile fields (User ID remains immutable) |
| `PATCH` | `/api/users/:id/status` | `users.EDIT` | Activates, suspends, or deactivates account (revokes sessions) |
| `GET` | `/api/users/:id/aadhaar` | `ADMIN` only | Decrypts AES-256-GCM Aadhaar and records audit event |
| `GET` | `/api/registration-requests` | `approvals.VIEW` | Lists registration queue |
| `POST` | `/api/registration-requests` | Public (Mobile OTP) | Submits Staff registration request |
| `POST` | `/api/registration-requests/:id/approve` | `approvals.APPROVE` | Allocates sequential User ID, activates user, writes Audit Log |
| `POST` | `/api/registration-requests/:id/reject` | `approvals.APPROVE` | Rejects or requests correction with notes in Audit Log |
| `GET` | `/api/roles` | Auth | Lists 3-tier roles and counts |
| `GET` | `/api/permissions` | Auth | Returns Permission Matrix and Permission History |
| `PUT` | `/api/users/:id/permissions` | `ADMIN` only | Updates individual permission overrides (blocks self-escalation) |
| `GET` | `/api/security-logs` | `security_logs.VIEW` | Returns immutable security logs |
| `GET` | `/api/audit-logs` | `security_logs.VIEW` | Returns immutable approval/admin audit logs |
| `GET` | `/api/sessions` | Auth | Lists active/historical sessions |
| `DELETE` | `/api/sessions/:id` | Owner / `ADMIN` | Immediately invalidates target session |
