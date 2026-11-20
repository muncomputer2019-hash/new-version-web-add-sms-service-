import React, { useState } from 'react';
import { BarChart3, CheckCircle2, Eye, Moon, Save, Sun, Upload } from 'lucide-react';
import {
  CompanyProfileSettings,
  CustomerPrivacyConfig,
  DashboardPreferenceConfig,
  DocumentTemplateItem,
  NotificationTemplateItem,
  PageKey,
  PaymentQrSettings,
  PrintSettingsConfig,
  ReportSettingsConfig,
  ThemeMode,
} from '../../modules/types';
import { Button } from '../../components/Button';
import { PrintPreviewModal } from './PrintPreviewModal';
import { securityRequest } from '../../services/securityApi';

const inputCls =
  'w-full h-9 px-3 text-xs bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded-md text-neutral-950 dark:text-neutral-100 focus:outline-none focus:border-blue-800';
const labelCls = 'block text-xs font-medium text-neutral-800 dark:text-neutral-200 mb-1';
const cardCls =
  'bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5 space-y-4';

/* ---------------- 1. Notification Settings Panel ---------------- */
export const NotificationSettingsPanel: React.FC<{
  templates: NotificationTemplateItem[];
  isAdmin: boolean;
  onRefresh: () => void;
  onShowToast: (type: 'success' | 'error' | 'info', title: string, description?: string) => void;
}> = ({ templates, isAdmin, onRefresh, onShowToast }) => {
  const [draft, setDraft] = useState<NotificationTemplateItem[]>(templates);
  const [saving, setSaving] = useState(false);

  const toggleChannel = (
    idx: number,
    key: 'smsEnabled' | 'emailEnabled' | 'whatsappEnabled' | 'dashboardEnabled'
  ) => {
    setDraft((prev) => prev.map((t, i) => (i === idx ? { ...t, [key]: !t[key] } : t)));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await securityRequest('/api/master-settings/notifications', {
        method: 'PUT',
        body: JSON.stringify({ templates: draft }),
      });
      onShowToast('success', 'Notification Templates Saved', `${draft.length} event templates updated.`);
      onRefresh();
    } catch (err) {
      onShowToast('error', 'Save Failed', err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={cardCls}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-neutral-100 dark:border-neutral-800 pb-3">
        <div>
          <h3 className="text-sm font-semibold text-neutral-950 dark:text-white">
            Notification Channels &amp; 7 Event Templates
          </h3>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Internal dashboard alerts run locally. External SMS/Email/WhatsApp require valid credentials in API Integrations.
          </p>
        </div>
        {isAdmin && (
          <Button variant="primary" size="sm" loading={saving} onClick={handleSave} icon={<Save className="h-3.5 w-3.5" />}>
            Save Templates
          </Button>
        )}
      </div>

      <div className="space-y-4">
        {draft.map((item, idx) => (
          <div key={item.eventKey} className="p-3.5 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-md space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-semibold text-neutral-950 dark:text-white">
                {item.eventLabel} <span className="font-mono text-[11px] text-neutral-400">({item.eventKey})</span>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs">
                {(
                  [
                    { key: 'dashboardEnabled', label: 'Dashboard' },
                    { key: 'smsEnabled', label: 'SMS' },
                    { key: 'emailEnabled', label: 'Email' },
                    { key: 'whatsappEnabled', label: 'WhatsApp' },
                  ] as const
                ).map((ch) => (
                  <label key={ch.key} className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={!isAdmin}
                      checked={item[ch.key]}
                      onChange={() => toggleChannel(idx, ch.key)}
                    />
                    <span>{ch.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <input
                disabled={!isAdmin}
                value={item.subject}
                onChange={(e) =>
                  setDraft((prev) => prev.map((t, i) => (i === idx ? { ...t, subject: e.target.value } : t)))
                }
                placeholder="Subject"
                className={inputCls}
              />
              <input
                disabled={!isAdmin}
                value={item.body}
                onChange={(e) =>
                  setDraft((prev) => prev.map((t, i) => (i === idx ? { ...t, body: e.target.value } : t)))
                }
                placeholder="Template message"
                className={`${inputCls} md:col-span-2`}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ---------------- 2. Print Settings & Document Templates Panel ---------------- */
export const PrintAndTemplatesPanel: React.FC<{
  mode: 'print' | 'templates';
  printSettings: PrintSettingsConfig;
  templates: DocumentTemplateItem[];
  company: CompanyProfileSettings;
  paymentQr: PaymentQrSettings;
  nextReceiptSample: string;
  nextInvoiceSample: string;
  isAdmin: boolean;
  onRefresh: () => void;
  onShowToast: (type: 'success' | 'error' | 'info', title: string, description?: string) => void;
}> = ({
  mode,
  printSettings,
  templates,
  company,
  paymentQr,
  nextReceiptSample,
  nextInvoiceSample,
  isAdmin,
  onRefresh,
  onShowToast,
}) => {
  const [pDraft, setPDraft] = useState<PrintSettingsConfig>(printSettings);
  const [activeDocType, setActiveDocType] = useState<'RECEIPT' | 'INVOICE'>('RECEIPT');
  const currentTpl = templates.find((t) => t.docType === activeDocType) ?? templates[0];
  const [variant, setVariant] = useState(currentTpl.designVariant);
  const [terms, setTerms] = useState(currentTpl.termsAndConditions);
  const [disclaimer, setDisclaimer] = useState(currentTpl.disclaimer);
  const [showQr, setShowQr] = useState(currentTpl.showQr);
  const [previewOpen, setPreviewOpen] = useState(false);

  const handleSelectDocType = (dt: 'RECEIPT' | 'INVOICE') => {
    setActiveDocType(dt);
    const found = templates.find((t) => t.docType === dt);
    if (found) {
      setVariant(found.designVariant);
      setTerms(found.termsAndConditions);
      setDisclaimer(found.disclaimer);
      setShowQr(found.showQr);
    }
  };

  const handleSavePrint = async () => {
    try {
      await securityRequest('/api/master-settings/print-settings', {
        method: 'PUT',
        body: JSON.stringify(pDraft),
      });
      onShowToast('success', 'Print Settings Saved', `Paper A4 · Default Copies: ${pDraft.defaultCopies}`);
      onRefresh();
    } catch (err) {
      onShowToast('error', 'Save Failed', err instanceof Error ? err.message : undefined);
    }
  };

  const handleSaveTemplate = async () => {
    try {
      await securityRequest('/api/master-settings/document-templates', {
        method: 'PUT',
        body: JSON.stringify({
          docType: activeDocType,
          designVariant: variant,
          termsAndConditions: terms,
          disclaimer,
          showQr,
        }),
      });
      onShowToast('success', 'Template Snapshot Saved', `${activeDocType} template updated.`);
      onRefresh();
    } catch (err) {
      onShowToast('error', 'Save Failed', err instanceof Error ? err.message : undefined);
    }
  };

  return (
    <div className="space-y-5">
      {mode === 'print' && (
        <div className={cardCls}>
          <div className="flex items-center justify-between border-b border-neutral-100 dark:border-neutral-800 pb-3">
            <div>
              <h3 className="text-sm font-semibold text-neutral-950 dark:text-white">
                Print Settings (A4 · Print Preview then Print)
              </h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Configure headers, digital signature, company stamp, and default copy count.
              </p>
            </div>
            {isAdmin && (
              <Button variant="primary" size="sm" onClick={handleSavePrint} icon={<Save className="h-3.5 w-3.5" />}>
                Save Print Settings
              </Button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div>
              <label className={labelCls}>Paper Size</label>
              <input readOnly value={pDraft.paperSize} className={`${inputCls} font-mono`} />
            </div>
            <div>
              <label className={labelCls}>Print Workflow</label>
              <input readOnly value={pDraft.printMode} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Default Copies</label>
              <input
                type="number"
                min="1"
                max="10"
                disabled={!isAdmin}
                value={pDraft.defaultCopies}
                onChange={(e) => setPDraft({ ...pDraft, defaultCopies: Number(e.target.value) || 1 })}
                className={`${inputCls} font-mono`}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-4 text-xs pt-1">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                disabled={!isAdmin}
                checked={pDraft.includeLogo}
                onChange={(e) => setPDraft({ ...pDraft, includeLogo: e.target.checked })}
              />
              <span>Include Company Logo</span>
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                disabled={!isAdmin}
                checked={pDraft.includeDigitalSignature}
                onChange={(e) => setPDraft({ ...pDraft, includeDigitalSignature: e.target.checked })}
              />
              <span>Include Digital Signature</span>
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                disabled={!isAdmin}
                checked={pDraft.includeCompanyStamp}
                onChange={(e) => setPDraft({ ...pDraft, includeCompanyStamp: e.target.checked })}
              />
              <span>Include Company Stamp</span>
            </label>
          </div>
        </div>
      )}

      <div className={cardCls}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-100 dark:border-neutral-800 pb-3">
          <div className="flex items-center gap-2">
            {(['RECEIPT', 'INVOICE'] as const).map((dt) => (
              <button
                key={dt}
                type="button"
                onClick={() => handleSelectDocType(dt)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                  activeDocType === dt
                    ? 'bg-neutral-950 text-white dark:bg-white dark:text-neutral-950'
                    : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300'
                }`}
              >
                {dt} Template
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setPreviewOpen(true)} icon={<Eye className="h-3.5 w-3.5" />}>
              Print / PDF Preview
            </Button>
            {isAdmin && (
              <Button variant="primary" size="sm" onClick={handleSaveTemplate} icon={<Save className="h-3.5 w-3.5" />}>
                Save Template v{currentTpl.versionNo + 1}
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Template Design Layout</label>
            <select
              disabled={!isAdmin}
              value={variant}
              onChange={(e) => setVariant(e.target.value as 'Simple Professional' | 'Detailed Professional')}
              className={inputCls}
            >
              <option value="Simple Professional">Simple Professional</option>
              <option value="Detailed Professional">Detailed Professional</option>
            </select>
          </div>
          <div className="flex items-end pb-2">
            <label className="inline-flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                disabled={!isAdmin}
                checked={showQr}
                onChange={(e) => setShowQr(e.target.checked)}
              />
              <span>Show Payment QR on {activeDocType}</span>
            </label>
          </div>
          <div>
            <label className={labelCls}>Terms &amp; Conditions</label>
            <textarea
              rows={3}
              disabled={!isAdmin}
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
              className="w-full p-2.5 text-xs bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded-md"
            />
          </div>
          <div>
            <label className={labelCls}>Footer Disclaimer</label>
            <textarea
              rows={3}
              disabled={!isAdmin}
              value={disclaimer}
              onChange={(e) => setDisclaimer(e.target.value)}
              className="w-full p-2.5 text-xs bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded-md"
            />
          </div>
        </div>

        <div className="text-xs border-t border-neutral-100 dark:border-neutral-800 pt-3">
          <div className="font-semibold text-neutral-900 dark:text-white mb-1">
            Template Version Snapshots (Current: v{currentTpl.versionNo})
          </div>
          <div className="space-y-1 text-[11px] text-neutral-500">
            {currentTpl.snapshots.slice(0, 4).map((snap) => (
              <div key={snap.versionNo} className="font-mono">
                v{snap.versionNo} · {snap.designVariant} · Saved {snap.savedAt.slice(0, 10)}
              </div>
            ))}
          </div>
        </div>
      </div>

      <PrintPreviewModal
        isOpen={previewOpen}
        onClose={() => setPreviewOpen(false)}
        company={company}
        template={{
          ...currentTpl,
          designVariant: variant,
          termsAndConditions: terms,
          disclaimer,
          showQr,
        }}
        printSettings={pDraft}
        paymentQr={paymentQr}
        sampleNumber={activeDocType === 'RECEIPT' ? nextReceiptSample : nextInvoiceSample}
      />
    </div>
  );
};

/* ---------------- 3. Payment & QR Settings Panel ---------------- */
export const PaymentQrPanel: React.FC<{
  initial: PaymentQrSettings;
  isAdmin: boolean;
  onRefresh: () => void;
  onShowToast: (type: 'success' | 'error' | 'info', title: string, description?: string) => void;
}> = ({ initial, isAdmin, onRefresh, onShowToast }) => {
  const [form, setForm] = useState<PaymentQrSettings>(initial);

  const handleQrUpload = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setForm((prev) => ({ ...prev, staticQrPreviewUrl: reader.result as string }));
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    try {
      await securityRequest('/api/master-settings/payment-qr', {
        method: 'PUT',
        body: JSON.stringify(form),
      });
      onShowToast('success', 'Payment & QR Saved', 'Counter payment acceptance rules updated.');
      onRefresh();
    } catch (err) {
      onShowToast('error', 'Save Failed', err instanceof Error ? err.message : undefined);
    }
  };

  return (
    <div className={cardCls}>
      <div className="flex items-center justify-between border-b border-neutral-100 dark:border-neutral-800 pb-3">
        <div>
          <h3 className="text-sm font-semibold text-neutral-950 dark:text-white">
            Payment Methods &amp; UPI QR Settings
          </h3>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Static UPI QR is supported immediately. Dynamic QR requires live Payment Gateway API credentials.
          </p>
        </div>
        {isAdmin && (
          <Button variant="primary" size="sm" onClick={handleSave} icon={<Save className="h-3.5 w-3.5" />}>
            Save Payment Settings
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-4 text-xs">
        <label className="inline-flex items-center gap-2 cursor-pointer">
          <input type="checkbox" disabled={!isAdmin} checked={form.cashEnabled} onChange={(e) => setForm({ ...form, cashEnabled: e.target.checked })} />
          <span>Cash Payment</span>
        </label>
        <label className="inline-flex items-center gap-2 cursor-pointer">
          <input type="checkbox" disabled={!isAdmin} checked={form.upiEnabled} onChange={(e) => setForm({ ...form, upiEnabled: e.target.checked })} />
          <span>UPI Payment</span>
        </label>
        <label className="inline-flex items-center gap-2 cursor-pointer">
          <input type="checkbox" disabled={!isAdmin} checked={form.otherEnabled} onChange={(e) => setForm({ ...form, otherEnabled: e.target.checked })} />
          <span>Other (Bank / Card)</span>
        </label>
        <label className="inline-flex items-center gap-2 cursor-pointer">
          <input type="checkbox" disabled={!isAdmin} checked={form.manualVerificationRequired} onChange={(e) => setForm({ ...form, manualVerificationRequired: e.target.checked })} />
          <span>Manual UPI Verification Required</span>
        </label>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className={labelCls}>QR Mode</label>
          <select
            disabled={!isAdmin}
            value={form.qrType}
            onChange={(e) => setForm({ ...form, qrType: e.target.value as 'Static QR' | 'Dynamic QR' })}
            className={inputCls}
          >
            <option value="Static QR">Static QR (Ready)</option>
            <option value="Dynamic QR">Dynamic QR (Gateway API Required)</option>
          </select>
          {form.qrType === 'Dynamic QR' && !form.dynamicQrProviderConfigured && (
            <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">
              Dynamic QR gateway is not connected. Falling back to Static QR until configured.
            </p>
          )}
        </div>
        <div>
          <label className={labelCls}>Merchant UPI VPA</label>
          <input
            disabled={!isAdmin}
            value={form.upiId}
            onChange={(e) => setForm({ ...form, upiId: e.target.value })}
            placeholder="muncomputer@upi"
            className={`${inputCls} font-mono`}
          />
        </div>
        <div>
          <label className={labelCls}>Static QR Image</label>
          <div className="flex items-center gap-3">
            {isAdmin && (
              <label className="h-9 px-3 inline-flex items-center gap-1.5 border border-neutral-200 dark:border-neutral-700 rounded-md text-xs cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800">
                <Upload className="h-3.5 w-3.5" />
                <span>Upload QR</span>
                <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => handleQrUpload(e.target.files?.[0])} />
              </label>
            )}
            {form.staticQrPreviewUrl && (
              <img src={form.staticQrPreviewUrl} alt="Static QR Preview" className="h-10 w-10 object-contain border rounded" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

/* ---------------- 4. Customer & Privacy + Dashboard + Reports + Appearance Panels ---------------- */
export const CustomerPrivacyPanel: React.FC<{
  initial: CustomerPrivacyConfig;
  isAdmin: boolean;
  onRefresh: () => void;
  onShowToast: (type: 'success' | 'error' | 'info', title: string, description?: string) => void;
}> = ({ initial, isAdmin, onRefresh, onShowToast }) => {
  const [form, setForm] = useState<CustomerPrivacyConfig>(initial);

  const handleSave = async () => {
    try {
      await securityRequest('/api/master-settings/customer-privacy', {
        method: 'PUT',
        body: JSON.stringify(form),
      });
      onShowToast('success', 'Privacy Policy Saved', 'Customer duplicate checks and Aadhaar masking saved.');
      onRefresh();
    } catch (err) {
      onShowToast('error', 'Save Failed', err instanceof Error ? err.message : undefined);
    }
  };

  return (
    <div className={cardCls}>
      <div className="flex items-center justify-between border-b border-neutral-100 dark:border-neutral-800 pb-3">
        <div>
          <h3 className="text-sm font-semibold text-neutral-950 dark:text-white">
            Customer Settings &amp; Data Protection
          </h3>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Duplicate Mobile/Aadhaar guards, mandatory consent, Aadhaar masking, and Admin-only export controls.
          </p>
        </div>
        {isAdmin && (
          <Button variant="primary" size="sm" onClick={handleSave} icon={<Save className="h-3.5 w-3.5" />}>
            Save Privacy Policy
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
        {[
          { key: 'duplicateCheckMobile', label: 'Duplicate Check: Mobile Number' },
          { key: 'duplicateCheckAadhaar', label: 'Duplicate Check: Aadhaar Hash' },
          { key: 'consentMandatory', label: 'Mandatory Customer Consent' },
          { key: 'maskAadhaarByDefault', label: 'Mask Aadhaar by Default (XXXX-XXXX-1234)' },
          { key: 'dataExportAdminOnly', label: 'Data Export Strictly Admin-Only' },
        ].map((item) => (
          <label
            key={item.key}
            className="flex items-center gap-2 p-2.5 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded cursor-pointer"
          >
            <input
              type="checkbox"
              disabled={!isAdmin}
              checked={Boolean(form[item.key as keyof CustomerPrivacyConfig])}
              onChange={(e) => setForm({ ...form, [item.key]: e.target.checked })}
            />
            <span>{item.label}</span>
          </label>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Data Retention Policy</label>
          <input
            disabled={!isAdmin}
            value={form.retentionPolicy}
            onChange={(e) => setForm({ ...form, retentionPolicy: e.target.value })}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Editable Customer Declaration / Terms</label>
          <input
            disabled={!isAdmin}
            value={form.termsEditableByAdmin}
            onChange={(e) => setForm({ ...form, termsEditableByAdmin: e.target.value })}
            className={inputCls}
          />
        </div>
      </div>
    </div>
  );
};

export const DashboardAndReportsConfigPanel: React.FC<{
  mode: 'dashboard' | 'reports' | 'appearance';
  dashboardPref: DashboardPreferenceConfig;
  reportSettings: { defaultExportFormat: 'PDF' | 'Excel' | 'CSV'; autoDailyReportEnabled: boolean; autoReportTime: string };
  theme: ThemeMode;
  isAdmin: boolean;
  onChangeTheme: (theme: ThemeMode) => void;
  onNavigate: (page: PageKey) => void;
  onRefresh: () => void;
  onShowToast: (type: 'success' | 'error' | 'info', title: string, description?: string) => void;
}> = ({
  mode,
  dashboardPref,
  reportSettings,
  theme,
  isAdmin,
  onChangeTheme,
  onNavigate,
  onRefresh,
  onShowToast,
}) => {
  const [roleTarget, setRoleTarget] = useState<'ADMIN' | 'MANAGER' | 'STAFF'>(dashboardPref.role);
  const [period, setPeriod] = useState<'Today' | 'This Week' | 'This Month'>(dashboardPref.defaultPeriod);
  const [widgets, setWidgets] = useState<string[]>(dashboardPref.enabledWidgets);
  const [rForm, setRForm] = useState<ReportSettingsConfig>(reportSettings);

  const ALL_WIDGETS = [
    'Total Customers',
    'Total Applications',
    'Today Collection',
    'Pending Payments',
    'Total Expenses',
    'Today Profit',
    'Recent Activities',
    'Pending Approvals',
    'Service-wise Reports',
    'Monthly Collection',
  ];

  const handleSaveDashboard = async () => {
    try {
      await securityRequest('/api/master-settings/dashboard-preferences', {
        method: 'PUT',
        body: JSON.stringify({ role: roleTarget, defaultPeriod: period, enabledWidgets: widgets }),
      });
      onShowToast('success', 'Dashboard Config Saved', `${roleTarget} widgets updated.`);
      onRefresh();
    } catch (err) {
      onShowToast('error', 'Save Failed', err instanceof Error ? err.message : undefined);
    }
  };

  const handleSaveReports = async () => {
    try {
      await securityRequest('/api/master-settings/reports', {
        method: 'PUT',
        body: JSON.stringify(rForm),
      });
      onShowToast('success', 'Report Config Saved', `Default format: ${rForm.defaultExportFormat}`);
      onRefresh();
    } catch (err) {
      onShowToast('error', 'Save Failed', err instanceof Error ? err.message : undefined);
    }
  };

  if (mode === 'appearance') {
    return (
      <div className={cardCls}>
        <h3 className="text-sm font-semibold text-neutral-950 dark:text-white">
          Appearance Settings (Black &amp; White · Light / Dark Mode)
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg">
          <button
            type="button"
            onClick={() => onChangeTheme('light')}
            className={`p-4 rounded-lg border text-left cursor-pointer transition-colors ${
              theme === 'light'
                ? 'border-neutral-950 bg-neutral-50 text-neutral-950'
                : 'border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 text-neutral-600 dark:text-neutral-300'
            }`}
          >
            <div className="flex items-center justify-between font-semibold text-xs">
              <span className="inline-flex items-center gap-2"><Sun className="h-4 w-4" /> Light Mode (Pure White)</span>
              {theme === 'light' && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
            </div>
            <p className="text-[11px] mt-1 opacity-80">Crisp white canvas with black typography.</p>
          </button>

          <button
            type="button"
            onClick={() => onChangeTheme('dark')}
            className={`p-4 rounded-lg border text-left cursor-pointer transition-colors ${
              theme === 'dark'
                ? 'border-white bg-neutral-950 text-white'
                : 'border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 text-neutral-600 dark:text-neutral-300'
            }`}
          >
            <div className="flex items-center justify-between font-semibold text-xs">
              <span className="inline-flex items-center gap-2"><Moon className="h-4 w-4" /> Dark Mode (Monochrome)</span>
              {theme === 'dark' && <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
            </div>
            <p className="text-[11px] mt-1 opacity-80">Deep charcoal surface with high-contrast white typography.</p>
          </button>
        </div>
      </div>
    );
  }

  if (mode === 'reports') {
    return (
      <div className={cardCls}>
        <div className="flex items-center justify-between border-b border-neutral-100 dark:border-neutral-800 pb-3">
          <div>
            <h3 className="text-sm font-semibold text-neutral-950 dark:text-white">
              Reports &amp; Export Configuration
            </h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              11 standardized report modules supporting Print/PDF, Excel (.xls), and CSV exports.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => onNavigate('reports')} icon={<BarChart3 className="h-3.5 w-3.5" />}>
              Open Reports Center
            </Button>
            {isAdmin && (
              <Button variant="primary" size="sm" onClick={handleSaveReports} icon={<Save className="h-3.5 w-3.5" />}>
                Save Report Config
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div>
            <label className={labelCls}>Default Export Format</label>
            <select
              disabled={!isAdmin}
              value={rForm.defaultExportFormat}
              onChange={(e) => setRForm({ ...rForm, defaultExportFormat: e.target.value as 'PDF' | 'Excel' | 'CSV' })}
              className={inputCls}
            >
              <option value="PDF">PDF / Print</option>
              <option value="Excel">Excel (.xls)</option>
              <option value="CSV">CSV</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Scheduled Auto-Report Time (IST)</label>
            <input
              type="time"
              disabled={!isAdmin}
              value={rForm.autoReportTime}
              onChange={(e) => setRForm({ ...rForm, autoReportTime: e.target.value })}
              className={inputCls}
            />
          </div>
          <div className="flex items-end pb-2">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                disabled={!isAdmin}
                checked={rForm.autoDailyReportEnabled}
                onChange={(e) => setRForm({ ...rForm, autoDailyReportEnabled: e.target.checked })}
              />
              <span>Auto-Daily Report (Requires Host Cron)</span>
            </label>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cardCls}>
      <div className="flex items-center justify-between border-b border-neutral-100 dark:border-neutral-800 pb-3">
        <div>
          <h3 className="text-sm font-semibold text-neutral-950 dark:text-white">
            Dashboard Role Widget &amp; Period Configuration
          </h3>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Configure default widgets and default time period (Today / This Week / This Month) per role.
          </p>
        </div>
        {isAdmin && (
          <Button variant="primary" size="sm" onClick={handleSaveDashboard} icon={<Save className="h-3.5 w-3.5" />}>
            Save Widget Layout
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Target Role</label>
          <select value={roleTarget} onChange={(e) => setRoleTarget(e.target.value as 'ADMIN' | 'MANAGER' | 'STAFF')} className={inputCls}>
            <option value="ADMIN">ADMIN</option>
            <option value="MANAGER">MANAGER</option>
            <option value="STAFF">STAFF</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Default Period Filter</label>
          <select value={period} onChange={(e) => setPeriod(e.target.value as 'Today' | 'This Week' | 'This Month')} className={inputCls}>
            <option value="Today">Today</option>
            <option value="This Week">This Week</option>
            <option value="This Month">This Month</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
        {ALL_WIDGETS.map((w) => {
          const checked = widgets.includes(w);
          return (
            <label
              key={w}
              className="flex items-center gap-2 p-2.5 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded cursor-pointer"
            >
              <input
                type="checkbox"
                disabled={!isAdmin}
                checked={checked}
                onChange={() =>
                  setWidgets((prev) => (checked ? prev.filter((x) => x !== w) : [...prev, w]))
                }
              />
              <span>{w}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
};
