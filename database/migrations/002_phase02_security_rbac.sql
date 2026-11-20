-- ============================================================================
-- MUN COMPUTER — Phase 02 Migration: Security, RBAC & User Management
-- Database: mun_computer_db (MySQL 8.0 InnoDB)
-- Adds/Upgrades all 14 Security & User Management tables with PK, FK,
-- UNIQUE constraints, Indexes, Status, Created At, and Updated At.
-- ============================================================================

USE `mun_computer_db`;

-- ----------------------------------------------------------------------------
-- 1. User ID Sequences (Transactional Atomic Allocation)
-- Format: MC-{ROLE_CODE}-{YYYY}{FIXED_CODE}-{SERIAL_4}
-- Example: MC-AD-202613-0001, MC-MN-202613-0002, MC-ST-202613-0003
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `user_id_sequences` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `role_code` ENUM('AD', 'MN', 'ST') NOT NULL,
  `sequence_year` SMALLINT UNSIGNED NOT NULL,
  `fixed_code` VARCHAR(8) NOT NULL DEFAULT '13',
  `last_serial` INT UNSIGNED NOT NULL DEFAULT 0,
  `prefix_template` VARCHAR(40) NOT NULL DEFAULT 'MC-{ROLE}-{YEAR}{FIXED}-',
  `status` ENUM('active', 'archived') NOT NULL DEFAULT 'active',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_seq_role_year_fixed` (`role_code`, `sequence_year`, `fixed_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 2. Alter/Extend Users Table for Phase 02 Security
-- ----------------------------------------------------------------------------
ALTER TABLE `users`
  ADD COLUMN IF NOT EXISTS `user_code` VARCHAR(32) NOT NULL UNIQUE AFTER `id`,
  ADD COLUMN IF NOT EXISTS `mobile` VARCHAR(24) NOT NULL UNIQUE AFTER `full_name`,
  ADD COLUMN IF NOT EXISTS `aadhaar_encrypted` VARBINARY(512) NULL AFTER `phone`,
  ADD COLUMN IF NOT EXISTS `aadhaar_last4` CHAR(4) NULL AFTER `aadhaar_encrypted`,
  ADD COLUMN IF NOT EXISTS `aadhaar_consent_at` TIMESTAMP NULL AFTER `aadhaar_last4`,
  ADD COLUMN IF NOT EXISTS `address` TEXT NULL AFTER `aadhaar_consent_at`,
  ADD COLUMN IF NOT EXISTS `profile_photo_path` VARCHAR(255) NULL AFTER `address`,
  ADD COLUMN IF NOT EXISTS `mobile_verified_at` TIMESTAMP NULL AFTER `profile_photo_path`,
  ADD COLUMN IF NOT EXISTS `email_verified_at` TIMESTAMP NULL AFTER `mobile_verified_at`,
  ADD COLUMN IF NOT EXISTS `failed_login_attempts` TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER `email_verified_at`,
  ADD COLUMN IF NOT EXISTS `locked_until` TIMESTAMP NULL AFTER `failed_login_attempts`,
  ADD COLUMN IF NOT EXISTS `password_changed_at` TIMESTAMP NULL AFTER `locked_until`,
  ADD COLUMN IF NOT EXISTS `created_by` BIGINT UNSIGNED NULL AFTER `branch_name`,
  MODIFY COLUMN `email` VARCHAR(160) NULL,
  MODIFY COLUMN `status` ENUM('PENDING', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED', 'REJECTED') NOT NULL DEFAULT 'PENDING';

CREATE INDEX `idx_users_user_code` ON `users` (`user_code`);
CREATE INDEX `idx_users_status` ON `users` (`status`);

-- ----------------------------------------------------------------------------
-- 3. User Permissions (Individual Override & Grant Matrix)
-- Permission Types: VIEW, ADD, EDIT, DELETE, PRINT, EXPORT, APPROVE, FINANCIAL
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `user_permissions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `permission_id` BIGINT UNSIGNED NOT NULL,
  `granted_by` BIGINT UNSIGNED NULL,
  `is_granted` TINYINT(1) NOT NULL DEFAULT 1,
  `status` ENUM('active', 'revoked') NOT NULL DEFAULT 'active',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_perm` (`user_id`, `permission_id`),
  CONSTRAINT `fk_up_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_up_permission` FOREIGN KEY (`permission_id`) REFERENCES `permissions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_up_granter` FOREIGN KEY (`granted_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 4. Login Attempts (Failed Login Control & Account Lockout)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `login_attempts` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NULL,
  `attempted_user_code` VARCHAR(32) NOT NULL,
  `ip_address` VARCHAR(45) NOT NULL,
  `user_agent` VARCHAR(255) NULL,
  `was_successful` TINYINT(1) NOT NULL DEFAULT 0,
  `failure_reason` VARCHAR(120) NULL,
  `status` ENUM('recorded', 'cleared') NOT NULL DEFAULT 'recorded',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_login_attempts_code_time` (`attempted_user_code`, `created_at`),
  INDEX `idx_login_attempts_ip` (`ip_address`),
  CONSTRAINT `fk_la_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 5. OTP Verifications (Login 2FA, Mobile Registration, Password Reset)
-- Never store plaintext OTP; store HMAC/SHA-256 hash only.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `otp_verifications` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NULL,
  `target_identifier` VARCHAR(160) NOT NULL,
  `purpose` ENUM('LOGIN_OTP', 'MOBILE_VERIFICATION', 'PASSWORD_RESET') NOT NULL,
  `otp_hash` CHAR(64) NOT NULL,
  `attempts` TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `max_attempts` TINYINT UNSIGNED NOT NULL DEFAULT 5,
  `resend_available_at` TIMESTAMP NOT NULL,
  `expires_at` TIMESTAMP NOT NULL,
  `verified_at` TIMESTAMP NULL,
  `status` ENUM('pending', 'verified', 'expired', 'locked') NOT NULL DEFAULT 'pending',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_otp_target_purpose` (`target_identifier`, `purpose`),
  CONSTRAINT `fk_otp_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 6. Registration Requests (Approval Workflow Queue)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `registration_requests` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `request_code` VARCHAR(32) NOT NULL UNIQUE,
  `applicant_name` VARCHAR(160) NOT NULL,
  `requested_role_id` BIGINT UNSIGNED NOT NULL,
  `mobile` VARCHAR(24) NOT NULL,
  `email` VARCHAR(160) NULL,
  `address` TEXT NOT NULL,
  `aadhaar_encrypted` VARBINARY(512) NULL,
  `aadhaar_last4` CHAR(4) NULL,
  `aadhaar_consent_at` TIMESTAMP NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `mobile_verified` TINYINT(1) NOT NULL DEFAULT 0,
  `submitted_by_user_id` BIGINT UNSIGNED NULL,
  `reviewed_by_user_id` BIGINT UNSIGNED NULL,
  `reviewed_at` TIMESTAMP NULL,
  `review_notes` TEXT NULL,
  `created_user_id` BIGINT UNSIGNED NULL,
  `status` ENUM('PENDING', 'APPROVED', 'REJECTED', 'CORRECTION_REQUIRED') NOT NULL DEFAULT 'PENDING',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_reg_status` (`status`),
  CONSTRAINT `fk_reg_role` FOREIGN KEY (`requested_role_id`) REFERENCES `roles` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_reg_submitter` FOREIGN KEY (`submitted_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_reg_reviewer` FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_reg_created_user` FOREIGN KEY (`created_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 7. Approval History
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `approval_history` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `registration_request_id` BIGINT UNSIGNED NOT NULL,
  `reviewer_user_id` BIGINT UNSIGNED NOT NULL,
  `action` ENUM('APPROVED', 'REJECTED', 'CORRECTION_REQUIRED') NOT NULL,
  `notes` TEXT NULL,
  `status` ENUM('recorded', 'archived') NOT NULL DEFAULT 'recorded',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_ah_request` FOREIGN KEY (`registration_request_id`) REFERENCES `registration_requests` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ah_reviewer` FOREIGN KEY (`reviewer_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 8. Password Reset Tokens
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `password_reset_tokens` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `token_hash` CHAR(64) NOT NULL UNIQUE,
  `expires_at` TIMESTAMP NOT NULL,
  `used_at` TIMESTAMP NULL,
  `status` ENUM('active', 'used', 'expired') NOT NULL DEFAULT 'active',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_prt_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 9. Security Logs (Login, Logout, Failed Login, Lockout, Password, Permissions)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `security_logs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `actor_user_id` BIGINT UNSIGNED NULL,
  `target_user_id` BIGINT UNSIGNED NULL,
  `event_type` ENUM(
    'LOGIN_SUCCESS',
    'LOGIN_FAILED',
    'LOGOUT',
    'OTP_SENT',
    'OTP_VERIFIED',
    'OTP_FAILED',
    'PASSWORD_CHANGED',
    'PASSWORD_RESET',
    'ACCOUNT_LOCKED',
    'ACCOUNT_STATUS_CHANGED',
    'PERMISSION_CHANGED',
    'SESSION_REVOKED',
    'UNAUTHORIZED_ACCESS'
  ) NOT NULL,
  `result` ENUM('SUCCESS', 'FAILURE', 'BLOCKED') NOT NULL,
  `ip_address` VARCHAR(45) NOT NULL,
  `device_info` VARCHAR(255) NULL,
  `summary` VARCHAR(255) NOT NULL,
  `status` ENUM('immutable') NOT NULL DEFAULT 'immutable',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_sec_event_created` (`event_type`, `created_at`),
  INDEX `idx_sec_actor` (`actor_user_id`),
  CONSTRAINT `fk_sec_actor` FOREIGN KEY (`actor_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_sec_target` FOREIGN KEY (`target_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
