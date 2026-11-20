-- ============================================================================
-- MUN COMPUTER BUSINESS MANAGER — Phase 09: Testing, QA & Release Readiness
-- Migration: 008_phase09_qa_release.sql (MySQL 8.0 InnoDB)
-- Preserves all Phase 01-08 tables and operational data.
-- ============================================================================

-- 1. Environments (Development, Testing, Staging, Production Isolation)
CREATE TABLE IF NOT EXISTS qa_test_environments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  env_key ENUM('DEVELOPMENT', 'TESTING', 'STAGING', 'PRODUCTION') NOT NULL UNIQUE,
  display_name VARCHAR(80) NOT NULL,
  app_url VARCHAR(255) NOT NULL,
  db_schema_name VARCHAR(80) NOT NULL,
  allow_automated_tests BOOLEAN NOT NULL DEFAULT FALSE,
  allow_destructive_drills BOOLEAN NOT NULL DEFAULT FALSE,
  credentials_isolated BOOLEAN NOT NULL DEFAULT TRUE,
  health_status ENUM('HEALTHY', 'WARNING', 'DOWN') NOT NULL DEFAULT 'HEALTHY',
  last_checked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by VARCHAR(40) NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Test Suites
CREATE TABLE IF NOT EXISTS qa_test_suites (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  suite_code VARCHAR(40) NOT NULL UNIQUE,
  suite_name VARCHAR(140) NOT NULL,
  test_type ENUM('UNIT', 'INTEGRATION', 'SYSTEM', 'UAT', 'SECURITY', 'PERFORMANCE', 'FINANCIAL', 'BACKUP_DRILL', 'REGRESSION', 'COMPATIBILITY') NOT NULL,
  target_phase VARCHAR(24) NOT NULL,
  description TEXT NULL,
  is_critical BOOLEAN NOT NULL DEFAULT TRUE,
  created_by VARCHAR(40) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Test Cases Register
CREATE TABLE IF NOT EXISTS qa_test_cases (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  case_code VARCHAR(48) NOT NULL UNIQUE,
  suite_code VARCHAR(40) NOT NULL,
  module_name VARCHAR(80) NOT NULL,
  target_phase VARCHAR(24) NOT NULL,
  test_type ENUM('UNIT', 'INTEGRATION', 'SYSTEM', 'UAT', 'SECURITY', 'PERFORMANCE', 'FINANCIAL', 'BACKUP_DRILL', 'REGRESSION', 'COMPATIBILITY') NOT NULL,
  polarity ENUM('POSITIVE', 'NEGATIVE', 'BOUNDARY', 'DESTRUCTIVE_DRILL') NOT NULL DEFAULT 'POSITIVE',
  priority ENUM('CRITICAL', 'HIGH', 'MEDIUM', 'LOW') NOT NULL DEFAULT 'HIGH',
  title VARCHAR(200) NOT NULL,
  preconditions TEXT NULL,
  steps_json JSON NOT NULL,
  expected_result TEXT NOT NULL,
  automation_key VARCHAR(120) NULL,
  is_automated BOOLEAN NOT NULL DEFAULT TRUE,
  last_status ENUM('PENDING', 'PASSED', 'FAILED', 'BLOCKED') NOT NULL DEFAULT 'PENDING',
  last_executed_at TIMESTAMP NULL,
  last_executed_by VARCHAR(40) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_qtc_suite_status (suite_code, last_status),
  INDEX idx_qtc_module (module_name, target_phase)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Test Execution Batches
CREATE TABLE IF NOT EXISTS qa_test_executions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  execution_code VARCHAR(48) NOT NULL UNIQUE,
  env_key ENUM('DEVELOPMENT', 'TESTING', 'STAGING', 'PRODUCTION') NOT NULL,
  trigger_source ENUM('MANUAL_UI', 'AUTOMATED_SUITE', 'REGRESSION', 'CI_CD_PIPELINE') NOT NULL,
  suite_filter VARCHAR(64) NULL,
  executed_by VARCHAR(40) NOT NULL,
  total_cases INT UNSIGNED NOT NULL DEFAULT 0,
  passed_count INT UNSIGNED NOT NULL DEFAULT 0,
  failed_count INT UNSIGNED NOT NULL DEFAULT 0,
  blocked_count INT UNSIGNED NOT NULL DEFAULT 0,
  duration_ms INT UNSIGNED NOT NULL DEFAULT 0,
  status ENUM('RUNNING', 'COMPLETED', 'ABORTED') NOT NULL DEFAULT 'COMPLETED',
  started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP NULL,
  INDEX idx_qte_env_time (env_key, started_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Individual Test Case Results
CREATE TABLE IF NOT EXISTS qa_test_results (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  result_code VARCHAR(48) NOT NULL UNIQUE,
  execution_code VARCHAR(48) NOT NULL,
  case_code VARCHAR(48) NOT NULL,
  suite_code VARCHAR(40) NOT NULL,
  module_name VARCHAR(80) NOT NULL,
  target_phase VARCHAR(24) NOT NULL,
  severity ENUM('CRITICAL', 'HIGH', 'MEDIUM', 'LOW') NOT NULL,
  status ENUM('PASSED', 'FAILED', 'BLOCKED') NOT NULL,
  duration_ms INT UNSIGNED NOT NULL DEFAULT 0,
  actual_result TEXT NOT NULL,
  evidence_json JSON NULL,
  executed_by VARCHAR(40) NOT NULL,
  executed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_qtr_exec (execution_code, status),
  INDEX idx_qtr_case (case_code, executed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Bug Reports, Assignments & History
CREATE TABLE IF NOT EXISTS qa_bug_reports (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  bug_code VARCHAR(48) NOT NULL UNIQUE,
  title VARCHAR(200) NOT NULL,
  category ENUM('Functional', 'UI', 'Database', 'API', 'Security', 'Performance', 'Financial Calculation', 'Integration', 'Compatibility') NOT NULL,
  priority ENUM('Critical', 'High', 'Medium', 'Low') NOT NULL,
  status ENUM('New', 'Assigned', 'In Progress', 'Fixed', 'Ready for Retest', 'Verified', 'Closed', 'Reopened') NOT NULL DEFAULT 'New',
  module_name VARCHAR(80) NOT NULL,
  related_case_code VARCHAR(48) NULL,
  env_key ENUM('DEVELOPMENT', 'TESTING', 'STAGING', 'PRODUCTION') NOT NULL DEFAULT 'TESTING',
  description TEXT NOT NULL,
  reproduction_steps TEXT NOT NULL,
  expected_result TEXT NOT NULL,
  actual_result TEXT NOT NULL,
  evidence_ref TEXT NULL,
  assigned_developer VARCHAR(40) NULL,
  reported_by VARCHAR(40) NOT NULL,
  resolution_notes TEXT NULL,
  fixed_at TIMESTAMP NULL,
  verified_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_qbr_prio_status (priority, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS qa_bug_assignments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  bug_code VARCHAR(48) NOT NULL,
  assigned_to VARCHAR(40) NOT NULL,
  assigned_by VARCHAR(40) NOT NULL,
  notes VARCHAR(255) NULL,
  assigned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS qa_bug_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  bug_code VARCHAR(48) NOT NULL,
  previous_status VARCHAR(32) NULL,
  new_status VARCHAR(32) NOT NULL,
  actor_user_id VARCHAR(40) NOT NULL,
  notes TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_qbh_bug (bug_code, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Security Audit & Penetration Test Findings
CREATE TABLE IF NOT EXISTS qa_security_findings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  finding_code VARCHAR(48) NOT NULL UNIQUE,
  owasp_category VARCHAR(80) NOT NULL,
  test_area VARCHAR(100) NOT NULL,
  severity ENUM('Critical', 'High', 'Medium', 'Low', 'Info') NOT NULL,
  status ENUM('VERIFIED_SECURE', 'OPEN_VULNERABILITY', 'REMEDIATED', 'RETESTED_PASS') NOT NULL,
  risk_assessment TEXT NOT NULL,
  evidence TEXT NOT NULL,
  remediation_notes TEXT NULL,
  tested_by VARCHAR(40) NOT NULL,
  tested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  retested_at TIMESTAMP NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. Performance, Load, Stress & Scalability Results
CREATE TABLE IF NOT EXISTS qa_performance_results (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  benchmark_code VARCHAR(48) NOT NULL UNIQUE,
  scenario_name VARCHAR(140) NOT NULL,
  test_type ENUM('LOAD', 'STRESS', 'SPIKE', 'ENDURANCE', 'SCALABILITY', 'PDF_EXPORT', 'EXCEL_EXPORT', 'DASHBOARD_LOAD') NOT NULL,
  concurrent_users INT UNSIGNED NOT NULL DEFAULT 1,
  total_requests INT UNSIGNED NOT NULL DEFAULT 1,
  target_threshold_ms DECIMAL(10,2) NOT NULL,
  avg_response_ms DECIMAL(10,2) NOT NULL,
  p95_response_ms DECIMAL(10,2) NOT NULL,
  throughput_rps DECIMAL(10,2) NOT NULL,
  error_rate_pct DECIMAL(6,2) NOT NULL DEFAULT 0.00,
  memory_rss_mb DECIMAL(10,2) NOT NULL,
  passed BOOLEAN NOT NULL,
  executed_by VARCHAR(40) NOT NULL,
  executed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 9. Financial Accounting Reconciliation Verifications
CREATE TABLE IF NOT EXISTS qa_financial_reconciliation (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  reconciliation_code VARCHAR(48) NOT NULL UNIQUE,
  env_key ENUM('DEVELOPMENT', 'TESTING', 'STAGING', 'PRODUCTION') NOT NULL,
  financial_year VARCHAR(16) NOT NULL,
  trial_balance_debit DECIMAL(14,2) NOT NULL,
  trial_balance_credit DECIMAL(14,2) NOT NULL,
  balance_sheet_diff DECIMAL(14,2) NOT NULL,
  pnl_net_profit DECIMAL(14,2) NOT NULL,
  cashbook_expected DECIMAL(14,2) NOT NULL,
  cashbook_actual DECIMAL(14,2) NOT NULL,
  outstanding_dues_total DECIMAL(14,2) NOT NULL,
  csp_segregation_valid BOOLEAN NOT NULL,
  inr_rounding_valid BOOLEAN NOT NULL,
  duplicate_vouchers_count INT UNSIGNED NOT NULL DEFAULT 0,
  mismatch_count INT UNSIGNED NOT NULL DEFAULT 0,
  status ENUM('RECONCILED', 'MISMATCH_BLOCKED') NOT NULL,
  details_json JSON NOT NULL,
  executed_by VARCHAR(40) NOT NULL,
  executed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 10. Isolated Backup & Full Restore Drills
CREATE TABLE IF NOT EXISTS qa_backup_drills (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  drill_code VARCHAR(48) NOT NULL UNIQUE,
  drill_scope ENUM('FULL', 'CUSTOMERS', 'FINANCE', 'CONFIGURATION', 'DOCUMENTS', 'REPORT_ARCHIVES') NOT NULL,
  schedule_tested ENUM('DAILY', 'WEEKLY', 'MONTHLY', 'FINANCIAL_YEAR') NOT NULL,
  backup_code_verified VARCHAR(48) NOT NULL,
  checksum_verified BOOLEAN NOT NULL,
  hmac_verified BOOLEAN NOT NULL,
  encryption_verified BOOLEAN NOT NULL,
  key_rotation_verified BOOLEAN NOT NULL,
  duplicate_prevention_verified BOOLEAN NOT NULL,
  balance_sheet_post_restore_ok BOOLEAN NOT NULL,
  recovery_time_ms INT UNSIGNED NOT NULL,
  recovery_point_loss INT UNSIGNED NOT NULL DEFAULT 0,
  status ENUM('PASSED', 'FAILED') NOT NULL,
  notes TEXT NOT NULL,
  executed_by VARCHAR(40) NOT NULL,
  executed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 11. Regression Test Runs
CREATE TABLE IF NOT EXISTS qa_regression_runs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  regression_code VARCHAR(48) NOT NULL UNIQUE,
  trigger_reason VARCHAR(180) NOT NULL,
  affected_modules_json JSON NOT NULL,
  total_cases INT UNSIGNED NOT NULL,
  passed_count INT UNSIGNED NOT NULL,
  failed_count INT UNSIGNED NOT NULL,
  status ENUM('PASSED', 'FAILED') NOT NULL,
  executed_by VARCHAR(40) NOT NULL,
  executed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 12. Formal UAT Sessions (Admin, Manager, Staff)
CREATE TABLE IF NOT EXISTS qa_uat_sessions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  uat_code VARCHAR(48) NOT NULL UNIQUE,
  tester_user_id VARCHAR(40) NOT NULL,
  tester_role ENUM('ADMIN', 'MANAGER', 'STAFF') NOT NULL,
  workflow_name VARCHAR(160) NOT NULL,
  cases_verified INT UNSIGNED NOT NULL DEFAULT 0,
  feedback TEXT NOT NULL,
  acceptance_status ENUM('PENDING', 'ACCEPTED', 'CHANGES_REQUESTED') NOT NULL DEFAULT 'PENDING',
  approved_by VARCHAR(40) NULL,
  approved_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 13. Release Readiness Approvals & Release History
CREATE TABLE IF NOT EXISTS qa_release_approvals (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  release_code VARCHAR(48) NOT NULL UNIQUE,
  release_version VARCHAR(32) NOT NULL,
  release_status ENUM('NOT_READY', 'TESTING_IN_PROGRESS', 'BLOCKED', 'READY_FOR_ADMIN_APPROVAL', 'APPROVED', 'RELEASED') NOT NULL,
  security_approved BOOLEAN NOT NULL DEFAULT FALSE,
  financial_verified BOOLEAN NOT NULL DEFAULT FALSE,
  backup_verified BOOLEAN NOT NULL DEFAULT FALSE,
  uat_approved BOOLEAN NOT NULL DEFAULT FALSE,
  build_verified BOOLEAN NOT NULL DEFAULT FALSE,
  blockers_json JSON NOT NULL,
  release_notes TEXT NOT NULL,
  approved_by VARCHAR(40) NULL,
  approved_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS qa_release_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  release_code VARCHAR(48) NOT NULL,
  release_version VARCHAR(32) NOT NULL,
  action VARCHAR(64) NOT NULL,
  actor_user_id VARCHAR(40) NOT NULL,
  summary TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 14. Test Evidence & Attachments
CREATE TABLE IF NOT EXISTS qa_test_attachments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  attachment_code VARCHAR(48) NOT NULL UNIQUE,
  entity_type ENUM('TEST_RESULT', 'BUG_REPORT', 'UAT_SESSION', 'RELEASE_APPROVAL') NOT NULL,
  entity_code VARCHAR(48) NOT NULL,
  file_name VARCHAR(180) NOT NULL,
  mime_type VARCHAR(80) NOT NULL,
  size_bytes BIGINT UNSIGNED NOT NULL DEFAULT 0,
  sha256_digest CHAR(64) NOT NULL,
  uploaded_by VARCHAR(40) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
