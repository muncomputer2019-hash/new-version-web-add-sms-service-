import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ExternalLink,
  HeartPulse,
  Landmark,
  PhoneCall,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  ShoppingCart,
} from 'lucide-react';
import { CscOrderRecord, CscService } from '../../../shared/cscTypes';
import { Button } from '../../components/Button';
import { UserProfile } from '../../modules/types';
import { cscApi } from '../../services/cscApi';
import { formatINR } from '../../services/formatters';

interface OfficialSchemesHubPageProps {
  currentUser: UserProfile;
  onStartOrderForService?: (serviceId: string) => void;
  onShowToast: (type: 'success' | 'error' | 'info', title: string, description?: string) => void;
}

type SchemeTab = 'PMJAY' | 'MMSBY' | 'NPCI' | 'CYBER_CRIME';

export const OfficialSchemesHubPage: React.FC<OfficialSchemesHubPageProps> = ({
  currentUser,
  onStartOrderForService,
  onShowToast,
}) => {
  const [activeTab, setActiveTab] = useState<SchemeTab>('PMJAY');
  const [services, setServices] = useState<CscService[]>([]);
  const [orders, setOrders] = useState<CscOrderRecord[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [svcRes, ordRes] = await Promise.all([
        cscApi.getServices({ moduleTag: activeTab }),
        cscApi.getCscOrders({ moduleTag: activeTab }),
      ]);
      setServices(svcRes.data);
      setOrders(ordRes.data);
    } catch (err) {
      onShowToast('error', 'Failed to load scheme module', err instanceof Error ? err.message : undefined);
    } finally {
      setLoading(false);
    }
  }, [activeTab, onShowToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return services.filter(
      (s) =>
        !q ||
        s.name.toLowerCase().includes(q) ||
        s.code.toLowerCase().includes(q) ||
        (s.subGroup || '').toLowerCase().includes(q)
    );
  }, [services, search]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-neutral-950 dark:text-white">
            Official Schemes, Banking Compliance &amp; Cyber Crime Support
          </h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
            Dedicated operational modules for Ayushman Bharat PM-JAY (30), MMSBY (25), NPCI Bank/PSP Routing (53), and Cyber Crime 1930 Assistance (70).
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadData} loading={loading} icon={<RefreshCw className="h-3.5 w-3.5" />}>
          Refresh
        </Button>
      </div>

      {/* Module Switcher */}
      <div className="flex flex-wrap gap-2 border-b border-neutral-200 dark:border-neutral-800 pb-3">
        {(
          [
            { key: 'PMJAY', label: 'Ayushman Bharat PM-JAY (30)', Icon: HeartPulse },
            { key: 'MMSBY', label: 'MMSBY Scheme (25)', Icon: ShieldCheck },
            { key: 'NPCI', label: 'NPCI Bank / PSP Routing (53)', Icon: Landmark },
            { key: 'CYBER_CRIME', label: 'Cyber Crime Cell & 1930 (70)', Icon: ShieldAlert },
          ] as const
        ).map((t) => {
          const active = activeTab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => {
                setActiveTab(t.key);
                setSearch('');
              }}
              className={`px-3.5 py-2 rounded-md text-xs font-medium inline-flex items-center gap-2 cursor-pointer whitespace-nowrap ${
                active
                  ? 'bg-neutral-950 text-white dark:bg-white dark:text-neutral-950'
                  : 'bg-neutral-100 dark:bg-neutral-900 text-neutral-700 dark:text-neutral-300'
              }`}
            >
              <t.Icon className="h-3.5 w-3.5 shrink-0" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* Mandatory Compliance Banners */}
      {activeTab === 'PMJAY' && (
        <div className="p-4 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 text-xs space-y-1.5">
          <div className="font-bold text-emerald-900 dark:text-emerald-200">
            Ayushman Bharat — Pradhan Mantri Jan Arogya Yojana (PM-JAY) Authorized Assistance
          </div>
          <p className="text-emerald-800 dark:text-emerald-300">
            Supported Official e-KYC Methods: <strong>Aadhaar OTP</strong> · <strong>Face Auth</strong> ·{' '}
            <strong>Fingerprint Biometric</strong> · <strong>IRIS Scan</strong>. Never store citizen Aadhaar OTPs or biometrics inside MUN COMPUTER — perform e-KYC strictly on the authorized official PM-JAY / BIS portal.
          </p>
        </div>
      )}

      {activeTab === 'MMSBY' && (
        <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-xs flex items-start gap-2.5">
          <AlertTriangle className="h-5 w-5 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
          <div>
            <div className="font-bold text-amber-950 dark:text-amber-200">
              Mandatory Regulatory Distinction: MMSBY ≠ Swasthya Sathi
            </div>
            <p className="mt-1 text-amber-900 dark:text-amber-300">
              MMSBY and Swasthya Sathi are separate schemes and must NEVER be conflated. Verify official scheme name, eligibility rules, and official govt portal before processing live applications.
            </p>
          </div>
        </div>
      )}

      {activeTab === 'NPCI' && (
        <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 text-xs space-y-1.5">
          <div className="font-bold text-blue-950 dark:text-blue-200">
            NPCI &amp; Digital Payment Services — Bank / PSP Channel Routing Only
          </div>
          <p className="text-blue-900 dark:text-blue-300">
            NPCI-related requests (Aadhaar Seeding, UPI Handle, BHIM/FASTag, NACH, AePS, DBT) are routed strictly through the relevant Bank, Payment Service Provider (PSP), or authorized banking correspondent channel. Never collect UPI PIN, ATM PIN, CVV, OTP, or bank passwords.
          </p>
        </div>
      )}

      {activeTab === 'CYBER_CRIME' && (
        <div className="p-4 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="font-bold text-red-900 dark:text-red-200 flex items-center gap-1.5">
              <PhoneCall className="h-4 w-4" />
              National Cyber Crime Reporting Portal &amp; Helpline 1930
            </div>
            <p className="text-red-800 dark:text-red-300">
              For live financial cyber fraud, immediately call Helpline{' '}
              <strong className="font-mono text-sm">1930</strong> or submit on{' '}
              <span className="font-mono font-semibold underline">https://cybercrime.gov.in/</span>. Never store victim OTPs, CVV, PINs, or banking passwords.
            </p>
          </div>
          <div className="shrink-0 font-mono text-xs font-semibold px-3 py-2 rounded bg-white dark:bg-neutral-900 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 flex items-center gap-1.5">
            <ExternalLink className="h-3.5 w-3.5" />
            cybercrime.gov.in · 1930
          </div>
        </div>
      )}

      {/* Search + Services Table */}
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden">
        <div className="p-3.5 border-b border-neutral-200 dark:border-neutral-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${activeTab} services...`}
            className="flex-1 h-9 px-3 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
          />
          <div className="font-mono text-neutral-500">
            Showing {filtered.length} services · {orders.length} active module orders
          </div>
        </div>

        <div className="overflow-x-auto max-h-[520px]">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-neutral-50 dark:bg-neutral-950 sticky top-0 border-b border-neutral-200 dark:border-neutral-800 text-neutral-500">
              <tr>
                <th className="px-4 py-2.5">Code / Sub-Group</th>
                <th className="px-4 py-2.5">Service Name</th>
                <th className="px-4 py-2.5 text-right">Configured Rate</th>
                <th className="px-4 py-2.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {filtered.map((s) => (
                <tr key={s.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40">
                  <td className="px-4 py-2.5">
                    <div className="font-mono text-[11px] text-neutral-500">{s.code}</div>
                    {s.subGroup && <div className="text-[11px] text-neutral-500">{s.subGroup}</div>}
                  </td>
                  <td className="px-4 py-2.5 font-medium text-neutral-950 dark:text-white">{s.name}</td>
                  <td className="px-4 py-2.5 text-right font-mono">
                    {s.rateConfigured && s.totalAmount !== null ? (
                      <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                        {formatINR(s.totalAmount)} ({s.unitType})
                      </span>
                    ) : (
                      <span className="text-amber-700 dark:text-amber-400">Rate Blank (Set in Rate Manager)</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {currentUser.role !== 'CUSTOMER' && onStartOrderForService && s.rateConfigured ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={<ShoppingCart className="h-3 w-3" />}
                        onClick={() => onStartOrderForService(s.id)}
                      >
                        Start Order
                      </Button>
                    ) : (
                      <span className="text-[11px] text-neutral-400">
                        {currentUser.role === 'CUSTOMER' ? 'Ask Counter Operator' : 'Set rate first'}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
