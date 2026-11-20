-- ============================================================================
-- MUN COMPUTER — Production Clean Baseline Seed Data
-- Demo customer, service transaction, and dummy records purged for production
-- ============================================================================
USE `mun_computer_db`;

INSERT INTO `roles` (`name`, `slug`, `description`, `status`) VALUES
  ('Administrator', 'admin', 'Full system access across all MUN COMPUTER modules', 'active'),
  ('Service Operator', 'operator', 'Manages customers, applications, and counter collections', 'active'),
  ('Accountant', 'accountant', 'Manages cashbook, income, expenses, and financial reports', 'active')
ON DUPLICATE KEY UPDATE `description` = VALUES(`description`);

INSERT INTO `settings` (`updated_by`, `setting_key`, `setting_value`, `setting_group`, `status`) VALUES
  (1, 'company_name', 'MUN COMPUTER', 'branding', 'active'),
  (1, 'app_version', '1.0.0', 'system', 'locked'),
  (1, 'currency_code', 'INR', 'finance', 'active')
ON DUPLICATE KEY UPDATE `setting_value` = VALUES(`setting_value`);

