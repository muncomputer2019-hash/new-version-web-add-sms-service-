-- ============================================================================
-- MUN COMPUTER — Phase 02 Final Master Migration
-- Security, User Management, Remember Me 240m, Departments & 3-Tier Service RBAC
-- Database: mun_computer_db (MySQL 8.0 InnoDB)
-- ============================================================================

USE `mun_computer_db`;

-- ----------------------------------------------------------------------------
-- 1. Extend users table for Phase 02 Final Master User Profile & Governance
-- ----------------------------------------------------------------------------
ALTER TABLE `users`
  ADD COLUMN IF NOT EXISTS `is_master_admin` TINYINT(1) NOT NULL DEFAULT 0 AFTER `role_id`,
  ADD COLUMN IF NOT EXISTS `designation` VARCHAR(120) NULL AFTER `branch_name`,
  ADD COLUMN IF NOT EXISTS `department_code` VARCHAR(32) NULL AFTER `designation`,
  ADD COLUMN IF NOT EXISTS `joining_date` DATE NULL AFTER `department_code`,
  ADD COLUMN IF NOT EXISTS `emergency_contact` VARCHAR(32) NULL AFTER `joining_date`,
  ADD COLUMN IF NOT EXISTS `profile_photo_url` VARCHAR(255) NULL AFTER `profile_photo_path`,
  ADD COLUMN IF NOT EXISTS `password_algo` VARCHAR(32) NOT NULL DEFAULT 'argon2id' AFTER `password_hash`,
  ADD COLUMN IF NOT EXISTS `reauthenticated_until` TIMESTAMP NULL AFTER `password_changed_at`;

-- Extend user_sessions for exact 240-minute Remember Me cap & rotation tracking
ALTER TABLE `user_sessions`
  ADD COLUMN IF NOT EXISTS `remember_me` TINYINT(1) NOT NULL DEFAULT 0 AFTER `user_agent`,
  ADD COLUMN IF NOT EXISTS `max_allowed_expires_at` TIMESTAMP NOT NULL AFTER `expires_at`,
  ADD COLUMN IF NOT EXISTS `device_id` VARCHAR(128) NULL AFTER `user_agent`,
  ADD COLUMN IF NOT EXISTS `rotated_from_session_id` BIGINT UNSIGNED NULL AFTER `device_id`;

-- ----------------------------------------------------------------------------
-- 2. Upgrade user_id_sequences & add immutable User ID generation ledger
-- Canonical Format: MC + YYFF + MM + SSSS (NO hyphen, NO space)
-- Example: MC2627110001
-- ----------------------------------------------------------------------------
ALTER TABLE `user_id_sequences`
  ADD COLUMN IF NOT EXISTS `fy_code` CHAR(4) NULL AFTER `role_code`,
  ADD COLUMN IF NOT EXISTS `month_code` CHAR(2) NULL AFTER `fy_code`;

CREATE TABLE IF NOT EXISTS `user_id_generation_history` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `generated_user_code` VARCHAR(24) NOT NULL UNIQUE,
  `role_slug` ENUM('ADMIN', 'MANAGER', 'STAFF', 'AUDITOR', 'CUSTOMER') NOT NULL,
  `fy_code` CHAR(4) NOT NULL,
  `month_code` CHAR(2) NOT NULL,
  `serial_no` INT UNSIGNED NOT NULL,
  `generated_by_user_id` BIGINT UNSIGNED NULL,
  `department_code` VARCHAR(32) NULL,
  `is_immutable` TINYINT(1) NOT NULL DEFAULT 1,
  `status` ENUM('active', 'archived') NOT NULL DEFAULT 'active',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_uid_fy_month_serial` (`fy_code`, `month_code`, `serial_no`),
  INDEX `idx_uid_hist_code` (`generated_user_code`),
  CONSTRAINT `fk_uid_hist_actor` FOREIGN KEY (`generated_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 3. Departments & User Department Assignments
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `departments` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `code` VARCHAR(32) NOT NULL UNIQUE,
  `name` VARCHAR(120) NOT NULL,
  `description` VARCHAR(255) NULL,
  `head_user_id` BIGINT UNSIGNED NULL,
  `status` ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_dept_head` FOREIGN KEY (`head_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `user_departments` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `department_id` BIGINT UNSIGNED NOT NULL,
  `assigned_by` BIGINT UNSIGNED NULL,
  `is_primary` TINYINT(1) NOT NULL DEFAULT 1,
  `status` ENUM('ACTIVE', 'REVOKED') NOT NULL DEFAULT 'ACTIVE',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_dept` (`user_id`, `department_id`),
  CONSTRAINT `fk_ud_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ud_dept` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ud_assigner` FOREIGN KEY (`assigned_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 4. 12 Permission Types Master Reference
-- VIEW, ADD, EDIT, DELETE, PRINT, EXPORT, APPROVE, REJECT, ASSIGN, EXECUTE, FINANCIAL, MANAGE
-- ----------------------------------------------------------------------------
INSERT IGNORE INTO `permissions` (`module`, `action`, `slug`, `description`, `status`) VALUES
  ('service_permissions', 'REJECT', 'service_permissions.REJECT', 'Reject submitted service or registration requests', 'active'),
  ('service_permissions', 'ASSIGN', 'service_permissions.ASSIGN', 'Assign services to Managers or request for Staff', 'active'),
  ('service_permissions', 'EXECUTE', 'service_permissions.EXECUTE', 'Execute assigned customer service workflows', 'active'),
  ('service_permissions', 'MANAGE', 'service_permissions.MANAGE', 'Full governance over service catalogs and assignments', 'active');

-- ----------------------------------------------------------------------------
-- 5. Admin -> Manager Service Assignments
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `manager_service_assignments` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `assignment_code` VARCHAR(40) NOT NULL UNIQUE,
  `manager_user_id` BIGINT UNSIGNED NOT NULL,
  `service_id` VARCHAR(64) NOT NULL,
  `service_name` VARCHAR(160) NOT NULL,
  `department_code` VARCHAR(32) NOT NULL,
  `permissions_json` JSON NOT NULL,
  `assigned_by_admin_id` BIGINT UNSIGNED NOT NULL,
  `assignment_date` DATE NOT NULL,
  `effective_date` DATE NOT NULL,
  `expiry_date` DATE NULL,
  `notes` TEXT NULL,
  `status` ENUM('ACTIVE', 'SUSPENDED', 'REVOKED', 'EXPIRED') NOT NULL DEFAULT 'ACTIVE',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_msa_mgr_svc` (`manager_user_id`, `service_id`),
  INDEX `idx_msa_status` (`status`),
  CONSTRAINT `fk_msa_manager` FOREIGN KEY (`manager_user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_msa_admin` FOREIGN KEY (`assigned_by_admin_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 6. Manager -> Staff Service Requests (Pending Admin Approval)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `staff_service_requests` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `request_code` VARCHAR(40) NOT NULL UNIQUE,
  `manager_user_id` BIGINT UNSIGNED NOT NULL,
  `staff_user_id` BIGINT UNSIGNED NOT NULL,
  `manager_assignment_id` BIGINT UNSIGNED NOT NULL,
  `service_id` VARCHAR(64) NOT NULL,
  `service_name` VARCHAR(160) NOT NULL,
  `department_code` VARCHAR(32) NOT NULL,
  `requested_permissions_json` JSON NOT NULL,
  `reason` VARCHAR(255) NULL,
  `status` ENUM('DRAFT', 'PENDING_ADMIN_APPROVAL', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING_ADMIN_APPROVAL',
  `reviewed_by_admin_id` BIGINT UNSIGNED NULL,
  `reviewed_at` TIMESTAMP NULL,
  `review_notes` TEXT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_ssr_status` (`status`),
  INDEX `idx_ssr_staff` (`staff_user_id`),
  CONSTRAINT `fk_ssr_manager` FOREIGN KEY (`manager_user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ssr_staff` FOREIGN KEY (`staff_user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ssr_msa` FOREIGN KEY (`manager_assignment_id`) REFERENCES `manager_service_assignments` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ssr_reviewer` FOREIGN KEY (`reviewed_by_admin_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 7. Approved Staff Service Permissions (Activated Only by Admin)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `staff_service_permissions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `permission_code` VARCHAR(40) NOT NULL UNIQUE,
  `staff_user_id` BIGINT UNSIGNED NOT NULL,
  `manager_user_id` BIGINT UNSIGNED NOT NULL,
  `manager_assignment_id` BIGINT UNSIGNED NOT NULL,
  `request_id` BIGINT UNSIGNED NOT NULL,
  `service_id` VARCHAR(64) NOT NULL,
  `service_name` VARCHAR(160) NOT NULL,
  `department_code` VARCHAR(32) NOT NULL,
  `permissions_json` JSON NOT NULL,
  `approved_by_admin_id` BIGINT UNSIGNED NOT NULL,
  `effective_date` DATE NOT NULL,
  `expiry_date` DATE NULL,
  `status` ENUM('DRAFT', 'PENDING_ADMIN_APPROVAL', 'APPROVED', 'REJECTED', 'SUSPENDED', 'REVOKED', 'EXPIRED') NOT NULL DEFAULT 'APPROVED',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_ssp_staff_service` (`staff_user_id`, `service_id`),
  INDEX `idx_ssp_status` (`status`),
  CONSTRAINT `fk_ssp_staff` FOREIGN KEY (`staff_user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ssp_manager` FOREIGN KEY (`manager_user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ssp_msa` FOREIGN KEY (`manager_assignment_id`) REFERENCES `manager_service_assignments` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ssp_req` FOREIGN KEY (`request_id`) REFERENCES `staff_service_requests` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ssp_admin` FOREIGN KEY (`approved_by_admin_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 8. Immutable Service Approval & Cascade Revocation Logs
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `service_approval_logs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `log_code` VARCHAR(40) NOT NULL UNIQUE,
  `actor_user_id` BIGINT UNSIGNED NULL,
  `actor_role` VARCHAR(24) NOT NULL,
  `action` VARCHAR(64) NOT NULL,
  `target_type` ENUM('MANAGER_ASSIGNMENT', 'STAFF_REQUEST', 'STAFF_PERMISSION') NOT NULL,
  `target_code` VARCHAR(40) NOT NULL,
  `staff_user_id` BIGINT UNSIGNED NULL,
  `manager_user_id` BIGINT UNSIGNED NULL,
  `service_id` VARCHAR(64) NOT NULL,
  `previous_status` VARCHAR(32) NULL,
  `new_status` VARCHAR(32) NOT NULL,
  `details` TEXT NOT NULL,
  `status` ENUM('immutable') NOT NULL DEFAULT 'immutable',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_sal_target` (`target_code`, `created_at`),
  CONSTRAINT `fk_sal_actor` FOREIGN KEY (`actor_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 9. Re-authentication Tokens & Phase 02 Notifications
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `reauthentication_tokens` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `session_id` BIGINT UNSIGNED NOT NULL,
  `token_hash` CHAR(64) NOT NULL UNIQUE,
  `purpose` VARCHAR(80) NOT NULL,
  `expires_at` TIMESTAMP NOT NULL,
  `status` ENUM('ACTIVE', 'CONSUMED', 'EXPIRED') NOT NULL DEFAULT 'ACTIVE',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_reauth_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO `departments` (`code`, `name`, `description`, `status`) VALUES
  ('DEPT-ADMIN', 'Executive Administration', 'Master Admin, Security Governance & System Configuration', 'ACTIVE'),
  ('DEPT-CSC', 'CSC & Citizen Services', '550+ Digital Service Center services, e-KYC, Certificates & PVC Printing', 'ACTIVE'),
  ('DEPT-FIN', 'Finance & CSP Banking', 'GL Accounting, GST Compliance, Daily Cash & PNB CSP Operations', 'ACTIVE'),
  ('DEPT-LEGAL', 'Grievance, RTI & Legal', 'CPGRAMS, RTI Appeals, Tax Filings & Regulatory Notices', 'ACTIVE'),
  ('DEPT-OPS', 'Front-Desk Operations', 'Intake Counter, Document Verification & Customer Delivery', 'ACTIVE');

-- ============================================================================
-- ROLLBACK SCRIPT (Manual Execution Only When Reverting Migration 009)
-- ============================================================================
-- DROP TABLE IF EXISTS `reauthentication_tokens`;
-- DROP TABLE IF EXISTS `service_approval_logs`;
-- DROP TABLE IF EXISTS `staff_service_permissions`;
-- DROP TABLE IF EXISTS `staff_service_requests`;
-- DROP TABLE IF EXISTS `manager_service_assignments`;
-- DROP TABLE IF EXISTS `user_departments`;
-- DROP TABLE IF EXISTS `departments`;
-- DROP TABLE IF EXISTS `user_id_generation_history`;
-- ALTER TABLE `user_sessions` DROP COLUMN IF EXISTS `rotated_from_session_id`, DROP COLUMN IF EXISTS `device_id`, DROP COLUMN IF EXISTS `max_allowed_expires_at`, DROP COLUMN IF EXISTS `remember_me`;
-- ALTER TABLE `users` DROP COLUMN IF EXISTS `reauthenticated_until`, DROP COLUMN IF EXISTS `password_algo`, DROP COLUMN IF EXISTS `profile_photo_url`, DROP COLUMN IF EXISTS `emergency_contact`, DROP COLUMN IF EXISTS `joining_date`, DROP COLUMN IF EXISTS `department_code`, DROP COLUMN IF EXISTS `designation`, DROP COLUMN IF EXISTS `is_master_admin`;
