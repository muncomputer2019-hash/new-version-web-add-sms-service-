<?php
declare(strict_types=1);

/**
 * MUN COMPUTER — API Route Registry (Phase 01 + Phase 02 Security & RBAC)
 */

return [
    // Phase 02 Authentication & OTP
    'POST /api/auth/login' => ['AuthController', 'login', 'public'],
    'POST /api/auth/logout' => ['AuthController', 'logout', 'auth'],
    'POST /api/auth/verify-otp' => ['AuthController', 'verifyOtp', 'public'],
    'POST /api/auth/forgot-password' => ['AuthController', 'forgotPassword', 'public'],
    'POST /api/auth/reset-password' => ['AuthController', 'resetPassword', 'public'],
    'GET  /api/auth/captcha' => ['AuthController', 'captcha', 'public'],
    'GET  /api/auth/me' => ['AuthController', 'me', 'auth'],

    // Phase 02 User Management
    'GET  /api/users' => ['UserController', 'index', 'auth:users.view'],
    'POST /api/users' => ['UserController', 'store', 'auth:users.add'],
    'GET  /api/users/{id}' => ['UserController', 'show', 'auth:users.view'],
    'PUT  /api/users/{id}' => ['UserController', 'update', 'auth:users.edit'],
    'PATCH /api/users/{id}/status' => ['UserController', 'updateStatus', 'auth:users.edit'],

    // Phase 02 Registration & Approval Workflow
    'GET  /api/registration-requests' => ['RegistrationController', 'index', 'auth:approvals.approve'],
    'POST /api/registration-requests' => ['RegistrationController', 'store', 'public_or_auth'],
    'POST /api/registration-requests/{id}/approve' => ['RegistrationController', 'approve', 'auth:approvals.approve'],
    'POST /api/registration-requests/{id}/reject' => ['RegistrationController', 'reject', 'auth:approvals.approve'],

    // Phase 02 Roles & Permission Matrix
    'GET  /api/roles' => ['RoleController', 'index', 'auth:users.view'],
    'GET  /api/permissions' => ['PermissionController', 'index', 'auth:users.view'],
    'PUT  /api/users/{id}/permissions' => ['PermissionController', 'updateUserPermissions', 'auth:ADMIN'],

    // Phase 02 Security, Audit & Session Management
    'GET  /api/security-logs' => ['SecurityLogController', 'index', 'auth:security.view'],
    'GET  /api/audit-logs' => ['AuditLogController', 'index', 'auth:security.view'],
    'GET  /api/sessions' => ['SessionController', 'index', 'auth'],
    'DELETE /api/sessions/{id}' => ['SessionController', 'revoke', 'auth'],

    // Phase 01 Dashboard & Search
    'GET  /api/v1/dashboard/summary' => ['DashboardController', 'summary', 'auth:dashboard.view'],
    'GET  /api/v1/dashboard/recent' => ['DashboardController', 'recentApplications', 'auth:applications.view'],
    'GET  /api/v1/search' => ['SearchController', 'handle', 'auth'],

    // Phase 03 Master Settings & Global Configuration
    'GET  /api/master-settings/overview' => ['MasterSettingsController', 'overview', 'auth'],
    'PUT  /api/master-settings/user-language' => ['MasterSettingsController', 'updateUserLanguage', 'auth'],
    'PUT  /api/master-settings/company-profile' => ['MasterSettingsController', 'updateCompanyProfile', 'auth:ADMIN'],
    'PUT  /api/master-settings/global-config' => ['MasterSettingsController', 'updateGlobalConfig', 'auth:ADMIN'],
    'PUT  /api/master-settings/notifications' => ['MasterSettingsController', 'updateNotifications', 'auth:ADMIN'],
    'PUT  /api/master-settings/print-settings' => ['MasterSettingsController', 'updatePrintSettings', 'auth:ADMIN'],
    'PUT  /api/master-settings/document-templates' => ['MasterSettingsController', 'updateDocumentTemplate', 'auth:ADMIN'],
    'PUT  /api/master-settings/payment-qr' => ['MasterSettingsController', 'updatePaymentQr', 'auth:ADMIN'],
    'PUT  /api/master-settings/customer-privacy' => ['MasterSettingsController', 'updateCustomerPrivacy', 'auth:ADMIN'],
    'PUT  /api/master-settings/dashboard-preferences' => ['MasterSettingsController', 'updateDashboardPreferences', 'auth:ADMIN'],
    'PUT  /api/master-settings/reports' => ['MasterSettingsController', 'updateReports', 'auth:ADMIN'],
    'PUT  /api/master-settings/appearance' => ['MasterSettingsController', 'updateAppearance', 'auth'],
    'PUT  /api/master-settings/maintenance' => ['MasterSettingsController', 'updateMaintenance', 'auth:ADMIN'],
    'GET  /api/master-settings/history' => ['MasterSettingsController', 'history', 'auth:ADMIN'],
    'GET  /api/service-rates' => ['ServiceRateController', 'index', 'auth'],
    'POST /api/service-rates' => ['ServiceRateController', 'store', 'auth:ADMIN'],
    'POST /api/document-sequences/next' => ['DocumentSequenceController', 'allocateNext', 'auth'],
    'GET  /api/settings-proposals' => ['SettingsProposalController', 'index', 'auth'],
    'POST /api/settings-proposals' => ['SettingsProposalController', 'store', 'auth'],
    'POST /api/settings-proposals/{id}/approve' => ['SettingsProposalController', 'approve', 'auth:ADMIN'],
    'POST /api/settings-proposals/{id}/reject' => ['SettingsProposalController', 'reject', 'auth:ADMIN'],
    'GET  /api/backups' => ['BackupController', 'index', 'auth:ADMIN'],
    'POST /api/backups' => ['BackupController', 'create', 'auth:ADMIN'],
    'GET  /api/backups/{code}/download' => ['BackupController', 'download', 'auth:ADMIN'],
    'POST /api/backups/{code}/restore' => ['BackupController', 'restore', 'auth:ADMIN'],
    'POST /api/counters' => ['CounterController', 'store', 'auth:ADMIN'],
    'GET  /api/daily-cash' => ['DailyCashController', 'index', 'auth'],
    'POST /api/daily-cash' => ['DailyCashController', 'store', 'auth'],
    'POST /api/daily-cash/{code}/approve' => ['DailyCashController', 'approve', 'auth:ADMIN'],
    'GET  /api/integrations' => ['IntegrationController', 'index', 'auth:ADMIN'],
    'PUT  /api/integrations/{channel}' => ['IntegrationController', 'update', 'auth:ADMIN'],
    'POST /api/integrations/{channel}/test' => ['IntegrationController', 'test', 'auth:ADMIN'],
    'GET  /api/documents' => ['DocumentController', 'index', 'auth'],
    'POST /api/documents/validate-upload' => ['DocumentController', 'validateUpload', 'auth'],
    'DELETE /api/documents/{uuid}' => ['DocumentController', 'destroy', 'auth:ADMIN'],

    // Enterprise ERP Q1-51 Routes (Customers CRM, Services/Forms, Workflow, Handover & Finance)
    'GET  /api/erp/customers' => ['ErpCustomerController', 'index', 'auth:customers.view'],
    'POST /api/erp/customers' => ['ErpCustomerController', 'store', 'auth:customers.add'],
    'GET  /api/erp/customers/{customerId}' => ['ErpCustomerController', 'show', 'auth:customers.view'],
    'PUT  /api/erp/customers/{customerId}' => ['ErpCustomerController', 'update', 'auth:customers.edit'],
    'POST /api/erp/customers/{customerId}/verify-mobile' => ['ErpCustomerController', 'verifyMobile', 'auth:customers.edit'],
    'PUT  /api/erp/customers/{customerId}/consents' => ['ErpCustomerController', 'updateConsents', 'auth:customers.edit'],
    'POST /api/erp/customers/merge' => ['ErpCustomerController', 'merge', 'auth:ADMIN'],
    'POST /api/erp/customers/bulk-import' => ['ErpCustomerController', 'bulkImport', 'auth:customers.add'],
    'GET  /api/erp/services' => ['ErpServiceController', 'index', 'auth:services.view'],
    'POST /api/erp/services' => ['ErpServiceController', 'store', 'auth:ADMIN'],
    'PUT  /api/erp/services/{serviceId}' => ['ErpServiceController', 'update', 'auth:ADMIN'],
    'POST /api/erp/services/{serviceId}/form-versions' => ['ErpServiceController', 'publishFormVersion', 'auth:ADMIN'],
    'GET  /api/erp/applications' => ['ErpApplicationController', 'index', 'auth:applications.view'],
    'POST /api/erp/applications' => ['ErpApplicationController', 'store', 'auth:applications.add'],
    'POST /api/erp/applications/{appNo}/status' => ['ErpApplicationController', 'transitionStatus', 'auth:applications.edit'],
    'POST /api/erp/applications/{appNo}/assign' => ['ErpApplicationController', 'assign', 'auth:applications.edit'],
    'POST /api/erp/applications/{appNo}/reassignment-requests' => ['ErpApplicationController', 'requestReassignment', 'auth:applications.edit'],
    'POST /api/erp/reassignment-requests/{code}/review' => ['ErpApplicationController', 'reviewReassignment', 'auth:applications.approve'],
    'POST /api/erp/applications/{appNo}/references' => ['ErpApplicationController', 'upsertReference', 'auth:applications.edit'],
    'POST /api/erp/applications/{appNo}/documents' => ['ErpApplicationController', 'uploadDocument', 'auth:documents.add'],
    'GET  /api/erp/documents/{uuid}/download' => ['ErpApplicationController', 'downloadDocument', 'auth:documents.view'],
    'POST /api/erp/documents/{uuid}/verify' => ['ErpApplicationController', 'verifyDocument', 'auth:applications.approve'],
    'POST /api/erp/applications/{appNo}/delivery' => ['ErpApplicationController', 'recordDelivery', 'auth:applications.edit'],
    'POST /api/erp/applications/{appNo}/cancellation-requests' => ['ErpApplicationController', 'requestCancellation', 'auth:applications.edit'],
    'POST /api/erp/payments' => ['ErpFinanceController', 'recordPayment', 'auth:receipts.add'],
    'POST /api/erp/refunds' => ['ErpFinanceController', 'createRefund', 'auth:transactions.financial'],
    'GET  /api/erp/reports/summary' => ['ErpReportController', 'summary', 'auth:reports.view'],
    'POST /api/erp/reports/export-log' => ['ErpReportController', 'logExport', 'auth:reports.export'],
];
