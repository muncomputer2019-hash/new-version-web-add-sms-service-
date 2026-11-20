-- ============================================================================
-- MUN COMPUTER — Phase 02 Security & RBAC Seed Data
-- ============================================================================
USE `mun_computer_db`;

INSERT INTO `roles` (`name`, `slug`, `description`, `status`)
VALUES
  ('Admin', 'ADMIN', 'Full system control across users, approvals, security logs, and global settings.', 'active'),
  ('Manager', 'MANAGER', 'Department and assigned staff management with controlled approval submission.', 'active'),
  ('Staff', 'STAFF', 'Restricted operational access for assigned tasks and authorized customer applications.', 'active')
ON DUPLICATE KEY UPDATE `description` = VALUES(`description`);

INSERT INTO `permissions` (`module`, `action`, `slug`, `description`, `status`)
VALUES
  ('dashboard', 'VIEW', 'dashboard.view', 'View operations dashboard', 'active'),
  ('customers', 'VIEW', 'customers.view', 'View customer records', 'active'),
  ('customers', 'ADD', 'customers.add', 'Create customer records', 'active'),
  ('customers', 'EDIT', 'customers.edit', 'Modify customer records', 'active'),
  ('applications', 'VIEW', 'applications.view', 'View applications queue', 'active'),
  ('applications', 'ADD', 'applications.add', 'Create service applications', 'active'),
  ('applications', 'EDIT', 'applications.edit', 'Update assigned application status', 'active'),
  ('applications', 'APPROVE', 'applications.approve', 'Approve service applications', 'active'),
  ('transactions', 'FINANCIAL', 'transactions.financial', 'Access financial collections and ledgers', 'active'),
  ('reports', 'EXPORT', 'reports.export', 'Export operational reports', 'active'),
  ('reports', 'PRINT', 'reports.print', 'Print official vouchers and reports', 'active'),
  ('users', 'VIEW', 'users.view', 'View user directory', 'active'),
  ('users', 'ADD', 'users.add', 'Register or create users', 'active'),
  ('users', 'EDIT', 'users.edit', 'Edit user profiles and status', 'active'),
  ('users', 'DELETE', 'users.delete', 'Deactivate or remove users', 'active'),
  ('approvals', 'APPROVE', 'approvals.approve', 'Approve or reject registration requests', 'active'),
  ('security', 'VIEW', 'security.view', 'View security logs and audit trails', 'active')
ON DUPLICATE KEY UPDATE `description` = VALUES(`description`);

INSERT INTO `user_id_sequences` (`role_code`, `sequence_year`, `fixed_code`, `last_serial`, `status`)
VALUES
  ('AD', 2026, '13', 1, 'active'),
  ('MN', 2026, '13', 2, 'active'),
  ('ST', 2026, '13', 3, 'active')
ON DUPLICATE KEY UPDATE `last_serial` = VALUES(`last_serial`);
