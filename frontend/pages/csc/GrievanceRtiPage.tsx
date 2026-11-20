import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FileText, MessageSquarePlus, Plus, RefreshCw } from 'lucide-react';
import {
  ALL_GRIEVANCE_STATUSES,
  GRIEVANCE_SERVICE_TYPES,
  GrievanceRecord,
  GrievanceServiceType,
  GrievanceStatus,
} from '../../../shared/cscTypes';
import { Button } from '../../components/Button';
import { Modal } from '../../components/Modal';
import { MobileNumberInput } from '../../components/MobileNumberInput';
import { StatusText } from '../../components/StatusText';
import { UserProfile } from '../../modules/types';
import { cscApi } from '../../services/cscApi';
import { formatDateIST, formatINR } from '../../services/formatters';
import { extractFriendlyErrorMessage } from '../../services/firebase';

interface GrievanceRtiPageProps {
  currentUser: UserProfile;
  onShowToast: (type: 'success' | 'error' | 'info', title: string, description?: string) => void;
}

export const GrievanceRtiPage: React.FC<GrievanceRtiPageProps> = ({ currentUser, onShowToast }) => {
  const [grievances, setGrievances] = useState<GrievanceRecord[]>([]);
  const [grievanceServiceNames, setGrievanceServiceNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [search, setSearch] = useState('');

  // Create Modal
  const [createOpen, setCreateOpen] = useState(false);
  const [savingCreate, setSavingCreate] = useState(false);
  const [savingUpdate, setSavingUpdate] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [custName, setCustName] = useState('');
  const [custMobile, setCustMobile] = useState('');
  const [district, setDistrict] = useState('North 24 Parganas');
  const [blockMun, setBlockMun] = useState('');
  const [category, setCategory] = useState('CPGRAMS Central Public Grievance');
  const [serviceType, setServiceType] = useState<GrievanceServiceType>('Online Grievance Filing Assistance');
  const [department, setDepartment] = useState('');
  const [authority, setAuthority] = useState('');
  const [subject, setSubject] = useState('');
  const [details, setDetails] = useState('');
  const [isRti, setIsRti] = useState(false);
  const [rtiType, setRtiType] = useState<GrievanceRecord['rtiType']>('Central RTI');
  const [pioName, setPioName] = useState('');
  const [faaName, setFaaName] = useState('');
  const [serviceCharge, setServiceCharge] = useState('0');
  const [govtFee, setGovtFee] = useState('0');
  const [paidAmount, setPaidAmount] = useState('0');
  const [followUpDate, setFollowUpDate] = useState(() => new Date().toISOString().slice(0, 10));

  // Selected Dossier Update
  const [selected, setSelected] = useState<GrievanceRecord | null>(null);
  const [nextStatus, setNextStatus] = useState<GrievanceStatus>('Under Process');
  const [externalAckNo, setExternalAckNo] = useState('');
  const [replySummary, setReplySummary] = useState('');
  const [followUpNote, setFollowUpNote] = useState('');
  const [paymentAdd, setPaymentAdd] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [grvRes, svcRes] = await Promise.all([
        cscApi.getGrievances(),
        cscApi.getServices({ moduleTag: 'GRIEVANCE' }),
      ]);
      const rtiSvcRes = await cscApi.getServices({ moduleTag: 'RTI' });
      const names = Array.from(new Set([...svcRes.data, ...rtiSvcRes.data].map((s) => s.name)));
      setGrievanceServiceNames(names);
      if (names.length > 0 && !category) setCategory(names[0]);
      setGrievances(grvRes.data);
      if (selected) {
        const ref = grvRes.data.find((g) => g.internalTrackingId === selected.internalTrackingId);
        if (ref) setSelected(ref);
      }
    } catch (err) {
      onShowToast('error', 'Failed to load Grievances', extractFriendlyErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [onShowToast]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return grievances.filter((g) => {
      if (statusFilter !== 'ALL' && g.complaintStatus !== statusFilter) return false;
      if (
        q &&
        !g.internalTrackingId.toLowerCase().includes(q) &&
        !g.customerName.toLowerCase().includes(q) &&
        !g.complaintSubject.toLowerCase().includes(q) &&
        !g.department.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [grievances, statusFilter, search]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    if (!custName.trim() || custMobile.trim().length < 10 || !department.trim() || !subject.trim()) {
      const msg = 'Applicant Name, 10-digit Mobile, Department, and Subject are required.';
      setCreateError(msg);
      onShowToast('error', 'Validation Failed', msg);
      return;
    }
    setSavingCreate(true);
    try {
      const res = await cscApi.createGrievance({
        customerName: custName.trim(),
        mobile: custMobile.trim(),
        district: district.trim(),
        blockOrMunicipality: blockMun.trim(),
        complaintCategory: category,
        serviceType,
        department: department.trim(),
        authority: authority.trim(),
        complaintSubject: subject.trim(),
        complaintDetails: details.trim(),
        isRti,
        rtiType: isRti ? rtiType : undefined,
        pioName: isRti ? pioName.trim() : undefined,
        faaName: isRti ? faaName.trim() : undefined,
        serviceCharge: Number(serviceCharge || 0),
        govtFee: Number(govtFee || 0),
        paidAmount: Number(paidAmount || 0),
        followUpDate,
      });
      onShowToast('success', 'Dossier Registered', res.data.internalTrackingId);
      setCreateOpen(false);
      setSubject('');
      setDetails('');
      setSelected(res.data);
      await loadData();
    } catch (err) {
      const msg = extractFriendlyErrorMessage(err, 'Unable to register dossier.');
      setCreateError(msg);
      onShowToast('error', 'Registration Failed', msg);
    } finally {
      setSavingCreate(false);
    }
  };

  const handleUpdateDossier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    setSavingUpdate(true);
    try {
      const res = await cscApi.updateGrievanceStatus(selected.internalTrackingId, {
        complaintStatus: nextStatus,
        externalAckNo: externalAckNo || undefined,
        replySummary: replySummary || undefined,
        followUpNote: followUpNote || undefined,
        paymentAmount: paymentAdd ? Number(paymentAdd) : undefined,
      });
      setSelected(res.data);
      setFollowUpNote('');
      setPaymentAdd('');
      onShowToast('success', 'Grievance / RTI Updated', `${res.data.internalTrackingId} → ${res.data.complaintStatus}`);
      await loadData();
    } catch (err) {
      onShowToast('error', 'Update Failed', extractFriendlyErrorMessage(err));
    } finally {
      setSavingUpdate(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-neutral-950 dark:text-white">
            Public Grievance, CPGRAMS &amp; RTI Assistance Tracker
          </h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
            90+ Grievance Categories · 6 Service Types · 11 Workflow Statuses · Advisory filing assistance only (official resolution rests with authority).
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            type="button"
            variant="primary"
            size="sm"
            icon={<Plus className="h-3.5 w-3.5" />}
            onClick={() => {
              setCreateError(null);
              setCreateOpen(true);
            }}
          >
            New Grievance / RTI Dossier
          </Button>
          <Button variant="outline" size="sm" onClick={loadData} loading={loading} icon={<RefreshCw className="h-3.5 w-3.5" />}>
            Refresh
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-3.5 flex flex-col sm:flex-row gap-3 text-xs">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search Tracking ID, Applicant, Department, Subject..."
          className="flex-1 h-9 px-3 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-9 px-2.5 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
        >
          <option value="ALL">All 11 Grievance Statuses</option>
          {ALL_GRIEVANCE_STATUSES.map((st) => (
            <option key={st} value={st}>
              {st}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <div className={`${selected ? 'lg:col-span-7' : 'lg:col-span-12'} bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden`}>
          <table className="w-full text-left text-xs">
            <thead className="bg-neutral-50 dark:bg-neutral-950 border-b border-neutral-200 dark:border-neutral-800 text-neutral-500">
              <tr>
                <th className="px-3.5 py-2.5">Tracking ID / Applicant</th>
                <th className="px-3.5 py-2.5">Category &amp; Dept</th>
                <th className="px-3.5 py-2.5">Status</th>
                <th className="px-3.5 py-2.5 text-right">Due</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {filtered.map((g) => (
                <tr
                  key={g.internalTrackingId}
                  onClick={() => {
                    setSelected(g);
                    setNextStatus(g.complaintStatus);
                    setExternalAckNo(g.externalAckNo || '');
                    setReplySummary(g.replySummary || '');
                  }}
                  className={`cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800/40 ${
                    selected?.internalTrackingId === g.internalTrackingId ? 'bg-neutral-100/80 dark:bg-neutral-800/60' : ''
                  }`}
                >
                  <td className="px-3.5 py-2.5">
                    <div className="font-mono font-semibold text-neutral-950 dark:text-white">
                      {g.internalTrackingId} {g.isRti ? '· RTI' : ''}
                    </div>
                    <div>{g.customerName}</div>
                    <div className="font-mono text-[11px] text-neutral-500">{g.mobile}</div>
                  </td>
                  <td className="px-3.5 py-2.5">
                    <div className="font-medium text-neutral-950 dark:text-white">{g.complaintSubject}</div>
                    <div className="text-[11px] text-neutral-500">
                      {g.complaintCategory} · {g.department}
                    </div>
                  </td>
                  <td className="px-3.5 py-2.5">
                    <StatusText status={g.complaintStatus} />
                    <div className="text-[11px] font-mono text-neutral-500 mt-0.5">
                      Follow-up: {formatDateIST(g.followUpDate)}
                    </div>
                  </td>
                  <td className="px-3.5 py-2.5 text-right font-mono tabular-nums">
                    <div>{formatINR(g.totalAmount)}</div>
                    <div className="text-[11px] text-amber-700">Due {formatINR(g.remainingDue)}</div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-neutral-500">
                    No grievances or RTI applications logged yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {selected && (
          <form
            onSubmit={handleUpdateDossier}
            className="lg:col-span-5 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-4 space-y-3 text-xs"
          >
            <div className="flex items-start justify-between border-b border-neutral-200 dark:border-neutral-800 pb-2">
              <div>
                <div className="font-mono font-bold text-sm">{selected.internalTrackingId}</div>
                <div className="text-neutral-600 dark:text-neutral-300">
                  {selected.serviceType} · {selected.department}
                </div>
              </div>
              <button type="button" onClick={() => setSelected(null)} className="text-neutral-500 cursor-pointer">
                Close
              </button>
            </div>

            <div className="p-2.5 rounded bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800">
              <div className="font-semibold">{selected.complaintSubject}</div>
              <p className="mt-1 text-neutral-600 dark:text-neutral-400">{selected.complaintDetails}</p>
              {selected.isRti && (
                <div className="mt-1.5 font-mono text-[11px] text-blue-800 dark:text-blue-400">
                  {selected.rtiType} · PIO: {selected.pioName || '—'} · FAA: {selected.faaName || '—'}
                </div>
              )}
            </div>

            {currentUser.role !== 'CUSTOMER' && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block font-medium mb-1">Workflow Status (11 Stages)</label>
                    <select
                      value={nextStatus}
                      onChange={(e) => setNextStatus(e.target.value as GrievanceStatus)}
                      className="w-full h-8 px-2 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
                    >
                      {ALL_GRIEVANCE_STATUSES.map((st) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-medium mb-1">Portal Ack / Docket No.</label>
                    <input
                      type="text"
                      value={externalAckNo}
                      onChange={(e) => setExternalAckNo(e.target.value)}
                      className="w-full h-8 px-2 font-mono bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-medium mb-1">Reply Summary / Outcome Notes</label>
                  <input
                    type="text"
                    value={replySummary}
                    onChange={(e) => setReplySummary(e.target.value)}
                    placeholder="Department reply / PIO response summary..."
                    className="w-full h-8 px-2 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={followUpNote}
                    onChange={(e) => setFollowUpNote(e.target.value)}
                    placeholder="Add follow-up note..."
                    className="h-8 px-2 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={paymentAdd}
                    onChange={(e) => setPaymentAdd(e.target.value)}
                    placeholder={`Collect Due (${formatINR(selected.remainingDue)})`}
                    className="h-8 px-2 font-mono bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
                  />
                </div>

                <Button type="submit" variant="primary" size="sm" loading={savingUpdate} className="w-full" icon={<MessageSquarePlus className="h-3.5 w-3.5" />}>
                  Save Dossier Update
                </Button>
              </>
            )}

            {selected.followUps.length > 0 && (
              <div className="space-y-1 pt-2 border-t border-neutral-200 dark:border-neutral-800">
                <div className="font-semibold flex items-center gap-1">
                  <FileText className="h-3.5 w-3.5" /> Follow-up Log ({selected.followUps.length})
                </div>
                {selected.followUps.map((f) => (
                  <div key={f.id} className="text-[11px] text-neutral-600 dark:text-neutral-400">
                    <span className="font-mono">{formatDateIST(f.followUpDate)}</span>: {f.notes}
                  </div>
                ))}
              </div>
            )}
          </form>
        )}
      </div>

      {/* Create Grievance / RTI Modal */}
      <Modal
        isOpen={createOpen}
        onClose={() => {
          setCreateError(null);
          setCreateOpen(false);
        }}
        title="Register Public Grievance / RTI / Appeal"
        maxWidthClass="max-w-3xl"
      >
        <form onSubmit={handleCreate} className="space-y-3 text-xs" noValidate>
          {createError && (
            <div role="alert" className="px-3 py-2 rounded border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300">
              {createError}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="text"
              required
              value={custName}
              onChange={(e) => setCustName(e.target.value)}
              placeholder="Applicant Full Name *"
              className="h-9 px-2.5 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
            />
            <MobileNumberInput
              required
              value={custMobile}
              onChange={setCustMobile}
              aria-label="Applicant mobile number"
            />
            <input
              type="text"
              value={district}
              onChange={(e) => setDistrict(e.target.value)}
              placeholder="District"
              className="h-9 px-2.5 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
            />
            <input
              type="text"
              value={blockMun}
              onChange={(e) => setBlockMun(e.target.value)}
              placeholder="Block / Municipality"
              className="h-9 px-2.5 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-medium mb-1">Grievance Category (90+ Catalog)</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full h-9 px-2 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
              >
                {grievanceServiceNames.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-medium mb-1">Assistance Service Type</label>
              <select
                value={serviceType}
                onChange={(e) => setServiceType(e.target.value as GrievanceServiceType)}
                className="w-full h-9 px-2 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
              >
                {GRIEVANCE_SERVICE_TYPES.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="text"
              required
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              placeholder="Concerned Department *"
              className="h-9 px-2.5 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
            />
            <input
              type="text"
              value={authority}
              onChange={(e) => setAuthority(e.target.value)}
              placeholder="Public Authority / Office"
              className="h-9 px-2.5 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
            />
          </div>

          <input
            type="text"
            required
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Complaint / RTI Subject *"
            className="w-full h-9 px-2.5 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
          />
          <textarea
            rows={3}
            required
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            placeholder="Full grievance facts / RTI information sought (Aadhaar auto-masked, never enter OTP/PIN)..."
            className="w-full p-2.5 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
          />

          <label className="inline-flex items-center gap-2 font-medium cursor-pointer">
            <input type="checkbox" checked={isRti} onChange={(e) => setIsRti(e.target.checked)} />
            <span>This is an RTI Act 2005 Application / First-Second Appeal</span>
          </label>

          {isRti && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 p-2.5 rounded bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800">
              <select
                value={rtiType}
                onChange={(e) => setRtiType(e.target.value as GrievanceRecord['rtiType'])}
                className="h-8 px-2 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded"
              >
                <option value="Central RTI">Central RTI</option>
                <option value="West Bengal RTI">West Bengal RTI</option>
                <option value="First Appeal">First Appeal</option>
                <option value="Second Appeal">Second Appeal</option>
                <option value="PIO Application">PIO Application</option>
              </select>
              <input
                type="text"
                value={pioName}
                onChange={(e) => setPioName(e.target.value)}
                placeholder="PIO Office / Name"
                className="h-8 px-2 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded"
              />
              <input
                type="text"
                value={faaName}
                onChange={(e) => setFaaName(e.target.value)}
                placeholder="First Appellate Authority"
                className="h-8 px-2 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded"
              />
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div>
              <label className="block mb-1">Service Charge ₹</label>
              <input
                type="number"
                min="0"
                value={serviceCharge}
                onChange={(e) => setServiceCharge(e.target.value)}
                className="w-full h-8 px-2 font-mono bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
              />
            </div>
            <div>
              <label className="block mb-1">Govt Fee ₹</label>
              <input
                type="number"
                min="0"
                value={govtFee}
                onChange={(e) => setGovtFee(e.target.value)}
                className="w-full h-8 px-2 font-mono bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
              />
            </div>
            <div>
              <label className="block mb-1">Paid Now ₹</label>
              <input
                type="number"
                min="0"
                value={paidAmount}
                onChange={(e) => setPaidAmount(e.target.value)}
                className="w-full h-8 px-2 font-mono bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
              />
            </div>
            <div>
              <label className="block mb-1">Follow-up Date</label>
              <input
                type="date"
                value={followUpDate}
                onChange={(e) => setFollowUpDate(e.target.value)}
                className="w-full h-8 px-2 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setCreateError(null);
                setCreateOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" loading={savingCreate}>
              Register Dossier
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
