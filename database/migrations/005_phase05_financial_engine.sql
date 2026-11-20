-- ============================================================================
-- MUN COMPUTER BUSINESS MANAGER — Migration 005: Enterprise Financial Engine
-- Modules 01–94 Unified Accounting, Double-Entry GL, Multi-Entity, PNB CSP Isolation,
-- AR/AP, Banking/BRS, Payroll, Inventory FIFO/WAC & COGS, Fixed Assets, Tax/GST/TDS,
-- Loans/Investments/Equity, Franchises/Subscriptions, Approvals/Risk/Audit/Archive
-- ============================================================================

SET NAMES utf8mb4;
SET time_zone = '+05:30';

CREATE TABLE IF NOT EXISTS fin_entities (
  entity_code VARCHAR(32) PRIMARY KEY,
  entity_name VARCHAR(160) NOT NULL,
  entity_type ENUM('MAIN_BUSINESS','BRANCH','PNB_CSP_SEGREGATED','FRANCHISE_UNIT','SUBSIDIARY') NOT NULL,
  base_currency CHAR(3) NOT NULL DEFAULT 'INR',
  gstin VARCHAR(32) NULL,
  pan VARCHAR(20) NULL,
  is_isolated_csp TINYINT(1) NOT NULL DEFAULT 0,
  status ENUM('active','inactive') DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS fin_fiscal_years (
  fy_code VARCHAR(16) PRIMARY KEY,
  label VARCHAR(40) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status ENUM('Open','Closing_In_Progress','Closed','Locked') NOT NULL DEFAULT 'Open',
  locked_by VARCHAR(32) NULL,
  locked_at TIMESTAMP NULL,
  carry_forward_voucher_no VARCHAR(40) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS fin_fiscal_periods (
  period_code VARCHAR(16) PRIMARY KEY,
  fy_code VARCHAR(16) NOT NULL,
  month_label VARCHAR(20) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status ENUM('Open','Soft_Locked','Closed','Reopened') NOT NULL DEFAULT 'Open',
  lock_reason TEXT NULL,
  locked_by VARCHAR(32) NULL,
  locked_at TIMESTAMP NULL,
  INDEX idx_fp_fy (fy_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS fin_chart_of_accounts (
  account_code VARCHAR(24) PRIMARY KEY,
  account_name VARCHAR(150) NOT NULL,
  account_type ENUM('Asset','Liability','Equity','Income','COGS','Expense') NOT NULL,
  sub_type VARCHAR(80) NOT NULL,
  parent_code VARCHAR(24) NULL,
  normal_balance ENUM('Debit','Credit') NOT NULL,
  is_group TINYINT(1) NOT NULL DEFAULT 0,
  is_system_locked TINYINT(1) NOT NULL DEFAULT 0,
  entity_scope VARCHAR(32) DEFAULT 'ALL',
  gst_applicable TINYINT(1) DEFAULT 0,
  status ENUM('active','archived') DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS fin_journal_vouchers (
  voucher_no VARCHAR(40) PRIMARY KEY,
  idempotency_key VARCHAR(120) NULL UNIQUE,
  entity_code VARCHAR(32) NOT NULL,
  branch_code VARCHAR(24) NOT NULL DEFAULT 'BR-01',
  cost_center VARCHAR(40) NOT NULL DEFAULT 'GENERAL',
  fy_code VARCHAR(16) NOT NULL,
  period_code VARCHAR(16) NOT NULL,
  voucher_date DATE NOT NULL,
  voucher_type ENUM('Receipt','Payment','Journal','Contra','Sales','Purchase','Expense','Payroll','Depreciation','FX_Revaluation','Closing','Reversal','Opening') NOT NULL,
  reference_type VARCHAR(60) NULL,
  reference_id VARCHAR(64) NULL,
  narration TEXT NOT NULL,
  currency_code CHAR(3) NOT NULL DEFAULT 'INR',
  exchange_rate DECIMAL(14,6) NOT NULL DEFAULT 1.000000,
  total_debit DECIMAL(16,2) NOT NULL,
  total_credit DECIMAL(16,2) NOT NULL,
  status ENUM('Draft','Pending_Approval','Approved','Posted','Reversed','Cancelled') NOT NULL DEFAULT 'Posted',
  reversed_voucher_no VARCHAR(40) NULL,
  created_by VARCHAR(32) NOT NULL,
  approved_by VARCHAR(32) NULL,
  posted_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_jv_date (voucher_date),
  INDEX idx_jv_entity (entity_code),
  INDEX idx_jv_ref (reference_type, reference_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS fin_journal_lines (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  voucher_no VARCHAR(40) NOT NULL,
  line_no SMALLINT NOT NULL,
  account_code VARCHAR(24) NOT NULL,
  party_type ENUM('NONE','CUSTOMER','SUPPLIER','EMPLOYEE','BANK','FRANCHISE','PARTNER') DEFAULT 'NONE',
  party_id VARCHAR(48) NULL,
  cost_center VARCHAR(40) DEFAULT 'GENERAL',
  debit_amount DECIMAL(16,2) NOT NULL DEFAULT 0.00,
  credit_amount DECIMAL(16,2) NOT NULL DEFAULT 0.00,
  fx_amount DECIMAL(16,2) NULL,
  description VARCHAR(255) NULL,
  INDEX idx_jl_voucher (voucher_no),
  INDEX idx_jl_account (account_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS fin_pnb_csp_ledger (
  csp_txn_id VARCHAR(40) PRIMARY KEY,
  csp_counter_code VARCHAR(24) NOT NULL DEFAULT 'PNB-CSP-01',
  txn_date DATE NOT NULL,
  txn_type ENUM('Customer Deposit','Customer Withdrawal','AEPS Cash Out','Money Transfer (DMT)','Bank Settlement Transfer','CSP Commission Earned') NOT NULL,
  customer_ref VARCHAR(120) NOT NULL,
  principal_amount DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  commission_income DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  commission_posted_voucher VARCHAR(40) NULL,
  settlement_status ENUM('Pending','Settled','Reconciled') DEFAULT 'Settled',
  recorded_by VARCHAR(32) NOT NULL,
  remarks TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS fin_cash_counters (
  counter_code VARCHAR(24) PRIMARY KEY,
  counter_name VARCHAR(120) NOT NULL,
  entity_code VARCHAR(32) NOT NULL DEFAULT 'ENT-MAIN',
  custodian_user_id VARCHAR(32) NOT NULL,
  opening_balance DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  current_balance DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  is_csp_counter TINYINT(1) NOT NULL DEFAULT 0,
  status ENUM('Open','Closed','Locked') DEFAULT 'Open'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS fin_bank_accounts (
  bank_id VARCHAR(32) PRIMARY KEY,
  entity_code VARCHAR(32) NOT NULL DEFAULT 'ENT-MAIN',
  bank_name VARCHAR(120) NOT NULL,
  account_number_masked VARCHAR(32) NOT NULL,
  ifsc_code VARCHAR(20) NOT NULL,
  coa_account_code VARCHAR(24) NOT NULL,
  currency_code CHAR(3) DEFAULT 'INR',
  opening_balance DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  book_balance DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  statement_balance DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  is_csp_settlement TINYINT(1) DEFAULT 0,
  status ENUM('active','frozen','closed') DEFAULT 'active'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS fin_bank_statement_lines (
  line_id VARCHAR(40) PRIMARY KEY,
  bank_id VARCHAR(32) NOT NULL,
  txn_date DATE NOT NULL,
  utr_or_ref VARCHAR(80) NOT NULL,
  description VARCHAR(255) NOT NULL,
  debit_amount DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  credit_amount DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  match_status ENUM('Unmatched','Auto-Matched','Manually Reconciled','Disputed') DEFAULT 'Unmatched',
  matched_voucher_no VARCHAR(40) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS fin_suppliers (
  supplier_id VARCHAR(32) PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  gstin VARCHAR(24) NULL,
  pan VARCHAR(20) NULL,
  mobile VARCHAR(30) NOT NULL,
  credit_limit DECIMAL(14,2) NOT NULL DEFAULT 50000.00,
  risk_rating ENUM('Low','Medium','High') DEFAULT 'Low',
  payable_balance DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  status ENUM('active','blocked') DEFAULT 'active'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS fin_supplier_bills (
  bill_no VARCHAR(40) PRIMARY KEY,
  supplier_id VARCHAR(32) NOT NULL,
  bill_date DATE NOT NULL,
  due_date DATE NOT NULL,
  subtotal DECIMAL(14,2) NOT NULL,
  gst_amount DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  tds_deducted DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  net_payable DECIMAL(14,2) NOT NULL,
  paid_amount DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  voucher_no VARCHAR(40) NULL,
  status ENUM('Draft','Approved','Partially Paid','Paid','Overdue') DEFAULT 'Approved'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS fin_employees_payroll (
  emp_id VARCHAR(32) PRIMARY KEY,
  user_id VARCHAR(32) NULL,
  full_name VARCHAR(140) NOT NULL,
  designation VARCHAR(100) NOT NULL,
  department VARCHAR(80) NOT NULL,
  basic_salary DECIMAL(12,2) NOT NULL,
  hra DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  allowances DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  pf_deduction DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  tds_deduction DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  advance_balance DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  status ENUM('Active','On Leave','Inactive') DEFAULT 'Active'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS fin_products_inventory (
  sku VARCHAR(40) PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  category VARCHAR(80) NOT NULL,
  hsn_sac VARCHAR(20) NOT NULL,
  gst_rate_pct DECIMAL(5,2) NOT NULL DEFAULT 18.00,
  valuation_method ENUM('FIFO','WAC') NOT NULL DEFAULT 'FIFO',
  selling_price DECIMAL(12,2) NOT NULL,
  qty_on_hand INT NOT NULL DEFAULT 0,
  reorder_level INT NOT NULL DEFAULT 5,
  total_inventory_value DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  status ENUM('active','discontinued') DEFAULT 'active'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS fin_fixed_assets (
  asset_code VARCHAR(32) PRIMARY KEY,
  asset_name VARCHAR(150) NOT NULL,
  category VARCHAR(80) NOT NULL,
  purchase_date DATE NOT NULL,
  cost_amount DECIMAL(14,2) NOT NULL,
  salvage_value DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  useful_life_years INT NOT NULL DEFAULT 5,
  depreciation_method ENUM('SLM','WDV') NOT NULL DEFAULT 'SLM',
  rate_pct DECIMAL(5,2) NOT NULL DEFAULT 20.00,
  accumulated_depreciation DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  nbv DECIMAL(14,2) NOT NULL,
  status ENUM('Active','Disposed','Written Off') DEFAULT 'Active'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS fin_loans_investments_equity (
  instrument_id VARCHAR(32) PRIMARY KEY,
  instrument_kind ENUM('LOAN','INVESTMENT_FD','INVESTMENT_RD','EQUITY_CAPITAL','EQUITY_DRAWING','FRANCHISE_UNIT','SUBSCRIPTION') NOT NULL,
  title VARCHAR(160) NOT NULL,
  counterparty_or_partner VARCHAR(140) NOT NULL,
  principal_amount DECIMAL(16,2) NOT NULL,
  interest_or_rate_pct DECIMAL(6,2) NOT NULL DEFAULT 0.00,
  outstanding_or_current DECIMAL(16,2) NOT NULL,
  maturity_or_next_date DATE NULL,
  status ENUM('Active','Matured','Closed','Overdue') DEFAULT 'Active'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS fin_governance_audit_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  module_no SMALLINT NOT NULL,
  category VARCHAR(60) NOT NULL,
  severity ENUM('INFO','WARNING','HIGH','CRITICAL') DEFAULT 'INFO',
  summary TEXT NOT NULL,
  actor_user_id VARCHAR(32) NOT NULL,
  status ENUM('Open','Acknowledged','Resolved','Archived') DEFAULT 'Open',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
