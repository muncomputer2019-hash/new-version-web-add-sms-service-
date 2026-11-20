-- ============================================================================
-- MUN COMPUTER BUSINESS MANAGER — Phase 08: Security, Backup, Disaster Recovery & Data Protection
-- Migration: 007_phase08_security_backup_dr.sql (MySQL 8.0 InnoDB)
-- Preserves all Phase 01-07 tables and data.
-- ============================================================================

-- 1. Enterprise Security Settings (Final Approved Configuration)
CREATE TABLE IF NOT EXISTS security_settings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  setting_key VARCHAR(80) NOT NULL UNIQUE,
  login_security_mode VARCHAR(64) NOT NULL DEFAULT 'OTP+PASSWORD+CAPTCHA',
  two_factor_channels_json JSON NOT NULL,
  password_min_length TINYINT UNSIGNED NOT NULL DEFAULT 8,
  password_expiry_days INT UNSIGNED NOT NULL DEFAULT 90,
  password_history_count TINYINT UNSIGNED NOT NULL DEFAULT 5,
  max_failed_login_attempts TINYINT UNSIGNED NOT NULL DEFAULT 5,
  account_lockout_minutes INT UNSIGNED NOT NULL DEFAULT 3,
  otp_expiry_seconds INT UNSIGNED NOT NULL DEFAULT 300,
  otp_max_attempts TINYINT UNSIGNED NOT NULL DEFAULT 5,
  otp_resend_cooldown_seconds INT UNSIGNED NOT NULL DEFAULT 30,
  otp_max_resends_per_hour TINYINT UNSIGNED NOT NULL DEFAULT 6,
  max_concurrent_sessions TINYINT UNSIGNED NOT NULL DEFAULT 3,
  active_encryption_key_version VARCHAR(32) NOT NULL DEFAULT 'KEY-V1',
  backup_retention_policy ENUM('PERMANENT_VERSIONED') NOT NULL DEFAULT 'PERMANENT_VERSIONED',
  restore_authority ENUM('ADMIN_ONLY') NOT NULL DEFAULT 'ADMIN_ONLY',
  updated_by VARCHAR(40) NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Authentication Logs (Login, Logout, Failed Attempt, Suspicious Login)
CREATE TABLE IF NOT EXISTS authentication_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  actor_user_id VARCHAR(40) NOT NULL,
  actor_role VARCHAR(24) NULL,
  event_type VARCHAR(48) NOT NULL,
  result ENUM('SUCCESS', 'FAILURE', 'BLOCKED') NOT NULL,
  ip_address VARCHAR(64) NULL,
  device_id VARCHAR(64) NULL,
  device_name VARCHAR(120) NULL,
  browser_info VARCHAR(80) NULL,
  os_info VARCHAR(80) NULL,
  suspicious_flag BOOLEAN NOT NULL DEFAULT FALSE,
  suspicious_reason VARCHAR(255) NULL,
  summary TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_authlog_user_time (actor_user_id, created_at),
  INDEX idx_authlog_event (event_type, result)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. OTP Verification Logs (Never stores plaintext OTP values)
CREATE TABLE IF NOT EXISTS otp_verification_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  challenge_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(40) NULL,
  purpose ENUM('LOGIN_OTP', 'MOBILE_VERIFICATION', 'PASSWORD_RESET', 'NEW_DEVICE_VERIFY', 'SENSITIVE_ACTION') NOT NULL,
  channel ENUM('EMAIL', 'SMS', 'WHATSAPP') NOT NULL,
  masked_target VARCHAR(120) NOT NULL,
  provider_configured BOOLEAN NOT NULL DEFAULT FALSE,
  delivery_status ENUM('DELIVERED', 'FAILED', 'NOT_CONFIGURED') NOT NULL,
  delivery_detail VARCHAR(255) NULL,
  attempts_used TINYINT UNSIGNED NOT NULL DEFAULT 0,
  outcome ENUM('PENDING', 'VERIFIED', 'FAILED', 'EXPIRED', 'LOCKED') NOT NULL DEFAULT 'PENDING',
  ip_address VARCHAR(64) NULL,
  device_id VARCHAR(64) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  verified_at TIMESTAMP NULL,
  INDEX idx_otplog_user (user_id, created_at),
  INDEX idx_otplog_challenge (challenge_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Registered Privacy-Conscious Devices
CREATE TABLE IF NOT EXISTS registered_devices (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  device_id VARCHAR(64) NOT NULL UNIQUE,
  user_id VARCHAR(40) NOT NULL,
  device_name VARCHAR(120) NOT NULL,
  browser_info VARCHAR(80) NOT NULL,
  os_info VARCHAR(80) NOT NULL,
  last_ip VARCHAR(64) NULL,
  verification_status ENUM('TRUSTED', 'PENDING_VERIFICATION', 'SUSPICIOUS', 'REVOKED') NOT NULL DEFAULT 'PENDING_VERIFICATION',
  first_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_active_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  verified_by VARCHAR(40) NULL,
  verified_at TIMESTAMP NULL,
  INDEX idx_regdev_user (user_id, verification_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. User Sessions Extension Table
CREATE TABLE IF NOT EXISTS user_sessions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  session_id VARCHAR(40) NOT NULL UNIQUE,
  token_hash CHAR(64) NOT NULL UNIQUE,
  user_id VARCHAR(40) NOT NULL,
  role VARCHAR(24) NOT NULL,
  device_id VARCHAR(64) NULL,
  device_name VARCHAR(120) NULL,
  ip_address VARCHAR(64) NULL,
  status ENUM('ACTIVE', 'REVOKED', 'EXPIRED') NOT NULL DEFAULT 'ACTIVE',
  revoked_reason VARCHAR(200) NULL,
  last_active_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_usess_user_status (user_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Password History (Prevent recent password reuse)
CREATE TABLE IF NOT EXISTS user_password_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(40) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  changed_by VARCHAR(40) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_uph_user (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Advanced Role, Permission Groups, Temporary Grants & Approval Workflows
CREATE TABLE IF NOT EXISTS custom_roles (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  role_code VARCHAR(40) NOT NULL UNIQUE,
  role_name VARCHAR(100) NOT NULL,
  base_role ENUM('MANAGER', 'STAFF', 'AUDITOR') NOT NULL DEFAULT 'STAFF',
  description TEXT NULL,
  permissions_json JSON NOT NULL,
  status ENUM('ACTIVE', 'ARCHIVED') NOT NULL DEFAULT 'ACTIVE',
  created_by VARCHAR(40) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS permission_groups (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  group_code VARCHAR(40) NOT NULL UNIQUE,
  group_name VARCHAR(120) NOT NULL,
  description TEXT NULL,
  permissions_json JSON NOT NULL,
  created_by VARCHAR(40) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_temporary_permissions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  grant_code VARCHAR(40) NOT NULL UNIQUE,
  user_id VARCHAR(40) NOT NULL,
  permission_key VARCHAR(80) NOT NULL,
  reason VARCHAR(255) NOT NULL,
  granted_by VARCHAR(40) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  status ENUM('ACTIVE', 'EXPIRED', 'REVOKED') NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_utp_user_exp (user_id, status, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS permission_change_requests (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  request_code VARCHAR(40) NOT NULL UNIQUE,
  target_user_id VARCHAR(40) NOT NULL,
  proposed_permissions_json JSON NOT NULL,
  reason TEXT NOT NULL,
  proposed_by VARCHAR(40) NOT NULL,
  status ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
  reviewed_by VARCHAR(40) NULL,
  review_notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TIMESTAMP NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS permission_change_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  actor_user_id VARCHAR(40) NOT NULL,
  target_user_id VARCHAR(40) NOT NULL,
  permission_key VARCHAR(80) NOT NULL,
  previous_value BOOLEAN NOT NULL,
  new_value BOOLEAN NOT NULL,
  approved_by VARCHAR(40) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. Tamper-Evident Before/After Activity Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  audit_uuid VARCHAR(64) NOT NULL UNIQUE,
  user_id VARCHAR(40) NOT NULL,
  user_role VARCHAR(24) NOT NULL,
  action_type VARCHAR(64) NOT NULL,
  module VARCHAR(64) NOT NULL,
  record_id VARCHAR(80) NOT NULL,
  before_values_json JSON NULL,
  after_values_json JSON NULL,
  ip_address VARCHAR(64) NULL,
  device_info VARCHAR(160) NULL,
  action_result ENUM('SUCCESS', 'FAILURE', 'BLOCKED') NOT NULL DEFAULT 'SUCCESS',
  previous_hash CHAR(64) NOT NULL,
  entry_hash CHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_aud_user_time (user_id, created_at),
  INDEX idx_aud_mod_rec (module, record_id),
  INDEX idx_aud_action (action_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 9. Backup Configurations, Schedules, Storage Locations, Versions & Integrity Logs
CREATE TABLE IF NOT EXISTS backup_configurations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  config_key VARCHAR(40) NOT NULL UNIQUE,
  encryption_algorithm VARCHAR(40) NOT NULL DEFAULT 'AES-256-GCM',
  signature_algorithm VARCHAR(40) NOT NULL DEFAULT 'HMAC-SHA256',
  active_key_version VARCHAR(32) NOT NULL DEFAULT 'KEY-V1',
  retention_policy VARCHAR(40) NOT NULL DEFAULT 'PERMANENT_VERSIONED',
  auto_retry_limit TINYINT UNSIGNED NOT NULL DEFAULT 3,
  updated_by VARCHAR(40) NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS backup_schedules (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  schedule_code VARCHAR(40) NOT NULL UNIQUE,
  frequency ENUM('DAILY', 'WEEKLY', 'MONTHLY', 'FINANCIAL_YEAR') NOT NULL,
  run_time_ist CHAR(5) NOT NULL DEFAULT '23:30',
  include_modules_json JSON NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  last_run_at TIMESTAMP NULL,
  next_run_at TIMESTAMP NULL,
  last_status ENUM('NEVER_RUN', 'SUCCESS', 'PARTIAL', 'FAILED') NOT NULL DEFAULT 'NEVER_RUN',
  retry_count TINYINT UNSIGNED NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS backup_storage_locations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  storage_code ENUM('PRIMARY_DB', 'CLOUD_STORAGE', 'SECONDARY_STORAGE') NOT NULL UNIQUE,
  provider_name VARCHAR(120) NOT NULL,
  endpoint_or_path VARCHAR(255) NULL,
  is_configured BOOLEAN NOT NULL DEFAULT FALSE,
  has_credentials BOOLEAN NOT NULL DEFAULT FALSE,
  connection_status ENUM('CONNECTED', 'NOT_CONFIGURED', 'ERROR') NOT NULL DEFAULT 'NOT_CONFIGURED',
  capacity_limit_mb BIGINT UNSIGNED NOT NULL DEFAULT 5120,
  used_mb DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  last_verified_at TIMESTAMP NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS backup_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  backup_code VARCHAR(48) NOT NULL UNIQUE,
  schedule_frequency ENUM('MANUAL', 'DAILY', 'WEEKLY', 'MONTHLY', 'FINANCIAL_YEAR') NOT NULL,
  financial_year VARCHAR(16) NOT NULL,
  version_no INT UNSIGNED NOT NULL DEFAULT 1,
  key_version VARCHAR(32) NOT NULL,
  encryption_algo VARCHAR(40) NOT NULL DEFAULT 'AES-256-GCM',
  checksum_sha256 CHAR(64) NOT NULL,
  signature_hmac CHAR(64) NOT NULL,
  file_size_bytes BIGINT UNSIGNED NOT NULL DEFAULT 0,
  record_counts_json JSON NOT NULL,
  storage_results_json JSON NOT NULL,
  status ENUM('SUCCESS', 'PARTIAL', 'FAILED', 'RESTORED') NOT NULL,
  integrity_status ENUM('VERIFIED', 'FAILED', 'PENDING') NOT NULL DEFAULT 'VERIFIED',
  permanent_retention BOOLEAN NOT NULL DEFAULT TRUE,
  failure_reason TEXT NULL,
  triggered_by VARCHAR(40) NOT NULL,
  started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP NULL,
  INDEX idx_bh_freq_fy (schedule_frequency, financial_year),
  INDEX idx_bh_ver (version_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS backup_integrity_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  backup_code VARCHAR(48) NOT NULL,
  check_type ENUM('CREATION', 'REPLICATION', 'SCHEDULED_AUDIT', 'PRE_RESTORE', 'MANUAL_VERIFY') NOT NULL,
  checksum_match BOOLEAN NOT NULL,
  signature_match BOOLEAN NOT NULL,
  decryption_ok BOOLEAN NOT NULL,
  checked_by VARCHAR(40) NOT NULL,
  notes TEXT NULL,
  checked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS backup_versions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  backup_code VARCHAR(48) NOT NULL,
  version_no INT UNSIGNED NOT NULL,
  financial_year VARCHAR(16) NOT NULL,
  primary_path VARCHAR(255) NULL,
  secondary_path VARCHAR(255) NULL,
  cloud_object_key VARCHAR(255) NULL,
  checksum_sha256 CHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 10. Admin-Only Restore History
CREATE TABLE IF NOT EXISTS restore_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  restore_code VARCHAR(48) NOT NULL UNIQUE,
  backup_code VARCHAR(48) NOT NULL,
  restore_scope ENUM('FULL', 'CUSTOMERS', 'APPLICATIONS', 'FINANCE', 'CONFIGURATION', 'DOCUMENTS', 'REPORT_ARCHIVES') NOT NULL,
  safety_backup_code VARCHAR(48) NOT NULL,
  preview_summary_json JSON NOT NULL,
  status ENUM('PREVIEWED', 'COMPLETED', 'FAILED', 'ROLLED_BACK') NOT NULL,
  executed_by VARCHAR(40) NOT NULL,
  failure_reason TEXT NULL,
  executed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 11. Soft Deleted Records & Data Recovery Logs
CREATE TABLE IF NOT EXISTS deleted_records (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  deletion_code VARCHAR(48) NOT NULL UNIQUE,
  entity_type ENUM('CUSTOMER', 'APPLICATION', 'SERVICE', 'DOCUMENT', 'REPORT_TEMPLATE') NOT NULL,
  entity_id VARCHAR(80) NOT NULL,
  display_label VARCHAR(180) NOT NULL,
  deletion_reason TEXT NOT NULL,
  deleted_by VARCHAR(40) NOT NULL,
  deleted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  recovery_status ENUM('SOFT_DELETED', 'RECOVERED', 'PENDING_PERMANENT_DELETE', 'PERMANENTLY_DELETED') NOT NULL DEFAULT 'SOFT_DELETED',
  recovered_by VARCHAR(40) NULL,
  recovered_at TIMESTAMP NULL,
  permanent_delete_requested_by VARCHAR(40) NULL,
  permanent_delete_approved_by VARCHAR(40) NULL,
  permanent_delete_approved_at TIMESTAMP NULL,
  snapshot_json JSON NULL,
  INDEX idx_dr_entity (entity_type, entity_id),
  INDEX idx_dr_status (recovery_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS data_recovery_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  deletion_code VARCHAR(48) NOT NULL,
  action ENUM('SOFT_DELETE', 'RECOVER', 'REQUEST_PERMANENT_DELETE', 'APPROVE_PERMANENT_DELETE', 'REJECT_PERMANENT_DELETE') NOT NULL,
  actor_user_id VARCHAR(40) NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 12. Real-Time Security Alerts, Incidents & System Health Logs
CREATE TABLE IF NOT EXISTS security_alerts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  alert_code VARCHAR(48) NOT NULL UNIQUE,
  category VARCHAR(64) NOT NULL,
  severity ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') NOT NULL,
  title VARCHAR(180) NOT NULL,
  description TEXT NOT NULL,
  related_user_id VARCHAR(40) NULL,
  status ENUM('OPEN', 'ACKNOWLEDGED', 'RESOLVED') NOT NULL DEFAULT 'OPEN',
  acknowledged_by VARCHAR(40) NULL,
  resolved_by VARCHAR(40) NULL,
  resolution_notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP NULL,
  INDEX idx_sa_status_sev (status, severity)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS security_incidents (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  incident_code VARCHAR(48) NOT NULL UNIQUE,
  category VARCHAR(64) NOT NULL,
  severity ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') NOT NULL,
  title VARCHAR(180) NOT NULL,
  description TEXT NOT NULL,
  reported_by VARCHAR(40) NOT NULL,
  assigned_to VARCHAR(40) NULL,
  investigation_status ENUM('OPEN', 'INVESTIGATING', 'CONTAINED', 'RESOLVED', 'CLOSED') NOT NULL DEFAULT 'OPEN',
  resolution_notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS system_health_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  component VARCHAR(64) NOT NULL,
  status ENUM('HEALTHY', 'WARNING', 'DEGRADED', 'DOWN') NOT NULL,
  metrics_json JSON NOT NULL,
  notes VARCHAR(255) NULL,
  checked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
