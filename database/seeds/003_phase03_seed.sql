-- ============================================================================
-- MUN COMPUTER — Phase 03 Master Settings Seed Data
-- ============================================================================
USE `mun_computer_db`;

INSERT INTO `branches` (`branch_code`, `name`, `address`, `pin_code`, `phone`, `is_default`, `status`)
VALUES ('BR-01', 'Single Branch – MUN COMPUTER', 'Village Mamudpur (Chowmatha More), Post Office Juginda, Police Station Domkal, District Murshidabad, West Bengal, India', '742406', '+91 8101352105', 1, 'active')
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`);

INSERT INTO `counters` (`branch_id`, `counter_code`, `name`, `status`)
VALUES
  (1, 'CTR-01', 'Counter 01 – Front Desk & Applications', 'active'),
  (1, 'CTR-02', 'Counter 02 – Hardware & Technical Desk', 'active')
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`);

INSERT INTO `company_settings` (
  `branch_id`, `company_name`, `address_line`, `post_office`, `police_station`, `district`, `state_name`, `country_name`, `pin_code`, `mobile`, `whatsapp`, `email`
) VALUES (
  1, 'MUN COMPUTER', 'Village Mamudpur (Chowmatha More)', 'Juginda', 'Domkal', 'Murshidabad', 'West Bengal', 'India', '742406', '+91 8101352105', '+91 8101352105', 'MUNCOMPUTER2019@GMAIL.COM'
);

INSERT INTO `global_settings` (
  `financial_year_start_month`, `financial_year_end_month`, `timezone`, `default_language`, `date_format`, `currency_code`, `currency_symbol`, `receipt_prefix`, `invoice_prefix`, `application_prefix`
) VALUES (4, 3, 'Asia/Kolkata', 'en', 'DD/MM/YYYY', 'INR', '₹', 'MCR', 'MCI', 'MCA');

INSERT INTO `document_sequences` (`doc_type`, `prefix`, `financial_year`, `last_serial`, `status`)
VALUES
  ('RECEIPT', 'MCR', '2026-27', 0, 'active'),
  ('INVOICE', 'MCI', '2026-27', 0, 'active'),
  ('APPLICATION', 'MCA', '2026-27', 0, 'active')
ON DUPLICATE KEY UPDATE `prefix` = VALUES(`prefix`);
