import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BadgeIndianRupee,
  BarChart3,
  Bell,
  Building2,
  CheckSquare,
  DatabaseBackup,
  FileCode2,
  FileUp,
  Globe,
  History,
  KeyRound,
  LayoutGrid,
  Palette,
  Printer,
  QrCode,
  Search,
  Settings2,
  Shield,
  Store,
  UserCheck,
  Wallet,
  Wrench,
} from 'lucide-react';
import {
  ApiIntegrationItem,
  BackupRecord,
  CompanyProfileSettings,
  DailyCashClosingRecord,
  GlobalConfiguration,
  HistoricalTransactionSnapshot,
  LanguageCode,
  MasterSettingsOverview,
  PageKey,
  ServiceRateItem,
  SettingsHistoryEntry,
  SettingsProposalItem,
  ThemeMode,
  UploadedDocumentItem,
  UserProfile,
} from '../../modules/types';
import { securityRequest } from '../../services/securityApi';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Button } from '../../components/Button';
import { useLanguage } from '../../i18n/translations';
import {
  BranchCountersPanel,
  CompanyProfilePanel,
  DailyCashPanel,
  GlobalLocalizationPanel,
  ServiceRatesPanel,
} from './BusinessSettingsPanels';
import {
  CustomerPrivacyPanel,
  DashboardAndReportsConfigPanel,
  NotificationSettingsPanel,
  PaymentQrPanel,
  PrintAndTemplatesPanel,
} from './TemplatesAndFinancePanels';
import {
  BackupRestorePanel,
  DocumentsPanel,
  IntegrationsPanel,
  MaintenancePanel,
  SecuritySettingsPanel,
  SettingsHistoryPanel,
  SettingsProposalsPanel,
} from './GovernanceSecurityPanels';

export type MasterSettingsSectionKey =
  | 'company-profile'
  | 'service-rates'
  | 'localization'
  | 'global-config'
  | 'notifications'
  | 'print-settings'
  | 'document-templates'
  | 'payment-qr'
  | 'security-settings'
  | 'approval-management'
  | 'permission-matrix'
  | 'backup-restore'
  | 'branches-counters'
  | 'daily-cash'
  | 'customer-privacy'
  | 'document-uploads'
  | 'api-integrations'
  | 'dashboard-config'
  | 'reports-config'
  | 'appearance'
  | 'maintenance'
  | 'settings-history';

type CategoryFilter =
  | 'All'
  | 'Business & Rates'
  | 'Templates & Finance'
  | 'Governance & Security'
  | 'System & History';

interface SectionMeta {
  id: MasterSettingsSectionKey;
  label: string;
  category: Exclude<CategoryFilter, 'All'>;
  managerAllowed: boolean;
  icon: React.ComponentType<{ className?: string }>;
}

const SECTIONS: SectionMeta[] = [
  { id: 'company-profile', label: 'Company Profile', category: 'Business & Rates', managerAllowed: false, icon: Building2 },
  { id: 'service-rates', label: 'Service Rate Management', category: 'Business & Rates', managerAllowed: true, icon: BadgeIndianRupee },
  { id: 'localization', label: 'Language & Localization', category: 'Business & Rates', managerAllowed: true, icon: Globe },
  { id: 'global-config', label: 'Global Configuration & FY', category: 'Business & Rates', managerAllowed: false, icon: Settings2 },
  { id: 'branches-counters', label: 'Branch & Counter Settings', category: 'Business & Rates', managerAllowed: true, icon: Store },
  { id: 'daily-cash', label: 'Daily Cash Management', category: 'Templates & Finance', managerAllowed: true, icon: Wallet },
  { id: 'notifications', label: 'Notification Settings', category: 'Templates & Finance', managerAllowed: true, icon: Bell },
  { id: 'print-settings', label: 'Print Settings (A4)', category: 'Templates & Finance', managerAllowed: true, icon: Printer },
  { id: 'document-templates', label: 'Document Templates', category: 'Templates & Finance', managerAllowed: false, icon: FileCode2 },
  { id: 'payment-qr', label: 'Payment & QR Settings', category: 'Templates & Finance', managerAllowed: false, icon: QrCode },
  { id: 'customer-privacy', label: 'Customer & Privacy Policy', category: 'Templates & Finance', managerAllowed: false, icon: UserCheck },
  { id: 'document-uploads', label: 'Document Upload Controls', category: 'Templates & Finance', managerAllowed: true, icon: FileUp },
  { id: 'security-settings', label: 'Security Settings', category: 'Governance & Security', managerAllowed: false, icon: Shield },
  { id: 'approval-management', label: 'Approval Management', category: 'Governance & Security', managerAllowed: true, icon: CheckSquare },
  { id: 'permission-matrix', label: 'Role & Permission Control', category: 'Governance & Security', managerAllowed: false, icon: KeyRound },
  { id: 'backup-restore', label: 'Backup & Restore', category: 'Governance & Security', managerAllowed: false, icon: DatabaseBackup },
  { id: 'api-integrations', label: 'API Integrations', category: 'System & History', managerAllowed: false, icon: Activity },
  { id: 'dashboard-config', label: 'Dashboard Configuration', category: 'System & History', managerAllowed: false, icon: LayoutGrid },
  { id: 'reports-config', label: 'Reports & Export Settings', category: 'System & History', managerAllowed: false, icon: BarChart3 },
  { id: 'appearance', label: 'Appearance Settings', category: 'System & History', managerAllowed: true, icon: Palette },
  { id: 'maintenance', label: 'Maintenance Settings', category: 'System & History', managerAllowed: false, icon: Wrench },
  { id: 'settings-history', label: 'Settings History', category: 'System & History', managerAllowed: false, icon: History },
];

interface MasterSettingsHubProps {
  currentUser: UserProfile;
  theme: ThemeMode;
  onChangeTheme: (theme: ThemeMode) => void;
  onChangeLanguage: (lang: LanguageCode) => void;
  onNavigate: (page: PageKey) => void;
  onOverviewUpdated: (overview: MasterSettingsOverview) => void;
  onShowToast: (type: 'success' | 'error' | 'info', title: string, description?: string) => void;
}

export const MasterSettingsHub: React.FC<MasterSettingsHubProps> = ({
  currentUser,
  theme,
  onChangeTheme,
  onChangeLanguage,
  onNavigate,
  onOverviewUpdated,
  onShowToast,
}) => {
  const { t } = useLanguage();
  const isAdmin = currentUser.role === 'ADMIN';
  const isStaff = currentUser.role === 'STAFF';

  const [activeSection, setActiveSection] = useState<MasterSettingsSectionKey>(
    isAdmin ? 'company-profile' : 'service-rates'
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('All');
  const [loading, setLoading] = useState(true);

  const [overview, setOverview] = useState<MasterSettingsOverview | null>(null);
  const [serviceRates, setServiceRates] = useState<ServiceRateItem[]>([]);
  const [rateSnapshots, setRateSnapshots] = useState<HistoricalTransactionSnapshot[]>([]);
  const [proposals, setProposals] = useState<SettingsProposalItem[]>([]);
  const [history, setHistory] = useState<SettingsHistoryEntry[]>([]);
  const [backups, setBackups] = useState<BackupRecord[]>([]);
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);
  const [nextBackupNote, setNextBackupNote] = useState('');
  const [dailyCash, setDailyCash] = useState<DailyCashClosingRecord[]>([]);
  const [integrations, setIntegrations] = useState<ApiIntegrationItem[]>([]);
  const [documents, setDocuments] = useState<UploadedDocumentItem[]>([]);

  // Confirmation Dialog States
  const [pendingCompanySave, setPendingCompanySave] = useState<{
    draft: CompanyProfileSettings;
    reason: string;
  } | null>(null);
  const [pendingGlobalSave, setPendingGlobalSave] = useState<GlobalConfiguration | null>(null);
  const [pendingRestoreCode, setPendingRestoreCode] = useState<string | null>(null);
  const [pendingDeleteDocUuid, setPendingDeleteDocUuid] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [ovRes, ratesRes, cashRes, docsRes] = await Promise.all([
        securityRequest<MasterSettingsOverview>('/api/master-settings/overview'),
        securityRequest<{ rates: ServiceRateItem[]; completedSnapshots: HistoricalTransactionSnapshot[] }>('/api/service-rates'),
        securityRequest<DailyCashClosingRecord[]>('/api/daily-cash'),
        securityRequest<UploadedDocumentItem[]>('/api/documents'),
      ]);

      setOverview(ovRes.data);
      onOverviewUpdated(ovRes.data);
      setServiceRates(ratesRes.data.rates);
      setRateSnapshots(ratesRes.data.completedSnapshots);
      setDailyCash(cashRes.data);
      setDocuments(docsRes.data);

      if (!isStaff) {
        const propRes = await securityRequest<SettingsProposalItem[]>('/api/settings-proposals');
        setProposals(propRes.data);
      }

      if (isAdmin) {
        const [histRes, bakRes, intRes] = await Promise.all([
          securityRequest<SettingsHistoryEntry[]>('/api/master-settings/history'),
          securityRequest<{ backups: BackupRecord[]; lastSuccessfulBackup: string | null; nextScheduledBackup: string }>('/api/backups'),
          securityRequest<ApiIntegrationItem[]>('/api/integrations'),
        ]);
        setHistory(histRes.data);
        setBackups(bakRes.data.backups);
        setLastBackupAt(bakRes.data.lastSuccessfulBackup);
        setNextBackupNote(bakRes.data.nextScheduledBackup);
        setIntegrations(intRes.data);
      }
    } catch (err) {
      onShowToast('error', 'Failed to load Master Settings', err instanceof Error ? err.message : undefined);
    } finally {
      setLoading(false);
    }
  }, [isAdmin, isStaff, onOverviewUpdated, onShowToast]);

  useEffect(() => {
    if (!isStaff) {
      loadAll();
    } else {
      setLoading(false);
    }
  }, [isStaff, loadAll]);

  const visibleSections = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return SECTIONS.filter((s) => {
      if (!isAdmin && !s.managerAllowed) return false;
      const matchesCat = categoryFilter === 'All' || s.category === categoryFilter;
      const matchesQ = !q || s.label.toLowerCase().includes(q) || s.category.toLowerCase().includes(q);
      return matchesCat && matchesQ;
    });
  }, [isAdmin, searchQuery, categoryFilter]);

  if (isStaff) {
    return (
      <div className="max-w-lg bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-6">
        <h2 className="text-base font-semibold text-neutral-950 dark:text-white">Access Restricted</h2>
        <p className="mt-1.5 text-sm text-neutral-600 dark:text-neutral-300">
          Master Settings and Global Configuration are restricted to Admin (and permitted proposals for Manager). Staff accounts cannot access Master Settings.
        </p>
        <div className="mt-4">
          <Button variant="outline" size="sm" onClick={() => onNavigate('dashboard')}>
            Return to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  const handleConfirmCompanySave = async () => {
    if (!pendingCompanySave) return;
    try {
      await securityRequest('/api/master-settings/company-profile', {
        method: 'PUT',
        body: JSON.stringify({
          ...pendingCompanySave.draft,
          changeReason: pendingCompanySave.reason,
        }),
      });
      onShowToast('success', 'Company Profile Saved', 'Updated company branding and official address.');
      setPendingCompanySave(null);
      loadAll();
    } catch (err) {
      onShowToast('error', 'Save Failed', err instanceof Error ? err.message : undefined);
      setPendingCompanySave(null);
    }
  };

  const handleConfirmGlobalSave = async () => {
    if (!pendingGlobalSave) return;
    try {
      await securityRequest('/api/master-settings/global-config', {
        method: 'PUT',
        body: JSON.stringify({
          ...pendingGlobalSave,
          changeReason: 'Admin global prefix/language update',
        }),
      });
      onShowToast('success', 'Global Config Saved', 'FY prefixes and default localization updated.');
      setPendingGlobalSave(null);
      loadAll();
    } catch (err) {
      onShowToast('error', 'Save Failed', err instanceof Error ? err.message : undefined);
      setPendingGlobalSave(null);
    }
  };

  const handleConfirmRestore = async () => {
    if (!pendingRestoreCode) return;
    try {
      await securityRequest(`/api/backups/${pendingRestoreCode}/restore`, { method: 'POST', body: '{}' });
      onShowToast('success', 'Backup Restored', `${pendingRestoreCode} verified via SHA-256 and restored.`);
      setPendingRestoreCode(null);
      loadAll();
    } catch (err) {
      onShowToast('error', 'Restore Failed', err instanceof Error ? err.message : undefined);
      setPendingRestoreCode(null);
    }
  };

  const handleConfirmDeleteDoc = async () => {
    if (!pendingDeleteDocUuid) return;
    try {
      await securityRequest(`/api/documents/${pendingDeleteDocUuid}`, { method: 'DELETE' });
      onShowToast('success', 'Document Deleted', 'Removed from private document registry.');
      setPendingDeleteDocUuid(null);
      loadAll();
    } catch (err) {
      onShowToast('error', 'Delete Failed', err instanceof Error ? err.message : undefined);
      setPendingDeleteDocUuid(null);
    }
  };

  const renderSection = () => {
    if (loading || !overview) {
      return (
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-8 text-xs text-neutral-500">
          Loading Master Settings configuration...
        </div>
      );
    }

    switch (activeSection) {
      case 'company-profile':
        return (
          <CompanyProfilePanel
            initial={overview.companyProfile}
            isAdmin={isAdmin}
            onRequestSave={(draft, reason) => setPendingCompanySave({ draft, reason })}
          />
        );
      case 'service-rates':
        return (
          <ServiceRatesPanel
            rates={serviceRates}
            snapshots={rateSnapshots}
            isAdmin={isAdmin}
            onRefresh={loadAll}
            onShowToast={onShowToast}
          />
        );
      case 'localization':
      case 'global-config':
        return (
          <GlobalLocalizationPanel
            mode={activeSection === 'localization' ? 'localization' : 'global'}
            globalConfig={overview.globalConfig}
            userLanguage={overview.userLanguage}
            documentCounters={overview.documentCounters}
            isAdmin={isAdmin}
            onChangeLanguage={onChangeLanguage}
            onSaveGlobal={(cfg) => setPendingGlobalSave(cfg)}
            onRefresh={loadAll}
            onShowToast={onShowToast}
          />
        );
      case 'branches-counters':
        return (
          <BranchCountersPanel
            branches={overview.branches}
            counters={overview.counters}
            isAdmin={isAdmin}
            onRefresh={loadAll}
            onShowToast={onShowToast}
          />
        );
      case 'daily-cash':
        return (
          <DailyCashPanel
            closings={dailyCash}
            counters={overview.counters}
            currentUser={currentUser}
            onRefresh={loadAll}
            onShowToast={onShowToast}
          />
        );
      case 'notifications':
        return (
          <NotificationSettingsPanel
            templates={overview.notificationTemplates}
            isAdmin={isAdmin}
            onRefresh={loadAll}
            onShowToast={onShowToast}
          />
        );
      case 'print-settings':
      case 'document-templates':
        return (
          <PrintAndTemplatesPanel
            mode={activeSection === 'print-settings' ? 'print' : 'templates'}
            printSettings={overview.printSettings}
            templates={overview.documentTemplates}
            company={overview.companyProfile}
            paymentQr={overview.paymentQrSettings}
            nextReceiptSample={
              overview.documentCounters.find((c) => c.docType === 'RECEIPT')?.nextPreview ??
              'MCR-2026-27-000001'
            }
            nextInvoiceSample={
              overview.documentCounters.find((c) => c.docType === 'INVOICE')?.nextPreview ??
              'MCI-2026-27-000001'
            }
            isAdmin={isAdmin}
            onRefresh={loadAll}
            onShowToast={onShowToast}
          />
        );
      case 'payment-qr':
        return (
          <PaymentQrPanel
            initial={overview.paymentQrSettings}
            isAdmin={isAdmin}
            onRefresh={loadAll}
            onShowToast={onShowToast}
          />
        );
      case 'customer-privacy':
        return (
          <CustomerPrivacyPanel
            initial={overview.customerPrivacy}
            isAdmin={isAdmin}
            onRefresh={loadAll}
            onShowToast={onShowToast}
          />
        );
      case 'document-uploads':
        return (
          <DocumentsPanel
            documents={documents}
            isAdmin={isAdmin}
            onRequestDeleteDoc={(uuid) => setPendingDeleteDocUuid(uuid)}
            onRefresh={loadAll}
            onShowToast={onShowToast}
          />
        );
      case 'security-settings':
        return (
          <SecuritySettingsPanel
            policy={overview.securityPolicy}
            currentUserEmail={currentUser.email}
            currentUserId={currentUser.userId}
            currentUserRole={currentUser.role}
            onShowToast={onShowToast}
          />
        );
      case 'approval-management':
        return (
          <SettingsProposalsPanel
            proposals={proposals}
            isAdmin={isAdmin}
            onRefresh={loadAll}
            onShowToast={onShowToast}
          />
        );
      case 'permission-matrix':
        return (
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-6 space-y-3">
            <h3 className="text-sm font-semibold text-neutral-950 dark:text-white">
              Role-Based &amp; Individual Permission Matrix
            </h3>
            <p className="text-xs text-neutral-600 dark:text-neutral-300">
              Manage 21 Phase 01–03 operational, financial, and governance modules across ADMIN, MANAGER, and STAFF with per-user overrides.
            </p>
            <Button variant="primary" size="sm" onClick={() => onNavigate('permissions')} icon={<KeyRound className="h-3.5 w-3.5" />}>
              Open Full Permission Matrix
            </Button>
          </div>
        );
      case 'backup-restore':
        return (
          <BackupRestorePanel
            backups={backups}
            lastSuccessfulBackup={lastBackupAt}
            nextScheduledBackup={nextBackupNote}
            onRequestRestore={(code) => setPendingRestoreCode(code)}
            onRefresh={loadAll}
            onShowToast={onShowToast}
          />
        );
      case 'api-integrations':
        return (
          <IntegrationsPanel
            integrations={integrations}
            onRefresh={loadAll}
            onShowToast={onShowToast}
          />
        );
      case 'dashboard-config':
      case 'reports-config':
      case 'appearance':
        return (
          <DashboardAndReportsConfigPanel
            mode={
              activeSection === 'dashboard-config'
                ? 'dashboard'
                : activeSection === 'reports-config'
                  ? 'reports'
                  : 'appearance'
            }
            dashboardPref={overview.dashboardPreferences}
            reportSettings={overview.reportSettings}
            theme={theme}
            isAdmin={isAdmin}
            onChangeTheme={onChangeTheme}
            onNavigate={onNavigate}
            onRefresh={loadAll}
            onShowToast={onShowToast}
          />
        );
      case 'maintenance':
        return (
          <MaintenancePanel
            initial={overview.maintenanceSettings}
            onRefresh={loadAll}
            onShowToast={onShowToast}
          />
        );
      case 'settings-history':
        return <SettingsHistoryPanel history={history} />;
    }
  };

  return (
    <div className="space-y-5">
      {/* Header + Search + Category Filter */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-950 dark:text-white">
            {t.masterSettingsTitle}
          </h2>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            {t.masterSettingsSubtitle}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Search className="h-3.5 w-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t.searchSettingsPlaceholder}
              className="w-full h-9 pl-8 pr-3 text-xs bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-md focus:outline-none focus:border-blue-800"
            />
          </div>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as CategoryFilter)}
            className="h-9 px-3 text-xs bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-md"
          >
            <option value="All">All Categories</option>
            <option value="Business & Rates">Business &amp; Rates</option>
            <option value="Templates & Finance">Templates &amp; Finance</option>
            <option value="Governance & Security">Governance &amp; Security</option>
            <option value="System & History">System &amp; History</option>
          </select>
        </div>
      </div>

      {!isAdmin && (
        <div className="px-4 py-3 bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg text-xs text-neutral-700 dark:text-neutral-300">
          {t.managerProposalBanner}
        </div>
      )}

      {/* Split Layout: Vertical Section Nav + Active Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <aside className="lg:col-span-3 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-2 space-y-0.5">
          {visibleSections.map((sec) => {
            const Icon = sec.icon;
            const active = activeSection === sec.id;
            return (
              <button
                key={sec.id}
                type="button"
                onClick={() => setActiveSection(sec.id)}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md text-xs transition-colors cursor-pointer text-left ${
                  active
                    ? 'bg-neutral-950 text-white dark:bg-white dark:text-neutral-950 font-medium'
                    : 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                }`}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{sec.label}</span>
                </span>
                {sec.id === 'approval-management' && (overview?.pendingProposalsCount ?? 0) > 0 && (
                  <span className="font-mono text-[11px] font-bold tabular-nums">
                    {overview?.pendingProposalsCount}
                  </span>
                )}
              </button>
            );
          })}
        </aside>

        <div className="lg:col-span-9 min-w-0">{renderSection()}</div>
      </div>

      {/* Confirmation Dialogs */}
      <ConfirmDialog
        isOpen={Boolean(pendingCompanySave)}
        onClose={() => setPendingCompanySave(null)}
        onConfirm={handleConfirmCompanySave}
        title="Confirm Company Profile Update?"
        description="Updated company details, logo, signature, and stamp will apply to all newly generated A4 receipts and invoices."
        confirmLabel="Save Company Profile"
        variant="primary"
      />
      <ConfirmDialog
        isOpen={Boolean(pendingGlobalSave)}
        onClose={() => setPendingGlobalSave(null)}
        onConfirm={handleConfirmGlobalSave}
        title="Confirm Global Configuration Update?"
        description="Updating Financial Year prefixes affects newly allocated receipt, invoice, and application serial numbers."
        confirmLabel="Save Global Config"
        variant="primary"
      />
      <ConfirmDialog
        isOpen={Boolean(pendingRestoreCode)}
        onClose={() => setPendingRestoreCode(null)}
        onConfirm={handleConfirmRestore}
        title={`Verify SHA-256 & Restore ${pendingRestoreCode ?? ''}?`}
        description="The server will verify the SHA-256 checksum, decrypt the AES-256-GCM bundle, and restore the saved configuration snapshot."
        confirmLabel="Restore Snapshot"
        variant="danger"
      />
      <ConfirmDialog
        isOpen={Boolean(pendingDeleteDocUuid)}
        onClose={() => setPendingDeleteDocUuid(null)}
        onConfirm={handleConfirmDeleteDoc}
        title="Delete Stored Document?"
        description="This Admin-only action deletes the document from private server storage and appends an entry to Audit Logs."
        confirmLabel="Delete Document"
        variant="danger"
      />
    </div>
  );
};
