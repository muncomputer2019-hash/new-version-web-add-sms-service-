import React from 'react';
import { Server, Database, CheckCircle2 } from 'lucide-react';
import { BRAND } from '../assets/brand';
import { API_CONFIG } from '../services/apiClient';
import { Button } from '../components/Button';

interface SettingsPageProps {
  onShowToast: (type: 'success' | 'error' | 'info', title: string, description?: string) => void;
}

const SCHEMA_TABLES = [
  'users',
  'roles',
  'permissions',
  'user_sessions',
  'customers',
  'services',
  'applications',
  'transactions',
  'cashbook',
  'expenses',
  'income',
  'employees',
  'products',
  'inventory',
  'audit_logs',
  'settings',
  'notifications',
  'company_settings',
  'service_rates',
  'service_rate_history',
  'global_settings',
  'document_sequences',
  'notification_settings',
  'print_settings',
  'document_templates',
  'payment_settings',
  'security_settings',
  'approval_requests',
  'approval_history',
  'settings_history',
  'backup_logs',
  'counters',
  'daily_cash_closings',
  'daily_cash_corrections',
  'document_uploads',
  'api_integrations',
  'user_dashboard_preferences',
  'maintenance_logs',
  'customer_consents',
  'customer_consent_history',
  'customer_contact_history',
  'customer_merge_logs',
  'service_categories',
  'service_form_versions',
  'service_required_documents',
  'service_sla_configs',
  'service_automation_rules',
  'erp_applications',
  'application_status_history',
  'application_assignment_history',
  'reassignment_requests',
  'reference_field_definitions',
  'application_reference_entries',
  'application_documents',
  'application_followups',
  'application_notes',
  'application_deliveries',
  'cancellation_requests',
  'erp_refunds',
  'notification_dispatches',
  'report_export_logs',
];

export const SettingsPage: React.FC<SettingsPageProps> = ({
  onShowToast,
}) => {

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h2 className="text-xl font-bold text-neutral-950 dark:text-white">
          System Architecture &amp; Schema Blueprint
        </h2>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
          Company branding, PHP/MySQL API configuration, and Phase 01–03 schema verification
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Company & Branding */}
        <section className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5 space-y-4">
          <h3 className="text-sm font-semibold text-neutral-950 dark:text-white">
            Application Identity
          </h3>
          <dl className="divide-y divide-neutral-100 dark:divide-neutral-800 text-sm">
            <div className="py-2.5 flex items-center justify-between">
              <dt className="text-neutral-500 dark:text-neutral-400">Company Name</dt>
              <dd className="font-medium text-neutral-950 dark:text-white">{BRAND.name}</dd>
            </div>
            <div className="py-2.5 flex items-center justify-between">
              <dt className="text-neutral-500 dark:text-neutral-400">Version</dt>
              <dd className="font-mono text-xs text-neutral-950 dark:text-neutral-100">{BRAND.version}</dd>
            </div>
            <div className="py-2.5 flex items-center justify-between">
              <dt className="text-neutral-500 dark:text-neutral-400">Release Phase</dt>
              <dd className="text-neutral-950 dark:text-neutral-100">{BRAND.phase}</dd>
            </div>
            <div className="py-2.5 flex items-center justify-between">
              <dt className="text-neutral-500 dark:text-neutral-400">Copyright</dt>
              <dd className="text-neutral-700 dark:text-neutral-300">{BRAND.copyright}</dd>
            </div>
          </dl>
        </section>

        {/* Backend API Connection Readiness */}
        <section className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Server className="h-4 w-4 text-blue-800 dark:text-blue-400" />
            <h3 className="text-sm font-semibold text-neutral-950 dark:text-white">
              PHP / MySQL API Configuration
            </h3>
          </div>
          <dl className="divide-y divide-neutral-100 dark:divide-neutral-800 text-sm">
            <div className="py-2.5 flex items-center justify-between gap-4">
              <dt className="text-neutral-500 dark:text-neutral-400">Base URL</dt>
              <dd className="font-mono text-xs text-neutral-950 dark:text-neutral-100 truncate">
                {API_CONFIG.baseUrl}
              </dd>
            </div>
            <div className="py-2.5 flex items-center justify-between">
              <dt className="text-neutral-500 dark:text-neutral-400">Request Timeout</dt>
              <dd className="font-mono text-xs text-neutral-950 dark:text-neutral-100 tabular-nums">
                {API_CONFIG.timeoutMs} ms
              </dd>
            </div>
            <div className="py-2.5 flex items-center justify-between">
              <dt className="text-neutral-500 dark:text-neutral-400">Runtime Mode</dt>
              <dd className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                Express Security &amp; Master Settings API
              </dd>
            </div>
            <div className="py-2.5 flex items-center justify-between">
              <dt className="text-neutral-500 dark:text-neutral-400">Response Envelope</dt>
              <dd className="font-mono text-xs text-neutral-700 dark:text-neutral-300">
                JSON · Standard v1
              </dd>
            </div>
          </dl>
        </section>
      </div>

      {/* Database Schema Blueprint */}
      <section className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-neutral-800 dark:text-neutral-200" />
            <h3 className="text-sm font-semibold text-neutral-950 dark:text-white">
              MySQL Database Schema Architecture ({SCHEMA_TABLES.length} Tables Documented)
            </h3>
          </div>
          <span className="text-xs text-neutral-500 dark:text-neutral-400 font-mono">
            database/schema + migrations/003
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
          {SCHEMA_TABLES.map((tbl) => (
            <div
              key={tbl}
              className="px-3 py-2 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded text-xs font-mono text-neutral-800 dark:text-neutral-200 flex items-center gap-1.5"
            >
              <CheckCircle2 className="h-3 w-3 text-emerald-700 dark:text-emerald-400 shrink-0" />
              <span className="truncate">{tbl}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Interactive Demo Controls */}
      <section className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-neutral-950 dark:text-white">
            Demo Session Controls
          </h3>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
            Reset temporary operational changes or preview notification states.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              onShowToast('success', 'Success Notification', 'Operation completed cleanly.')
            }
          >
            Test Success Toast
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              onShowToast('error', 'Error Notification', 'Simulated API validation error.')
            }
          >
            Test Error Toast
          </Button>
        </div>
      </section>
    </div>
  );
};
