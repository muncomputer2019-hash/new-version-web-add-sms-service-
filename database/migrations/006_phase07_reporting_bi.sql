-- ============================================================================
-- MUN COMPUTER BUSINESS MANAGER — Phase 07: Reporting, Analytics, PDF & Excel
-- Migration: 006_phase07_reporting_bi.sql (MySQL 8.0 InnoDB)
-- Preserves all existing Phase 01-05 tables and data.
-- ============================================================================

-- 1. Granular Phase 07 Report Permissions Seed
INSERT IGNORE INTO permissions (module_key, permission_key, description) VALUES
  ('reports', 'report.view', 'View permitted reports and Reporting Dashboard'),
  ('reports', 'report.create', 'Create custom report templates and save report snapshots'),
  ('reports', 'report.update', 'Edit custom report templates and schedules'),
  ('reports', 'report.delete', 'Delete custom report templates or request/approve archive deletion'),
  ('reports', 'report.export.pdf', 'Export individual or combined PDF reports'),
  ('reports', 'report.export.excel', 'Export formatted multi-sheet Excel XLSX and CSV files'),
  ('reports', 'report.print', 'Print A4/A5 formatted reports'),
  ('reports', 'report.schedule', 'Configure and execute automated scheduled reports'),
  ('reports', 'report.archive.view', 'Search, download, and reprint archived report snapshots'),
  ('reports', 'report.audit.view', 'Inspect immutable report activity and export audit logs');

-- 2. Saved Custom Report Builder Templates
CREATE TABLE IF NOT EXISTS report_templates (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  template_code VARCHAR(40) NOT NULL UNIQUE,
  name VARCHAR(160) NOT NULL,
  description TEXT NULL,
  category VARCHAR(60) NOT NULL,
  data_source VARCHAR(60) NOT NULL,
  selected_fields_json JSON NOT NULL,
  filters_json JSON NOT NULL,
  filter_logic ENUM('AND', 'OR') NOT NULL DEFAULT 'AND',
  group_by_field VARCHAR(80) NULL,
  sort_by_field VARCHAR(80) NULL,
  sort_direction ENUM('asc', 'desc') NOT NULL DEFAULT 'desc',
  calculated_columns_json JSON NOT NULL,
  include_subtotals BOOLEAN NOT NULL DEFAULT TRUE,
  include_grand_total BOOLEAN NOT NULL DEFAULT TRUE,
  role_scope ENUM('ADMIN', 'MANAGER', 'ALL_PERMITTED') NOT NULL DEFAULT 'ALL_PERMITTED',
  version_no INT UNSIGNED NOT NULL DEFAULT 1,
  created_by VARCHAR(40) NOT NULL,
  updated_by VARCHAR(40) NULL,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_rt_category (category),
  INDEX idx_rt_source (data_source),
  INDEX idx_rt_deleted (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Automated Scheduled Reports Configuration
CREATE TABLE IF NOT EXISTS report_schedules (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  schedule_code VARCHAR(40) NOT NULL UNIQUE,
  name VARCHAR(160) NOT NULL,
  report_key VARCHAR(120) NOT NULL,
  template_code VARCHAR(40) NULL,
  frequency ENUM('DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'FINANCIAL_YEAR') NOT NULL,
  export_format ENUM('PDF', 'EXCEL', 'BOTH') NOT NULL DEFAULT 'PDF',
  language_code ENUM('en', 'bn') NOT NULL DEFAULT 'en',
  delivery_channels_json JSON NOT NULL,
  recipients_json JSON NOT NULL,
  filters_json JSON NULL,
  run_time_ist CHAR(5) NOT NULL DEFAULT '21:00',
  next_run_at TIMESTAMP NULL,
  last_run_at TIMESTAMP NULL,
  last_status ENUM('NEVER_RUN', 'SUCCESS', 'PARTIAL', 'FAILED') NOT NULL DEFAULT 'NEVER_RUN',
  retry_limit TINYINT UNSIGNED NOT NULL DEFAULT 3,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_by VARCHAR(40) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_rs_enabled_next (enabled, next_run_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Scheduled Report Execution & Retry History
CREATE TABLE IF NOT EXISTS report_schedule_runs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  run_code VARCHAR(48) NOT NULL UNIQUE,
  schedule_code VARCHAR(40) NOT NULL,
  attempt_no TINYINT UNSIGNED NOT NULL DEFAULT 1,
  status ENUM('SUCCESS', 'PARTIAL', 'FAILED', 'RETRYING') NOT NULL,
  archive_code VARCHAR(48) NULL,
  delivery_results_json JSON NOT NULL,
  error_message TEXT NULL,
  triggered_by VARCHAR(40) NOT NULL,
  started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP NULL,
  INDEX idx_rsr_schedule (schedule_code, started_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Encrypted Report Archive & Version History (Private Server Storage Only)
CREATE TABLE IF NOT EXISTS report_archives (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  archive_code VARCHAR(48) NOT NULL UNIQUE,
  report_key VARCHAR(120) NOT NULL,
  report_title VARCHAR(180) NOT NULL,
  category VARCHAR(60) NOT NULL,
  financial_year VARCHAR(16) NOT NULL,
  export_format ENUM('PDF', 'XLSX', 'CSV') NOT NULL,
  version_no INT UNSIGNED NOT NULL DEFAULT 1,
  row_count INT UNSIGNED NOT NULL DEFAULT 0,
  filters_snapshot_json JSON NULL,
  checksum_sha256 CHAR(64) NOT NULL,
  storage_file_name VARCHAR(255) NOT NULL,
  file_size_bytes BIGINT UNSIGNED NOT NULL DEFAULT 0,
  password_protected BOOLEAN NOT NULL DEFAULT FALSE,
  retention_days INT UNSIGNED NOT NULL DEFAULT 2920,
  retention_until DATE NOT NULL,
  deletion_status ENUM('ACTIVE', 'PENDING_ADMIN_APPROVAL', 'DELETED') NOT NULL DEFAULT 'ACTIVE',
  deletion_requested_by VARCHAR(40) NULL,
  deletion_reason TEXT NULL,
  deletion_approved_by VARCHAR(40) NULL,
  generated_by VARCHAR(40) NOT NULL,
  generated_role VARCHAR(24) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ra_fy_cat (financial_year, category),
  INDEX idx_ra_key_ver (report_key, version_no),
  INDEX idx_ra_del (deletion_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Immutable Phase 07 Report Audit Logs (No UPDATE/DELETE APIs)
CREATE TABLE IF NOT EXISTS report_audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  actor_user_id VARCHAR(40) NOT NULL,
  actor_role VARCHAR(24) NOT NULL,
  action VARCHAR(64) NOT NULL,
  report_name VARCHAR(180) NOT NULL,
  report_category VARCHAR(60) NOT NULL,
  filters_json JSON NULL,
  date_range_label VARCHAR(80) NULL,
  export_format VARCHAR(16) NULL,
  status ENUM('SUCCESS', 'FAILURE', 'BLOCKED') NOT NULL DEFAULT 'SUCCESS',
  before_state_json JSON NULL,
  after_state_json JSON NULL,
  ip_address VARCHAR(64) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ral_actor (actor_user_id, created_at),
  INDEX idx_ral_action (action, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
