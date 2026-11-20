-- ============================================================================
-- MUN COMPUTER — Phase 03 Migration: Master Settings & Global Configuration
-- Database: mun_computer_db (MySQL 8.0 InnoDB)
-- Covers all 23 Phase 03 Master Settings, Branches/Counters, Daily Cash,
-- Service Rate Versioning, Document Sequences, Templates, Backups, & Audit.
-- ============================================================================

USE `mun_computer_db`;

-- 1. Branches (Multi-branch ready; currently Single Branch – MUN COMPUTER)
CREATE TABLE IF NOT EXISTS `branches` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `branch_code` VARCHAR(32) NOT NULL UNIQUE,
  `name` VARCHAR(160) NOT NULL,
  `address` TEXT NOT NULL,
  `pin_code` VARCHAR(16) NOT NULL,
  `phone` VARCHAR(32) NOT NULL,
  `is_default` TINYINT(1) NOT NULL DEFAULT 0,
  `status` ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Counters (Separate cash, receipts, and daily closings per counter)
CREATE TABLE IF NOT EXISTS `counters` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `branch_id` BIGINT UNSIGNED NOT NULL,
  `counter_code` VARCHAR(32) NOT NULL UNIQUE,
  `name` VARCHAR(120) NOT NULL,
  `assigned_user_id` BIGINT UNSIGNED NULL,
  `status` ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_counters_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_counters_user` FOREIGN KEY (`assigned_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Company Settings
CREATE TABLE IF NOT EXISTS `company_settings` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `branch_id` BIGINT UNSIGNED NULL,
  `company_name` VARCHAR(160) NOT NULL DEFAULT 'MUN COMPUTER',
  `address_line` TEXT NOT NULL,
  `post_office` VARCHAR(80) NOT NULL,
  `police_station` VARCHAR(80) NOT NULL,
  `district` VARCHAR(80) NOT NULL,
  `state_name` VARCHAR(80) NOT NULL,
  `country_name` VARCHAR(80) NOT NULL DEFAULT 'India',
  `pin_code` VARCHAR(16) NOT NULL DEFAULT '742406',
  `mobile` VARCHAR(32) NOT NULL DEFAULT '+91 8101352105',
  `whatsapp` VARCHAR(32) NOT NULL DEFAULT '+91 8101352105',
  `email` VARCHAR(160) NOT NULL DEFAULT 'MUNCOMPUTER2019@GMAIL.COM',
  `website` VARCHAR(200) NULL,
  `gst_number` VARCHAR(32) NULL,
  `pan_number` VARCHAR(20) NULL,
  `upi_id` VARCHAR(120) NULL,
  `bank_details` TEXT NULL,
  `logo_path` VARCHAR(255) NULL,
  `signature_path` VARCHAR(255) NULL,
  `stamp_path` VARCHAR(255) NULL,
  `updated_by` BIGINT UNSIGNED NULL,
  `status` ENUM('active', 'archived') NOT NULL DEFAULT 'active',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_cs_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_cs_user` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Service Rates & Version Snapshots
CREATE TABLE IF NOT EXISTS `service_rates` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `service_id` BIGINT UNSIGNED NULL,
  `service_code` VARCHAR(40) NOT NULL UNIQUE,
  `service_name` VARCHAR(160) NOT NULL,
  `category` VARCHAR(80) NOT NULL,
  `customer_charge` DECIMAL(12,2) NOT NULL,
  `service_cost` DECIMAL(12,2) NOT NULL,
  `profit_amount` DECIMAL(12,2) GENERATED ALWAYS AS (`customer_charge` - `service_cost`) STORED,
  `current_version` INT UNSIGNED NOT NULL DEFAULT 1,
  `effective_date` DATE NOT NULL,
  `updated_by` BIGINT UNSIGNED NULL,
  `status` ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_sr_service` FOREIGN KEY (`service_id`) REFERENCES `services` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_sr_user` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `service_rate_versions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `service_rate_id` BIGINT UNSIGNED NOT NULL,
  `version_no` INT UNSIGNED NOT NULL,
  `customer_charge` DECIMAL(12,2) NOT NULL,
  `service_cost` DECIMAL(12,2) NOT NULL,
  `profit_amount` DECIMAL(12,2) NOT NULL,
  `effective_date` DATE NOT NULL,
  `change_reason` VARCHAR(255) NOT NULL,
  `approval_status` ENUM('Pending', 'Approved', 'Rejected') NOT NULL DEFAULT 'Approved',
  `proposed_by` BIGINT UNSIGNED NULL,
  `approved_by` BIGINT UNSIGNED NULL,
  `status` ENUM('active', 'superseded') NOT NULL DEFAULT 'active',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_srv_ver` (`service_rate_id`, `version_no`),
  CONSTRAINT `fk_srv_rate` FOREIGN KEY (`service_rate_id`) REFERENCES `service_rates` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_srv_proposer` FOREIGN KEY (`proposed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_srv_approver` FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Global Settings & Financial-Year Document Sequences
CREATE TABLE IF NOT EXISTS `global_settings` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `financial_year_start_month` TINYINT UNSIGNED NOT NULL DEFAULT 4,
  `financial_year_end_month` TINYINT UNSIGNED NOT NULL DEFAULT 3,
  `timezone` VARCHAR(64) NOT NULL DEFAULT 'Asia/Kolkata',
  `default_language` ENUM('en', 'bn', 'hi') NOT NULL DEFAULT 'en',
  `date_format` VARCHAR(20) NOT NULL DEFAULT 'DD/MM/YYYY',
  `currency_code` CHAR(3) NOT NULL DEFAULT 'INR',
  `currency_symbol` VARCHAR(8) NOT NULL DEFAULT '₹',
  `receipt_prefix` VARCHAR(12) NOT NULL DEFAULT 'MCR',
  `invoice_prefix` VARCHAR(12) NOT NULL DEFAULT 'MCI',
  `application_prefix` VARCHAR(12) NOT NULL DEFAULT 'MCA',
  `updated_by` BIGINT UNSIGNED NULL,
  `status` ENUM('active') NOT NULL DEFAULT 'active',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_gs_user` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `document_sequences` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `doc_type` ENUM('RECEIPT', 'INVOICE', 'APPLICATION') NOT NULL,
  `prefix` VARCHAR(12) NOT NULL,
  `financial_year` VARCHAR(16) NOT NULL,
  `last_serial` BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `status` ENUM('active', 'closed') NOT NULL DEFAULT 'active',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_doc_seq` (`doc_type`, `financial_year`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Notification Settings
CREATE TABLE IF NOT EXISTS `notification_settings` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `event_key` VARCHAR(64) NOT NULL UNIQUE,
  `event_label` VARCHAR(120) NOT NULL,
  `sms_enabled` TINYINT(1) NOT NULL DEFAULT 0,
  `email_enabled` TINYINT(1) NOT NULL DEFAULT 0,
  `whatsapp_enabled` TINYINT(1) NOT NULL DEFAULT 0,
  `dashboard_enabled` TINYINT(1) NOT NULL DEFAULT 1,
  `template_subject` VARCHAR(160) NULL,
  `template_body` TEXT NOT NULL,
  `updated_by` BIGINT UNSIGNED NULL,
  `status` ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_ns_user` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Document Templates & Print Settings
CREATE TABLE IF NOT EXISTS `document_templates` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `doc_type` ENUM('RECEIPT', 'INVOICE', 'DECLARATION') NOT NULL,
  `design_variant` ENUM('Simple Professional', 'Detailed Professional') NOT NULL DEFAULT 'Simple Professional',
  `paper_size` ENUM('A4') NOT NULL DEFAULT 'A4',
  `default_copies` TINYINT UNSIGNED NOT NULL DEFAULT 1,
  `show_logo` TINYINT(1) NOT NULL DEFAULT 1,
  `show_signature` TINYINT(1) NOT NULL DEFAULT 1,
  `show_stamp` TINYINT(1) NOT NULL DEFAULT 1,
  `show_qr` TINYINT(1) NOT NULL DEFAULT 1,
  `terms_and_conditions` TEXT NOT NULL,
  `disclaimer_text` TEXT NOT NULL,
  `version_no` INT UNSIGNED NOT NULL DEFAULT 1,
  `updated_by` BIGINT UNSIGNED NULL,
  `status` ENUM('active', 'archived') NOT NULL DEFAULT 'active',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_dt_user` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. Payment & QR Settings
CREATE TABLE IF NOT EXISTS `payment_settings` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `cash_enabled` TINYINT(1) NOT NULL DEFAULT 1,
  `upi_enabled` TINYINT(1) NOT NULL DEFAULT 1,
  `other_enabled` TINYINT(1) NOT NULL DEFAULT 1,
  `qr_type` ENUM('Static QR', 'Dynamic QR') NOT NULL DEFAULT 'Static QR',
  `qr_on_receipt` TINYINT(1) NOT NULL DEFAULT 1,
  `qr_on_invoice` TINYINT(1) NOT NULL DEFAULT 1,
  `manual_verification_required` TINYINT(1) NOT NULL DEFAULT 1,
  `upi_id` VARCHAR(120) NULL,
  `static_qr_image_path` VARCHAR(255) NULL,
  `dynamic_qr_provider_configured` TINYINT(1) NOT NULL DEFAULT 0,
  `updated_by` BIGINT UNSIGNED NULL,
  `status` ENUM('active') NOT NULL DEFAULT 'active',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_ps_user` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 9. Master Settings Approval Requests (MANAGER -> PROPOSES -> ADMIN REVIEWS)
CREATE TABLE IF NOT EXISTS `approval_requests` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `proposal_code` VARCHAR(32) NOT NULL UNIQUE,
  `setting_module` VARCHAR(80) NOT NULL,
  `setting_name` VARCHAR(120) NOT NULL,
  `old_value_json` JSON NULL,
  `proposed_value_json` JSON NOT NULL,
  `change_reason` VARCHAR(255) NOT NULL,
  `proposed_by` BIGINT UNSIGNED NOT NULL,
  `reviewed_by` BIGINT UNSIGNED NULL,
  `approval_date` TIMESTAMP NULL,
  `rejection_reason` VARCHAR(255) NULL,
  `status` ENUM('Pending', 'Approved', 'Rejected') NOT NULL DEFAULT 'Pending',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_ar_status` (`status`),
  CONSTRAINT `fk_ar_proposer` FOREIGN KEY (`proposed_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_ar_reviewer` FOREIGN KEY (`reviewed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 10. Settings History
CREATE TABLE IF NOT EXISTS `settings_history` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `setting_module` VARCHAR(80) NOT NULL,
  `setting_name` VARCHAR(120) NOT NULL,
  `old_value_json` JSON NULL,
  `new_value_json` JSON NOT NULL,
  `change_reason` VARCHAR(255) NULL,
  `changed_by` BIGINT UNSIGNED NULL,
  `approved_by` BIGINT UNSIGNED NULL,
  `status` ENUM('recorded') NOT NULL DEFAULT 'recorded',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_sh_module` (`setting_module`),
  CONSTRAINT `fk_sh_changer` FOREIGN KEY (`changed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_sh_approver` FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 11. Backup Logs
CREATE TABLE IF NOT EXISTS `backup_logs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `backup_code` VARCHAR(40) NOT NULL UNIQUE,
  `storage_target` ENUM('Hosting Server', 'Computer Download') NOT NULL,
  `encryption_algo` VARCHAR(40) NOT NULL DEFAULT 'AES-256-GCM',
  `checksum_sha256` CHAR(64) NOT NULL,
  `file_size_bytes` BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `triggered_by` BIGINT UNSIGNED NULL,
  `failure_reason` VARCHAR(255) NULL,
  `status` ENUM('Success', 'Failed', 'Restored') NOT NULL DEFAULT 'Success',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_bl_user` FOREIGN KEY (`triggered_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 12. Daily Cash Closings
CREATE TABLE IF NOT EXISTS `daily_cash_closings` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `closing_code` VARCHAR(40) NOT NULL UNIQUE,
  `branch_id` BIGINT UNSIGNED NOT NULL,
  `counter_id` BIGINT UNSIGNED NOT NULL,
  `closing_date` DATE NOT NULL,
  `opening_cash` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `cash_received` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `cash_expenses` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `expected_cash` DECIMAL(12,2) NOT NULL,
  `actual_cash_count` DECIMAL(12,2) NOT NULL,
  `cash_difference` DECIMAL(12,2) NOT NULL,
  `difference_reason` VARCHAR(255) NULL,
  `submitted_by` BIGINT UNSIGNED NOT NULL,
  `approved_by` BIGINT UNSIGNED NULL,
  `approval_status` ENUM('Approved', 'Pending Admin Approval', 'Rejected') NOT NULL DEFAULT 'Approved',
  `status` ENUM('active', 'corrected') NOT NULL DEFAULT 'active',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_counter_date` (`counter_id`, `closing_date`),
  CONSTRAINT `fk_dcc_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_dcc_counter` FOREIGN KEY (`counter_id`) REFERENCES `counters` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_dcc_submitter` FOREIGN KEY (`submitted_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_dcc_approver` FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 13. Customer & Privacy Settings
CREATE TABLE IF NOT EXISTS `customer_settings` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `check_duplicate_mobile` TINYINT(1) NOT NULL DEFAULT 1,
  `check_duplicate_aadhaar` TINYINT(1) NOT NULL DEFAULT 1,
  `consent_mandatory` TINYINT(1) NOT NULL DEFAULT 1,
  `mask_aadhaar_by_default` TINYINT(1) NOT NULL DEFAULT 1,
  `data_export_admin_only` TINYINT(1) NOT NULL DEFAULT 1,
  `retention_policy` VARCHAR(120) NOT NULL DEFAULT 'Long-term retention subject to applicable law',
  `updated_by` BIGINT UNSIGNED NULL,
  `status` ENUM('active') NOT NULL DEFAULT 'active',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_custs_user` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 14. Document Uploads (Private hosting storage, <=10MB, PDF/JPEG/PNG)
CREATE TABLE IF NOT EXISTS `document_uploads` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `file_uuid` CHAR(36) NOT NULL UNIQUE,
  `original_name` VARCHAR(255) NOT NULL,
  `stored_filename` VARCHAR(255) NOT NULL,
  `mime_type` ENUM('application/pdf', 'image/jpeg', 'image/png') NOT NULL,
  `file_size_bytes` INT UNSIGNED NOT NULL,
  `entity_type` VARCHAR(60) NOT NULL,
  `entity_id` BIGINT UNSIGNED NULL,
  `uploaded_by` BIGINT UNSIGNED NOT NULL,
  `deleted_by` BIGINT UNSIGNED NULL,
  `status` ENUM('active', 'deleted') NOT NULL DEFAULT 'active',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_du_uploader` FOREIGN KEY (`uploaded_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_du_deleter` FOREIGN KEY (`deleted_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 15. API Integrations (Encrypted secrets; never returned in API responses)
CREATE TABLE IF NOT EXISTS `api_integrations` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `channel` ENUM('SMS', 'EMAIL_SMTP', 'WHATSAPP') NOT NULL UNIQUE,
  `provider_name` VARCHAR(80) NOT NULL,
  `endpoint_or_host` VARCHAR(255) NULL,
  `sender_or_from` VARCHAR(120) NULL,
  `credentials_encrypted` VARBINARY(1024) NULL,
  `is_configured` TINYINT(1) NOT NULL DEFAULT 0,
  `last_tested_at` TIMESTAMP NULL,
  `last_test_status` ENUM('Not Tested', 'Connected', 'Failed') NOT NULL DEFAULT 'Not Tested',
  `updated_by` BIGINT UNSIGNED NULL,
  `status` ENUM('active', 'inactive') NOT NULL DEFAULT 'inactive',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_ai_user` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 16. Dashboard Preferences, Report Settings, Maintenance Settings
CREATE TABLE IF NOT EXISTS `dashboard_preferences` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `role_slug` ENUM('ADMIN', 'MANAGER', 'STAFF') NOT NULL UNIQUE,
  `widgets_json` JSON NOT NULL,
  `quick_actions_json` JSON NOT NULL,
  `default_period` ENUM('Today', 'This Week', 'This Month') NOT NULL DEFAULT 'Today',
  `updated_by` BIGINT UNSIGNED NULL,
  `status` ENUM('active') NOT NULL DEFAULT 'active',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_dp_user` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `report_settings` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `default_export_format` ENUM('PDF', 'Excel', 'CSV') NOT NULL DEFAULT 'PDF',
  `auto_daily_report_enabled` TINYINT(1) NOT NULL DEFAULT 0,
  `auto_report_time` TIME NOT NULL DEFAULT '21:00:00',
  `updated_by` BIGINT UNSIGNED NULL,
  `status` ENUM('active') NOT NULL DEFAULT 'active',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_rs_user` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `maintenance_settings` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `maintenance_mode` TINYINT(1) NOT NULL DEFAULT 0,
  `maintenance_message` VARCHAR(255) NOT NULL DEFAULT 'Scheduled maintenance in progress.',
  `debug_mode` TINYINT(1) NOT NULL DEFAULT 0,
  `error_alert_admin` TINYINT(1) NOT NULL DEFAULT 1,
  `error_alert_manager` TINYINT(1) NOT NULL DEFAULT 1,
  `updated_by` BIGINT UNSIGNED NULL,
  `status` ENUM('active') NOT NULL DEFAULT 'active',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_ms_user` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
