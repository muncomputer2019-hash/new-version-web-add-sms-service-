-- ============================================================================
-- MUN COMPUTER BUSINESS MANAGER — Migration 004: Enterprise ERP (Q1-Q51)
-- Covers Customer CRM & 7-Category Consents, Dynamic Service Form Builder,
-- Required Docs & SLA Rules, Automation Engine, 12-Status Applications,
-- Assignment/Reassignment Requests, Dynamic Reference Fields, Private Docs,
-- Follow-ups, Separate Internal/Customer Notes, Delivery Handover,
-- Cancellations, Financial Payments/Refunds, Notifications & Export Audit Logs.
-- ============================================================================

SET NAMES utf8mb4;
SET time_zone = '+05:30';

-- 1. CUSTOMER CRM EXTENSIONS, CONSENTS, CONTACT & MERGE AUDIT
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS father_husband_name VARCHAR(150) NULL,
  ADD COLUMN IF NOT EXISTS dob DATE NULL,
  ADD COLUMN IF NOT EXISTS gender ENUM('Male', 'Female', 'Other') DEFAULT 'Male',
  ADD COLUMN IF NOT EXISTS whatsapp VARCHAR(30) NULL,
  ADD COLUMN IF NOT EXISTS aadhaar_encrypted VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS aadhaar_last4 CHAR(4) NULL,
  ADD COLUMN IF NOT EXISTS pan_number VARCHAR(20) NULL,
  ADD COLUMN IF NOT EXISTS voter_id VARCHAR(30) NULL,
  ADD COLUMN IF NOT EXISTS village VARCHAR(120) NULL,
  ADD COLUMN IF NOT EXISTS post_office VARCHAR(120) NULL,
  ADD COLUMN IF NOT EXISTS police_station VARCHAR(120) NULL,
  ADD COLUMN IF NOT EXISTS district VARCHAR(120) DEFAULT 'Murshidabad',
  ADD COLUMN IF NOT EXISTS pin_code VARCHAR(15) NULL,
  ADD COLUMN IF NOT EXISTS present_address TEXT NULL,
  ADD COLUMN IF NOT EXISTS permanent_address TEXT NULL,
  ADD COLUMN IF NOT EXISTS same_as_present TINYINT(1) DEFAULT 1,
  ADD COLUMN IF NOT EXISTS crm_tag VARCHAR(50) DEFAULT 'New',
  ADD COLUMN IF NOT EXISTS verification_status ENUM('Unverified','Mobile Verified','Consent Verified','Fully Verified','Verification Expired','Re-verification Required') DEFAULT 'Unverified',
  ADD COLUMN IF NOT EXISTS mobile_otp_verified_at TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS merged_into_customer_id VARCHAR(32) NULL,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS deleted_by VARCHAR(32) NULL;

CREATE TABLE IF NOT EXISTS customer_consents (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  customer_id VARCHAR(32) NOT NULL,
  category_key ENUM('SMS_CONSENT','WHATSAPP_CONSENT','STATUS_UPDATE_CONSENT','PAYMENT_REMINDER_CONSENT','SERVICE_NOTIFICATION_CONSENT','PROMOTIONAL_CONSENT','DATA_PRIVACY_CONSENT') NOT NULL,
  granted TINYINT(1) NOT NULL DEFAULT 0,
  verification_method ENUM('Digital Signature','Printed Signed Form','OTP Confirmed','Not Set') DEFAULT 'Not Set',
  recorded_by VARCHAR(32) NOT NULL,
  recorded_at TIMESTAMP NULL,
  UNIQUE KEY uq_customer_consent_cat (customer_id, category_key),
  INDEX idx_cc_customer (customer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS customer_consent_history (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  customer_id VARCHAR(32) NOT NULL,
  category_key VARCHAR(50) NOT NULL,
  previous_granted TINYINT(1) NOT NULL,
  new_granted TINYINT(1) NOT NULL,
  method VARCHAR(50) NOT NULL,
  notes TEXT NULL,
  actor_user_id VARCHAR(32) NOT NULL,
  recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_cch_customer (customer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS customer_contact_history (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  customer_id VARCHAR(32) NOT NULL,
  field_name ENUM('mobile','whatsapp') NOT NULL,
  old_value VARCHAR(30) NOT NULL,
  new_value VARCHAR(30) NOT NULL,
  verified_by_otp TINYINT(1) NOT NULL DEFAULT 0,
  admin_override_reason TEXT NULL,
  changed_by VARCHAR(32) NOT NULL,
  changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_cch_mob (customer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS customer_merge_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  primary_customer_id VARCHAR(32) NOT NULL,
  duplicate_customer_id VARCHAR(32) NOT NULL,
  relinked_applications INT NOT NULL DEFAULT 0,
  reason TEXT NOT NULL,
  merged_by VARCHAR(32) NOT NULL,
  merged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. SERVICE CATEGORIES, CATALOG, DYNAMIC FORM VERSIONS, SLA & AUTOMATION RULES
CREATE TABLE IF NOT EXISTS service_categories (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL UNIQUE,
  description TEXT NULL,
  status ENUM('active','pending_approval','archived') DEFAULT 'active',
  proposed_by VARCHAR(32) NOT NULL,
  approved_by VARCHAR(32) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS service_form_versions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  service_id VARCHAR(32) NOT NULL,
  version_no INT NOT NULL,
  fields_json JSON NOT NULL,
  status ENUM('published','archived') DEFAULT 'published',
  published_by VARCHAR(32) NOT NULL,
  published_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_srv_form_ver (service_id, version_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS service_required_documents (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  service_id VARCHAR(32) NOT NULL,
  doc_key VARCHAR(64) NOT NULL,
  label VARCHAR(150) NOT NULL,
  category VARCHAR(80) NOT NULL,
  is_required TINYINT(1) NOT NULL DEFAULT 1,
  allow_multiple TINYINT(1) NOT NULL DEFAULT 0,
  allowed_formats VARCHAR(64) NOT NULL DEFAULT 'PDF,JPG,JPEG,PNG',
  max_size_mb INT NOT NULL DEFAULT 10,
  instructions TEXT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  INDEX idx_srd_service (service_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS service_sla_configs (
  service_id VARCHAR(32) PRIMARY KEY,
  processing_mode ENUM('FIXED','RANGE') DEFAULT 'FIXED',
  expected_days INT NOT NULL DEFAULT 3,
  min_days INT NOT NULL DEFAULT 1,
  max_days INT NOT NULL DEFAULT 5,
  day_type ENUM('CALENDAR','WORKING') DEFAULT 'WORKING',
  exclude_holidays TINYINT(1) DEFAULT 1,
  start_event ENUM('ON_SUBMIT','ON_ASSIGN') DEFAULT 'ON_SUBMIT',
  pause_statuses_json JSON NOT NULL,
  warning_threshold_pct INT NOT NULL DEFAULT 75,
  breach_threshold_hours INT NOT NULL DEFAULT 72
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS service_automation_rules (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  rule_code VARCHAR(32) NOT NULL UNIQUE,
  service_id VARCHAR(32) NOT NULL,
  name VARCHAR(150) NOT NULL,
  trigger_event VARCHAR(64) NOT NULL,
  condition_status VARCHAR(40) DEFAULT 'ANY',
  action_type VARCHAR(64) NOT NULL,
  action_param VARCHAR(120) NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  version_no INT NOT NULL DEFAULT 1,
  execution_count INT NOT NULL DEFAULT 0,
  last_run_at TIMESTAMP NULL,
  last_error TEXT NULL,
  INDEX idx_sar_srv (service_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. APPLICATIONS WORKFLOW, ASSIGNMENTS, DYNAMIC REFERENCES, PRIVATE DOCS, FOLLOW-UPS, NOTES
CREATE TABLE IF NOT EXISTS erp_applications (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  application_no VARCHAR(32) NOT NULL UNIQUE,
  financial_year VARCHAR(16) NOT NULL,
  customer_id VARCHAR(32) NOT NULL,
  customer_snapshot_json JSON NOT NULL,
  service_id VARCHAR(32) NOT NULL,
  service_snapshot_json JSON NOT NULL,
  form_data_json JSON NOT NULL,
  status ENUM('Draft','Submitted','Under Review','Processing','Pending Customer','Pending Office','Approved','Rejected','Completed','Cancelled','On Hold','Reopened') NOT NULL DEFAULT 'Submitted',
  assigned_staff_id VARCHAR(32) NULL,
  assigned_counter_code VARCHAR(20) NULL,
  submission_date TIMESTAMP NULL,
  expected_completion_date DATE NOT NULL,
  actual_completion_date TIMESTAMP NULL,
  sla_paused_minutes INT NOT NULL DEFAULT 0,
  mandatory_doc_exception_reason TEXT NULL,
  duplicate_override_reason TEXT NULL,
  archived_at TIMESTAMP NULL,
  archived_by VARCHAR(32) NULL,
  created_by VARCHAR(32) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_ea_cust (customer_id),
  INDEX idx_ea_srv (service_id),
  INDEX idx_ea_status (status),
  INDEX idx_ea_staff (assigned_staff_id),
  INDEX idx_ea_fy (financial_year)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS application_status_history (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  application_no VARCHAR(32) NOT NULL,
  previous_status VARCHAR(40) NULL,
  new_status VARCHAR(40) NOT NULL,
  changed_by VARCHAR(32) NOT NULL,
  changed_by_role VARCHAR(20) NOT NULL,
  remarks TEXT NULL,
  reason TEXT NOT NULL,
  changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ash_app (application_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS application_assignment_history (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  application_no VARCHAR(32) NOT NULL,
  previous_staff_id VARCHAR(32) NULL,
  new_staff_id VARCHAR(32) NULL,
  previous_counter_code VARCHAR(20) NULL,
  new_counter_code VARCHAR(20) NULL,
  assigned_by VARCHAR(32) NOT NULL,
  reason TEXT NOT NULL,
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_aah_app (application_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS reassignment_requests (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  request_code VARCHAR(32) NOT NULL UNIQUE,
  application_no VARCHAR(32) NOT NULL,
  requested_by VARCHAR(32) NOT NULL,
  current_staff_id VARCHAR(32) NULL,
  proposed_staff_id VARCHAR(32) NULL,
  proposed_counter_code VARCHAR(20) NULL,
  reason TEXT NOT NULL,
  status ENUM('Pending','Approved','Rejected') DEFAULT 'Pending',
  reviewed_by VARCHAR(32) NULL,
  review_notes TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TIMESTAMP NULL,
  INDEX idx_rr_app (application_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS reference_field_definitions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  field_key VARCHAR(64) NOT NULL UNIQUE,
  label VARCHAR(120) NOT NULL,
  input_type ENUM('text','number','date') DEFAULT 'text',
  service_id VARCHAR(32) DEFAULT 'ALL',
  is_required TINYINT(1) DEFAULT 0,
  unique_scope ENUM('NONE','GLOBAL','PER_SERVICE') DEFAULT 'NONE',
  enabled TINYINT(1) DEFAULT 1,
  created_by VARCHAR(32) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS application_reference_entries (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  application_no VARCHAR(32) NOT NULL,
  field_key VARCHAR(64) NOT NULL,
  ref_value VARCHAR(150) NOT NULL,
  added_by VARCHAR(32) NOT NULL,
  updated_by VARCHAR(32) NOT NULL,
  history_json JSON NULL,
  added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_app_ref_key (application_no, field_key),
  INDEX idx_are_val (ref_value)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS application_documents (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  file_uuid VARCHAR(64) NOT NULL UNIQUE,
  application_no VARCHAR(32) NOT NULL,
  customer_id VARCHAR(32) NOT NULL,
  doc_key VARCHAR(64) NOT NULL,
  category VARCHAR(80) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(80) NOT NULL,
  file_size_bytes BIGINT UNSIGNED NOT NULL,
  private_storage_path VARCHAR(255) NOT NULL,
  verification_status ENUM('Pending','Verified','Rejected') DEFAULT 'Pending',
  rejection_reason TEXT NULL,
  verified_by VARCHAR(32) NULL,
  verified_at TIMESTAMP NULL,
  version_no INT NOT NULL DEFAULT 1,
  replaced_file_uuid VARCHAR(64) NULL,
  uploaded_by VARCHAR(32) NOT NULL,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL,
  INDEX idx_ad_app (application_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS application_followups (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  application_no VARCHAR(32) NOT NULL,
  follow_up_date DATE NOT NULL,
  follow_up_time VARCHAR(16) DEFAULT '11:00',
  reason VARCHAR(255) NOT NULL,
  assigned_staff_id VARCHAR(32) NOT NULL,
  status ENUM('Pending','Completed','Rescheduled','Cancelled') DEFAULT 'Pending',
  next_follow_up_date DATE NULL,
  remarks TEXT NULL,
  created_by VARCHAR(32) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_af_app (application_no),
  INDEX idx_af_date (follow_up_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS application_notes (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  application_no VARCHAR(32) NOT NULL,
  note_type ENUM('INTERNAL','CUSTOMER_REMARK') NOT NULL,
  content TEXT NOT NULL,
  created_by VARCHAR(32) NOT NULL,
  edit_history_json JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_an_app (application_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. CUSTOMER DELIVERY HANDOVER, CANCELLATIONS, REFUNDS, NOTIFICATIONS & EXPORT AUDIT
CREATE TABLE IF NOT EXISTS application_deliveries (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  delivery_id VARCHAR(32) NOT NULL UNIQUE,
  application_no VARCHAR(32) NOT NULL UNIQUE,
  customer_id VARCHAR(32) NOT NULL,
  service_id VARCHAR(32) NOT NULL,
  deliverable_type VARCHAR(150) NOT NULL,
  delivery_method VARCHAR(80) NOT NULL,
  received_by VARCHAR(150) NOT NULL,
  handover_confirmed TINYINT(1) NOT NULL DEFAULT 0,
  acknowledgement_ref VARCHAR(80) NOT NULL,
  status ENUM('Not Ready','Ready for Delivery','Customer Notified','Delivered','Partially Delivered','Delivery Failed','Rescheduled') DEFAULT 'Delivered',
  delivered_by VARCHAR(32) NULL,
  remarks TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cancellation_requests (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  request_code VARCHAR(32) NOT NULL UNIQUE,
  application_no VARCHAR(32) NOT NULL,
  reason TEXT NOT NULL,
  requested_by VARCHAR(32) NOT NULL,
  status ENUM('Pending','Approved','Rejected') DEFAULT 'Pending',
  reviewed_by VARCHAR(32) NULL,
  review_remarks TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TIMESTAMP NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS erp_refunds (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  refund_id VARCHAR(32) NOT NULL UNIQUE,
  application_no VARCHAR(32) NOT NULL,
  customer_id VARCHAR(32) NOT NULL,
  original_transaction_id VARCHAR(64) NOT NULL,
  refund_type ENUM('Full','Partial','No Refund') NOT NULL,
  refund_amount DECIMAL(12,2) NOT NULL,
  refund_method ENUM('Cash','UPI','Bank Transfer') NOT NULL,
  refund_reason TEXT NOT NULL,
  status ENUM('Pending','Approved','Rejected','Processed') DEFAULT 'Pending',
  requested_by VARCHAR(32) NOT NULL,
  approved_by VARCHAR(32) NULL,
  processed_by VARCHAR(32) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMP NULL,
  INDEX idx_ref_app (application_no),
  INDEX idx_ref_txn (original_transaction_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS notification_dispatches (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  application_no VARCHAR(32) NULL,
  customer_id VARCHAR(32) NOT NULL,
  channel ENUM('DASHBOARD','SMS','EMAIL_SMTP','WHATSAPP') NOT NULL,
  event_key VARCHAR(64) NOT NULL,
  recipient VARCHAR(120) NOT NULL,
  message_preview TEXT NOT NULL,
  consent_granted TINYINT(1) NOT NULL DEFAULT 0,
  status ENUM('Delivered (Internal)','Pending Provider','Not Configured','Skipped (No Consent)','Failed') NOT NULL,
  status_reason TEXT NOT NULL,
  created_by VARCHAR(32) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS report_export_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  report_name VARCHAR(150) NOT NULL,
  export_format ENUM('PDF','Excel','CSV') NOT NULL,
  row_count INT NOT NULL DEFAULT 0,
  exported_by VARCHAR(32) NOT NULL,
  exported_role VARCHAR(20) NOT NULL,
  exported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Rollback Guidance (Manual Reverse Order):
-- DROP TABLE IF EXISTS report_export_logs, notification_dispatches, erp_refunds, cancellation_requests, application_deliveries, application_notes, application_followups, application_documents, application_reference_entries, reference_field_definitions, reassignment_requests, application_assignment_history, application_status_history, erp_applications, service_automation_rules, service_sla_configs, service_required_documents, service_form_versions, service_categories, customer_merge_logs, customer_contact_history, customer_consent_history, customer_consents;
