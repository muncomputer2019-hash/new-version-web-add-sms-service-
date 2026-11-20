import React, { useState } from 'react';
import { Calculator, History, Plus, Save, Upload } from 'lucide-react';
import {
  BranchItem,
  CompanyProfileSettings,
  CounterItem,
  DailyCashClosingRecord,
  DocumentCounterSnapshot,
  DocumentType,
  GlobalConfiguration,
  HistoricalTransactionSnapshot,
  LanguageCode,
  ServiceRateItem,
  UserProfile,
} from '../../modules/types';
import { Button } from '../../components/Button';
import { MobileNumberInput } from '../../components/MobileNumberInput';
import { StatusText } from '../../components/StatusText';
import { formatINR, formatDateIST } from '../../services/formatters';
import { securityRequest } from '../../services/securityApi';

const inputCls =
  'w-full h-9 px-3 text-xs bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded-md text-neutral-950 dark:text-neutral-100 focus:outline-none focus:border-blue-800';
const labelCls = 'block text-xs font-medium text-neutral-800 dark:text-neutral-200 mb-1';
const cardCls =
  'bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5 space-y-4';

/* ---------------- 1. Company Profile Panel ---------------- */
export const CompanyProfilePanel: React.FC<{
  initial: CompanyProfileSettings;
  isAdmin: boolean;
  onRequestSave: (draft: CompanyProfileSettings, reason: string) => void;
}> = ({ initial, isAdmin, onRequestSave }) => {
  const [form, setForm] = useState<CompanyProfileSettings>(initial);
  const [reason, setReason] = useState('Official business profile verification');

  const handleFileUpload = (field: 'logoUrl' | 'signatureUrl' | 'stampUrl', file?: File) => {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setForm((prev) => ({ ...prev, [field]: reader.result as string }));
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className={cardCls}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-neutral-100 dark:border-neutral-800 pb-3">
        <div>
          <h3 className="text-sm font-semibold text-neutral-950 dark:text-white">
            Company Profile (MUN COMPUTER)
          </h3>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Default Murshidabad address, tax registration, UPI/bank details, logo, signature, and stamp.
          </p>
        </div>
        {isAdmin && (
          <Button
            variant="primary"
            size="sm"
            onClick={() => onRequestSave(form, reason)}
            icon={<Save className="h-3.5 w-3.5" />}
          >
            Save Company Profile
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
        <div>
          <label className={labelCls}>Company Name *</label>
          <input
            disabled={!isAdmin}
            value={form.companyName}
            onChange={(e) => setForm({ ...form, companyName: e.target.value })}
            className={inputCls}
          />
        </div>
        <div className="md:col-span-2">
          <label className={labelCls}>Village / Street Address *</label>
          <input
            disabled={!isAdmin}
            value={form.addressLine}
            onChange={(e) => setForm({ ...form, addressLine: e.target.value })}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Post Office (P.O.)</label>
          <input
            disabled={!isAdmin}
            value={form.postOffice}
            onChange={(e) => setForm({ ...form, postOffice: e.target.value })}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Police Station (P.S.)</label>
          <input
            disabled={!isAdmin}
            value={form.policeStation}
            onChange={(e) => setForm({ ...form, policeStation: e.target.value })}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>District</label>
          <input
            disabled={!isAdmin}
            value={form.district}
            onChange={(e) => setForm({ ...form, district: e.target.value })}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>State</label>
          <input
            disabled={!isAdmin}
            value={form.stateName}
            onChange={(e) => setForm({ ...form, stateName: e.target.value })}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Country</label>
          <input
            disabled={!isAdmin}
            value={form.countryName}
            onChange={(e) => setForm({ ...form, countryName: e.target.value })}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>PIN Code *</label>
          <input
            disabled={!isAdmin}
            value={form.pinCode}
            onChange={(e) => setForm({ ...form, pinCode: e.target.value })}
            className={`${inputCls} font-mono`}
          />
        </div>
        <div>
          <label className={labelCls}>Mobile *</label>
          <MobileNumberInput
            disabled={!isAdmin}
            required
            value={form.mobile}
            onChange={(val) => setForm((prev) => ({ ...prev, mobile: val }))}
            aria-label="Company mobile number"
          />
        </div>
        <div>
          <label className={labelCls}>WhatsApp</label>
          <MobileNumberInput
            disabled={!isAdmin}
            value={form.whatsapp}
            onChange={(val) => setForm((prev) => ({ ...prev, whatsapp: val }))}
            aria-label="Company WhatsApp number"
          />
        </div>
        <div>
          <label className={labelCls}>Official Email</label>
          <input
            disabled={!isAdmin}
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Website (Optional)</label>
          <input
            disabled={!isAdmin}
            value={form.website}
            onChange={(e) => setForm({ ...form, website: e.target.value })}
            placeholder="https://..."
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>GST Number (Optional)</label>
          <input
            disabled={!isAdmin}
            value={form.gstNumber}
            onChange={(e) => setForm({ ...form, gstNumber: e.target.value })}
            placeholder="19XXXXX0000X1Z5"
            className={`${inputCls} font-mono`}
          />
        </div>
        <div>
          <label className={labelCls}>PAN Number (Optional)</label>
          <input
            disabled={!isAdmin}
            value={form.panNumber}
            onChange={(e) => setForm({ ...form, panNumber: e.target.value })}
            placeholder="ABCDE1234F"
            className={`${inputCls} font-mono`}
          />
        </div>
        <div>
          <label className={labelCls}>UPI ID</label>
          <input
            disabled={!isAdmin}
            value={form.upiId}
            onChange={(e) => setForm({ ...form, upiId: e.target.value })}
            placeholder="muncomputer@upi"
            className={`${inputCls} font-mono`}
          />
        </div>
        <div className="md:col-span-2">
          <label className={labelCls}>Bank Account Details</label>
          <input
            disabled={!isAdmin}
            value={form.bankDetails}
            onChange={(e) => setForm({ ...form, bankDetails: e.target.value })}
            placeholder="Bank Name · A/C No · IFSC"
            className={inputCls}
          />
        </div>
      </div>

      {/* Logo, Signature & Stamp Uploads + Previews */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-neutral-100 dark:border-neutral-800">
        {(
          [
            { key: 'logoUrl', label: 'Company Logo' },
            { key: 'signatureUrl', label: 'Digital Signature' },
            { key: 'stampUrl', label: 'Company Stamp' },
          ] as const
        ).map(({ key, label }) => (
          <div
            key={key}
            className="border border-neutral-200 dark:border-neutral-800 rounded-md p-3 bg-neutral-50 dark:bg-neutral-950 space-y-2"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-neutral-800 dark:text-neutral-200">{label}</span>
              {isAdmin && (
                <label className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-800 dark:text-blue-400 cursor-pointer hover:underline">
                  <Upload className="h-3 w-3" />
                  <span>Upload</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => handleFileUpload(key, e.target.files?.[0])}
                  />
                </label>
              )}
            </div>
            <div className="h-16 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded flex items-center justify-center overflow-hidden">
              {form[key] ? (
                <img src={form[key]} alt={label} className="max-h-14 object-contain" />
              ) : (
                <span className="text-[11px] text-neutral-400">Not uploaded</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {isAdmin && (
        <div>
          <label className={labelCls}>Audit Change Reason</label>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className={inputCls}
          />
        </div>
      )}
    </div>
  );
};

/* ---------------- 2. Service Rate Management Panel ---------------- */
export const ServiceRatesPanel: React.FC<{
  rates: ServiceRateItem[];
  snapshots: HistoricalTransactionSnapshot[];
  isAdmin: boolean;
  onRefresh: () => void;
  onShowToast: (type: 'success' | 'error' | 'info', title: string, description?: string) => void;
}> = ({ rates, snapshots, isAdmin, onRefresh, onShowToast }) => {
  const [serviceCode, setServiceCode] = useState('PAN-NEW');
  const [serviceName, setServiceName] = useState('PAN Card New Application');
  const [category, setCategory] = useState('Citizen Services');
  const [customerCharge, setCustomerCharge] = useState('250');
  const [serviceCost, setServiceCost] = useState('107');
  const [effectiveDate, setEffectiveDate] = useState('2026-11-16');
  const [changeReason, setChangeReason] = useState('Portal fee revision');
  const [selectedHistoryRate, setSelectedHistoryRate] = useState<ServiceRateItem | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const chargeNum = Number(customerCharge) || 0;
  const costNum = Number(serviceCost) || 0;
  const computedProfit = chargeNum - costNum;

  const handleSelectExisting = (r: ServiceRateItem) => {
    setServiceCode(r.serviceCode);
    setServiceName(r.serviceName);
    setCategory(r.category);
    setCustomerCharge(String(r.customerCharge));
    setServiceCost(String(r.serviceCost));
    setEffectiveDate(r.effectiveDate);
    setSelectedHistoryRate(r);
  };

  const handleSaveOrPropose = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!changeReason.trim()) {
      onShowToast('error', 'Reason Required', 'Provide an effective change reason.');
      return;
    }
    setSubmitting(true);
    try {
      if (isAdmin) {
        await securityRequest('/api/service-rates', {
          method: 'POST',
          body: JSON.stringify({
            serviceCode,
            serviceName,
            category,
            customerCharge: chargeNum,
            serviceCost: costNum,
            effectiveDate,
            changeReason,
          }),
        });
        onShowToast('success', 'Service Rate Saved', `${serviceCode} updated with version snapshot.`);
      } else {
        const current = rates.find((r) => r.serviceCode === serviceCode);
        await securityRequest('/api/settings-proposals', {
          method: 'POST',
          body: JSON.stringify({
            settingModule: 'Service Rate Management',
            settingName: `${serviceCode} Charge Revision`,
            oldValue: current ? { customerCharge: current.customerCharge, serviceCost: current.serviceCost } : null,
            proposedValue: {
              serviceCode,
              customerCharge: chargeNum,
              serviceCost: costNum,
              effectiveDate,
            },
            changeReason,
          }),
        });
        onShowToast(
          'info',
          'Rate Proposal Submitted',
          'Live service rates remain unchanged until an Admin approves the proposal.'
        );
      }
      onRefresh();
    } catch (err) {
      onShowToast('error', 'Rate Action Failed', err instanceof Error ? err.message : undefined);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      <form onSubmit={handleSaveOrPropose} className={cardCls}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-neutral-100 dark:border-neutral-800 pb-3">
          <div>
            <h3 className="text-sm font-semibold text-neutral-950 dark:text-white">
              {isAdmin ? 'Create / Revise Service Rate' : 'Propose Service Rate Change (Requires Admin Approval)'}
            </h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Formula: <span className="font-mono font-semibold">Profit = Customer Charge − Service Cost</span>. Completed historical transactions retain their locked rate snapshot.
            </p>
          </div>
          <Button type="submit" variant="primary" size="sm" loading={submitting} icon={<Calculator className="h-3.5 w-3.5" />}>
            {isAdmin ? 'Save Versioned Rate' : 'Submit Rate Proposal'}
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className={labelCls}>Service Code *</label>
            <input value={serviceCode} onChange={(e) => setServiceCode(e.target.value.toUpperCase())} className={`${inputCls} font-mono`} />
          </div>
          <div>
            <label className={labelCls}>Service Name *</label>
            <input value={serviceName} onChange={(e) => setServiceName(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Category</label>
            <input value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Effective Date</label>
            <input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Customer Charge (INR ₹) *</label>
            <input type="number" min="0" value={customerCharge} onChange={(e) => setCustomerCharge(e.target.value)} className={`${inputCls} font-mono`} />
          </div>
          <div>
            <label className={labelCls}>Service Cost (INR ₹) *</label>
            <input type="number" min="0" value={serviceCost} onChange={(e) => setServiceCost(e.target.value)} className={`${inputCls} font-mono`} />
          </div>
          <div>
            <label className={labelCls}>Calculated Profit (INR ₹)</label>
            <div className={`h-9 px-3 flex items-center rounded-md border font-mono text-xs font-bold tabular-nums ${
              computedProfit >= 0
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-400'
                : 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900 text-red-700 dark:text-red-400'
            }`}>
              {formatINR(computedProfit)}
            </div>
          </div>
          <div>
            <label className={labelCls}>Change Reason *</label>
            <input value={changeReason} onChange={(e) => setChangeReason(e.target.value)} className={inputCls} />
          </div>
        </div>
      </form>

      {/* Active Rate Catalog Table */}
      <div className={cardCls}>
        <h3 className="text-sm font-semibold text-neutral-950 dark:text-white">
          Active Service Rates ({rates.length})
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-neutral-50 dark:bg-neutral-950 border-y border-neutral-200 dark:border-neutral-800">
                <th className="py-2.5 px-3 font-semibold">Code</th>
                <th className="py-2.5 px-3 font-semibold">Service</th>
                <th className="py-2.5 px-3 font-semibold text-right">Charge</th>
                <th className="py-2.5 px-3 font-semibold text-right">Cost</th>
                <th className="py-2.5 px-3 font-semibold text-right">Profit</th>
                <th className="py-2.5 px-3 font-semibold">Version</th>
                <th className="py-2.5 px-3 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {rates.map((r) => (
                <tr key={r.serviceCode} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40">
                  <td className="py-2.5 px-3 font-mono font-semibold">{r.serviceCode}</td>
                  <td className="py-2.5 px-3">
                    <div className="font-medium text-neutral-950 dark:text-white">{r.serviceName}</div>
                    <div className="text-[11px] text-neutral-500">{r.category}</div>
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums">{formatINR(r.customerCharge)}</td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums">{formatINR(r.serviceCost)}</td>
                  <td className="py-2.5 px-3 text-right font-mono font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
                    {formatINR(r.profitAmount)}
                  </td>
                  <td className="py-2.5 px-3 font-mono tabular-nums">v{r.currentVersion}</td>
                  <td className="py-2.5 px-3 text-right">
                    <Button variant="outline" size="sm" onClick={() => handleSelectExisting(r)} icon={<History className="h-3 w-3" />}>
                      Edit / Versions
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Selected Rate Version History */}
      {selectedHistoryRate && (
        <div className={cardCls}>
          <h4 className="text-xs font-semibold text-neutral-950 dark:text-white">
            Version History — {selectedHistoryRate.serviceCode} ({selectedHistoryRate.serviceName})
          </h4>
          <div className="divide-y divide-neutral-100 dark:divide-neutral-800 text-xs">
            {selectedHistoryRate.versions.map((v) => (
              <div key={v.versionNo} className="py-2 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-mono font-semibold">v{v.versionNo}</span> · Charge{' '}
                  <span className="font-mono">{formatINR(v.customerCharge)}</span> − Cost{' '}
                  <span className="font-mono">{formatINR(v.serviceCost)}</span> = Profit{' '}
                  <span className="font-mono font-semibold">{formatINR(v.profitAmount)}</span>
                  <span className="text-neutral-500 ml-2">({v.changeReason})</span>
                </div>
                <div className="flex items-center gap-3 font-mono text-[11px] text-neutral-500">
                  <span>Effective: {formatDateIST(v.effectiveDate)}</span>
                  <StatusText status={v.approvalStatus} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Immutable Completed Historical Rate Snapshots */}
      <div className={cardCls}>
        <h4 className="text-xs font-semibold text-neutral-950 dark:text-white">
          Immutable Completed Transaction Rate Snapshots (Unaffected by New Rate Changes)
        </h4>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-neutral-50 dark:bg-neutral-950 border-y border-neutral-200 dark:border-neutral-800">
                <th className="py-2 px-3 font-semibold">Receipt No</th>
                <th className="py-2 px-3 font-semibold">Service</th>
                <th className="py-2 px-3 font-semibold">Locked Version</th>
                <th className="py-2 px-3 font-semibold text-right">Locked Charge</th>
                <th className="py-2 px-3 font-semibold text-right">Locked Profit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {snapshots.map((s) => (
                <tr key={s.id}>
                  <td className="py-2 px-3 font-mono">{s.receiptNo}</td>
                  <td className="py-2 px-3">{s.serviceName} ({s.serviceCode})</td>
                  <td className="py-2 px-3 font-mono">v{s.appliedVersion}</td>
                  <td className="py-2 px-3 text-right font-mono tabular-nums">{formatINR(s.customerChargeSnapshot)}</td>
                  <td className="py-2 px-3 text-right font-mono tabular-nums">{formatINR(s.profitSnapshot)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

/* ---------------- 3. Language & Localization + Global Config Panel ---------------- */
export const GlobalLocalizationPanel: React.FC<{
  mode: 'localization' | 'global';
  globalConfig: GlobalConfiguration;
  userLanguage: LanguageCode;
  documentCounters: DocumentCounterSnapshot[];
  isAdmin: boolean;
  onChangeLanguage: (lang: LanguageCode) => void;
  onSaveGlobal: (cfg: GlobalConfiguration) => void;
  onRefresh: () => void;
  onShowToast: (type: 'success' | 'error' | 'info', title: string, description?: string) => void;
}> = ({
  mode,
  globalConfig,
  userLanguage,
  documentCounters,
  isAdmin,
  onChangeLanguage,
  onSaveGlobal,
  onRefresh,
  onShowToast,
}) => {
  const [cfg, setCfg] = useState<GlobalConfiguration>(globalConfig);
  const [lastAllocated, setLastAllocated] = useState<string | null>(null);

  const handleAllocateTest = async (docType: DocumentType) => {
    try {
      const res = await securityRequest<{ generatedNumber: string }>('/api/document-sequences/next', {
        method: 'POST',
        body: JSON.stringify({ docType }),
      });
      setLastAllocated(res.data.generatedNumber);
      onShowToast('success', 'Atomic Serial Allocated', res.data.generatedNumber);
      onRefresh();
    } catch (err) {
      onShowToast('error', 'Allocation Failed', err instanceof Error ? err.message : undefined);
    }
  };

  return (
    <div className="space-y-5">
      {mode === 'localization' && (
        <div className={cardCls}>
          <h3 className="text-sm font-semibold text-neutral-950 dark:text-white">
            Language &amp; Indian Localization
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div>
              <label className={labelCls}>My Active Display Language</label>
              <select
                value={userLanguage}
                onChange={(e) => onChangeLanguage(e.target.value as LanguageCode)}
                className={inputCls}
              >
                <option value="en">English (Default)</option>
                <option value="bn">Bengali (বাংলা)</option>
                <option value="hi">Hindi (हिन्दी)</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Currency Format (Western Digits)</label>
              <div className="h-9 px-3 flex items-center bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-md font-mono tabular-nums">
                INR (₹) · {formatINR(100000)}
              </div>
            </div>
            <div>
              <label className={labelCls}>Date &amp; Timezone Standard</label>
              <div className="h-9 px-3 flex items-center bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-md font-mono tabular-nums">
                DD/MM/YYYY · {globalConfig.timezone} ({formatDateIST('2026-11-16')})
              </div>
            </div>
          </div>
        </div>
      )}

      <div className={cardCls}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-neutral-100 dark:border-neutral-800 pb-3">
          <div>
            <h3 className="text-sm font-semibold text-neutral-950 dark:text-white">
              Financial Year &amp; Sequential Document Numbering
            </h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              FY {cfg.financialYearLabel} (April 1 – March 31) · Atomic row-locked prefix counters
            </p>
          </div>
          {isAdmin && (
            <Button variant="primary" size="sm" onClick={() => onSaveGlobal(cfg)} icon={<Save className="h-3.5 w-3.5" />}>
              Save Global Config
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <label className={labelCls}>Default System Language</label>
            <select
              disabled={!isAdmin}
              value={cfg.defaultLanguage}
              onChange={(e) => setCfg({ ...cfg, defaultLanguage: e.target.value as LanguageCode })}
              className={inputCls}
            >
              <option value="en">English</option>
              <option value="bn">Bengali (বাংলা)</option>
              <option value="hi">Hindi (हिन्दी)</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Receipt Prefix</label>
            <input
              disabled={!isAdmin}
              value={cfg.prefixes.RECEIPT}
              onChange={(e) => setCfg({ ...cfg, prefixes: { ...cfg.prefixes, RECEIPT: e.target.value.toUpperCase() } })}
              className={`${inputCls} font-mono`}
            />
          </div>
          <div>
            <label className={labelCls}>Invoice Prefix</label>
            <input
              disabled={!isAdmin}
              value={cfg.prefixes.INVOICE}
              onChange={(e) => setCfg({ ...cfg, prefixes: { ...cfg.prefixes, INVOICE: e.target.value.toUpperCase() } })}
              className={`${inputCls} font-mono`}
            />
          </div>
          <div>
            <label className={labelCls}>Application Prefix</label>
            <input
              disabled={!isAdmin}
              value={cfg.prefixes.APPLICATION}
              onChange={(e) => setCfg({ ...cfg, prefixes: { ...cfg.prefixes, APPLICATION: e.target.value.toUpperCase() } })}
              className={`${inputCls} font-mono`}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
          {documentCounters.map((dc) => (
            <div
              key={dc.docType}
              className="p-3 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-md flex items-center justify-between gap-2"
            >
              <div className="min-w-0">
                <div className="text-[11px] font-semibold text-neutral-500">{dc.docType}</div>
                <div className="font-mono text-xs font-bold text-neutral-950 dark:text-white truncate">
                  {dc.nextPreview}
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => handleAllocateTest(dc.docType)}>
                Issue Next
              </Button>
            </div>
          ))}
        </div>
        {lastAllocated && (
          <div className="text-xs font-mono text-emerald-700 dark:text-emerald-400">
            Last atomic document number generated: <span className="font-bold">{lastAllocated}</span>
          </div>
        )}
      </div>
    </div>
  );
};

/* ---------------- 4. Branch & Counter Settings Panel ---------------- */
export const BranchCountersPanel: React.FC<{
  branches: BranchItem[];
  counters: CounterItem[];
  isAdmin: boolean;
  onRefresh: () => void;
  onShowToast: (type: 'success' | 'error' | 'info', title: string, description?: string) => void;
}> = ({ branches, counters, isAdmin, onRefresh, onShowToast }) => {
  const [counterCode, setCounterCode] = useState('CTR-03');
  const [name, setName] = useState('CSC & Banking Desk');
  const [assignedUserId, setAssignedUserId] = useState('MC2627110003');

  const handleAddCounter = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await securityRequest('/api/counters', {
        method: 'POST',
        body: JSON.stringify({ counterCode, name, assignedUserId }),
      });
      onShowToast('success', 'Counter Added', `${counterCode} created.`);
      onRefresh();
    } catch (err) {
      onShowToast('error', 'Failed', err instanceof Error ? err.message : undefined);
    }
  };

  return (
    <div className="space-y-5">
      <div className={cardCls}>
        <h3 className="text-sm font-semibold text-neutral-950 dark:text-white">
          Branch Configuration (Single Branch Architecture Ready)
        </h3>
        {branches.map((b) => (
          <div
            key={b.branchCode}
            className="p-3 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-md flex flex-wrap items-center justify-between gap-2 text-xs"
          >
            <div>
              <div className="font-semibold text-neutral-950 dark:text-white">
                {b.name} ({b.branchCode})
              </div>
              <div className="text-neutral-500 mt-0.5">{b.address} · PIN {b.pinCode}</div>
            </div>
            <StatusText status="ACTIVE" />
          </div>
        ))}
      </div>

      <div className={cardCls}>
        <h3 className="text-sm font-semibold text-neutral-950 dark:text-white">
          Service Counters &amp; User Separation ({counters.length})
        </h3>
        <div className="divide-y divide-neutral-100 dark:divide-neutral-800 text-xs">
          {counters.map((c) => (
            <div key={c.counterCode} className="py-2.5 flex items-center justify-between gap-3">
              <div>
                <span className="font-mono font-semibold text-neutral-950 dark:text-white">{c.counterCode}</span> —{' '}
                <span>{c.name}</span>
              </div>
              <span className="font-mono text-neutral-500">Assigned: {c.assignedUserId}</span>
            </div>
          ))}
        </div>

        {isAdmin && (
          <form onSubmit={handleAddCounter} className="pt-3 border-t border-neutral-100 dark:border-neutral-800 grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
            <div>
              <label className={labelCls}>Counter Code</label>
              <input value={counterCode} onChange={(e) => setCounterCode(e.target.value.toUpperCase())} className={`${inputCls} font-mono`} />
            </div>
            <div>
              <label className={labelCls}>Counter Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Assigned User ID</label>
              <input value={assignedUserId} onChange={(e) => setAssignedUserId(e.target.value)} className={`${inputCls} font-mono`} />
            </div>
            <Button type="submit" variant="primary" size="sm" icon={<Plus className="h-3.5 w-3.5" />}>
              Add Counter
            </Button>
          </form>
        )}
      </div>
    </div>
  );
};

/* ---------------- 5. Daily Cash Management Panel ---------------- */
export const DailyCashPanel: React.FC<{
  closings: DailyCashClosingRecord[];
  counters: CounterItem[];
  currentUser: UserProfile;
  onRefresh: () => void;
  onShowToast: (type: 'success' | 'error' | 'info', title: string, description?: string) => void;
}> = ({ closings, counters, currentUser, onRefresh, onShowToast }) => {
  const [counterCode, setCounterCode] = useState(counters[0]?.counterCode ?? 'CTR-01');
  const [closingDate, setClosingDate] = useState('16/11/2026');
  const [openingCash, setOpeningCash] = useState('2000');
  const [cashReceived, setCashReceived] = useState('3500');
  const [cashExpenses, setCashExpenses] = useState('300');
  const [actualCashCount, setActualCashCount] = useState('5200');
  const [differenceReason, setDifferenceReason] = useState('');

  const expectedCash = (Number(openingCash) || 0) + (Number(cashReceived) || 0) - (Number(cashExpenses) || 0);
  const variance = (Number(actualCashCount) || 0) - expectedCash;

  const handleSubmitClosing = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await securityRequest<DailyCashClosingRecord>('/api/daily-cash', {
        method: 'POST',
        body: JSON.stringify({
          counterCode,
          closingDate,
          openingCash: Number(openingCash),
          cashReceived: Number(cashReceived),
          cashExpenses: Number(cashExpenses),
          actualCashCount: Number(actualCashCount),
          differenceReason,
        }),
      });
      onShowToast('success', 'Daily Cash Submitted', `${res.data.closingCode} · ${res.data.approvalStatus}`);
      setDifferenceReason('');
      onRefresh();
    } catch (err) {
      onShowToast('error', 'Closing Validation Error', err instanceof Error ? err.message : undefined);
    }
  };

  const handleApproveVariance = async (code: string) => {
    try {
      await securityRequest(`/api/daily-cash/${code}/approve`, {
        method: 'POST',
        body: JSON.stringify({ note: 'Verified physical register count by Admin' }),
      });
      onShowToast('success', 'Variance Approved', `${code} marked Approved in immutable audit trail.`);
      onRefresh();
    } catch (err) {
      onShowToast('error', 'Approval Failed', err instanceof Error ? err.message : undefined);
    }
  };

  return (
    <div className="space-y-5">
      <form onSubmit={handleSubmitClosing} className={cardCls}>
        <div className="border-b border-neutral-100 dark:border-neutral-800 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-neutral-950 dark:text-white">
              Daily Cash Register &amp; Closing Verification
            </h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Formula: <span className="font-mono font-semibold">Expected = Opening + Cash Received − Cash Expenses</span>. Variance requires mandatory reason and Admin approval.
            </p>
          </div>
          <Button type="submit" variant="primary" size="sm">
            Record Closing
          </Button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className={labelCls}>Counter</label>
            <select value={counterCode} onChange={(e) => setCounterCode(e.target.value)} className={inputCls}>
              {(counters.length ? counters : [{ counterCode: 'CTR-01', name: 'Counter 1' }]).map((c) => (
                <option key={c.counterCode} value={c.counterCode}>
                  {c.counterCode}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Date (DD/MM/YYYY)</label>
            <input value={closingDate} onChange={(e) => setClosingDate(e.target.value)} className={`${inputCls} font-mono`} />
          </div>
          <div>
            <label className={labelCls}>Opening Cash (₹)</label>
            <input type="number" min="0" value={openingCash} onChange={(e) => setOpeningCash(e.target.value)} className={`${inputCls} font-mono`} />
          </div>
          <div>
            <label className={labelCls}>Cash Received (₹)</label>
            <input type="number" min="0" value={cashReceived} onChange={(e) => setCashReceived(e.target.value)} className={`${inputCls} font-mono`} />
          </div>
          <div>
            <label className={labelCls}>Cash Expenses (₹)</label>
            <input type="number" min="0" value={cashExpenses} onChange={(e) => setCashExpenses(e.target.value)} className={`${inputCls} font-mono`} />
          </div>
          <div>
            <label className={labelCls}>Expected Cash (Auto)</label>
            <div className="h-9 px-3 flex items-center bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-md font-mono text-xs font-bold tabular-nums">
              {formatINR(expectedCash)}
            </div>
          </div>
          <div>
            <label className={labelCls}>Actual Cash Count (₹)</label>
            <input type="number" min="0" value={actualCashCount} onChange={(e) => setActualCashCount(e.target.value)} className={`${inputCls} font-mono`} />
          </div>
          <div>
            <label className={labelCls}>Difference</label>
            <div className={`h-9 px-3 flex items-center rounded-md border font-mono text-xs font-bold tabular-nums ${
              variance === 0
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-400'
                : 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900 text-amber-700 dark:text-amber-400'
            }`}>
              {formatINR(variance)}
            </div>
          </div>
        </div>

        {variance !== 0 && (
          <div>
            <label className={labelCls}>Mandatory Difference Reason *</label>
            <input
              value={differenceReason}
              onChange={(e) => setDifferenceReason(e.target.value)}
              placeholder="Explain shortage or excess cash..."
              className={inputCls}
            />
          </div>
        )}
      </form>

      <div className={cardCls}>
        <h4 className="text-xs font-semibold text-neutral-950 dark:text-white">
          Cash Closing Ledger &amp; Correction Audit History ({closings.length})
        </h4>
        <div className="divide-y divide-neutral-100 dark:divide-neutral-800 text-xs">
          {closings.map((c) => (
            <div key={c.closingCode} className="py-3 space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-mono font-bold text-neutral-950 dark:text-white">{c.closingCode}</span> ·{' '}
                  <span className="font-mono">{c.counterCode}</span> · {c.closingDate} · Submitted by{' '}
                  <span className="font-mono">{c.submittedBy}</span>
                </div>
                <div className="flex items-center gap-2">
                  <StatusText status={c.approvalStatus} />
                  {currentUser.role === 'ADMIN' && c.approvalStatus === 'Pending Admin Approval' && (
                    <Button variant="secondary" size="sm" onClick={() => handleApproveVariance(c.closingCode)}>
                      Approve Variance
                    </Button>
                  )}
                </div>
              </div>
              <div className="font-mono text-[11px] text-neutral-600 dark:text-neutral-300 tabular-nums">
                Expected: {formatINR(c.expectedCash)} | Counted: {formatINR(c.actualCashCount)} | Diff: {formatINR(c.cashDifference)} ({c.differenceReason})
              </div>
              <div className="text-[11px] text-neutral-500">
                Audit trail: {c.correctionAudit.map((a) => `${a.action} (${a.actor})`).join(' -> ')}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
