import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Copy,
  Edit3,
  FolderPlus,
  History,
  IndianRupee,
  Lock,
  Plus,
  RefreshCw,
  Search,
  ShoppingCart,
} from 'lucide-react';
import {
  ALL_UNIT_TYPES,
  CscCategory,
  CscRateHistoryEntry,
  CscService,
  UnitType,
} from '../../../shared/cscTypes';
import { Button } from '../../components/Button';
import { Modal } from '../../components/Modal';
import { Pagination } from '../../components/Pagination';
import { UserProfile } from '../../modules/types';
import { paginateArray } from '../../services/apiClient';
import { cscApi } from '../../services/cscApi';
import { formatDateIST, formatDateTimeIST, formatINR } from '../../services/formatters';
import { extractFriendlyErrorMessage } from '../../services/firebase';

interface CscServicesAndRatesPageProps {
  currentUser: UserProfile;
  onStartOrderForService?: (serviceId: string) => void;
  onShowToast: (type: 'success' | 'error' | 'info', title: string, description?: string) => void;
}

export const CscServicesAndRatesPage: React.FC<CscServicesAndRatesPageProps> = ({
  currentUser,
  onStartOrderForService,
  onShowToast,
}) => {
  const [categories, setCategories] = useState<CscCategory[]>([]);
  const [services, setServices] = useState<CscService[]>([]);
  const [rateHistory, setRateHistory] = useState<CscRateHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedCatId, setSelectedCatId] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [rateFilter, setRateFilter] = useState<'ALL' | 'CONFIGURED' | 'BLANK'>('ALL');
  const [activeTab, setActiveTab] = useState<'catalog' | 'rate-history'>('catalog');
  const [page, setPage] = useState(1);

  const isAdmin = currentUser.role === 'ADMIN';
  const canEditRates = isAdmin || Boolean(currentUser.permissions?.['csc.rateEdit']);

  // Modals
  const [rateModalService, setRateModalService] = useState<CscService | null>(null);
  const [rateServiceCharge, setRateServiceCharge] = useState('');
  const [rateGovtFee, setRateGovtFee] = useState('');
  const [rateUnitType, setRateUnitType] = useState<UnitType>('Per Application');
  const [rateEffectiveDate, setRateEffectiveDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [rateReason, setRateReason] = useState('');
  const [savingRate, setSavingRate] = useState(false);
  const [rateError, setRateError] = useState<string | null>(null);

  const [catModalOpen, setCatModalOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<CscCategory | null>(null);
  const [catName, setCatName] = useState('');
  const [catCode, setCatCode] = useState('');
  const [catDesc, setCatDesc] = useState('');
  const [savingCat, setSavingCat] = useState(false);
  const [catError, setCatError] = useState<string | null>(null);

  const [svcModalOpen, setSvcModalOpen] = useState(false);
  const [editingSvc, setEditingSvc] = useState<CscService | null>(null);
  const [svcCatId, setSvcCatId] = useState('');
  const [svcName, setSvcName] = useState('');
  const [svcSubGroup, setSvcSubGroup] = useState('');
  const [svcDesc, setSvcDesc] = useState('');
  const [svcDocs, setSvcDocs] = useState('Aadhaar Card (Masked), Applicant Photo, Mobile Number');
  const [svcAvailability, setSvcAvailability] = useState<'Available' | 'Unavailable'>('Available');
  const [savingSvc, setSavingSvc] = useState(false);
  const [svcError, setSvcError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [catRes, svcRes, histRes] = await Promise.all([
        cscApi.getCategories(),
        cscApi.getServices(),
        cscApi.getRateHistory().catch(() => ({ data: [] as CscRateHistoryEntry[] })),
      ]);
      setCategories(catRes.data);
      setServices(svcRes.data);
      setRateHistory(histRes.data);
    } catch (err) {
      onShowToast('error', 'Failed to load CSC Catalog', extractFriendlyErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [onShowToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredServices = useMemo(() => {
    const q = search.trim().toLowerCase();
    return services.filter((s) => {
      if (selectedCatId !== 'ALL' && s.categoryId !== selectedCatId) return false;
      if (rateFilter === 'CONFIGURED' && !s.rateConfigured) return false;
      if (rateFilter === 'BLANK' && s.rateConfigured) return false;
      if (
        q &&
        !s.name.toLowerCase().includes(q) &&
        !s.code.toLowerCase().includes(q) &&
        !s.categoryName.toLowerCase().includes(q) &&
        !(s.subGroup || '').toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [services, selectedCatId, rateFilter, search]);

  const paginated = useMemo(() => paginateArray(filteredServices, page, 15), [filteredServices, page]);

  const blankCount = useMemo(() => services.filter((s) => !s.rateConfigured).length, [services]);
  const configuredCount = services.length - blankCount;

  const openRateModal = (svc: CscService) => {
    setRateError(null);
    setRateModalService(svc);
    setRateServiceCharge(svc.serviceCharge !== null ? String(svc.serviceCharge) : '');
    setRateGovtFee(svc.govtFee !== null ? String(svc.govtFee) : '0');
    setRateUnitType(svc.unitType || 'Per Application');
    setRateEffectiveDate(svc.effectiveDate || new Date().toISOString().slice(0, 10));
    setRateReason('');
  };

  const handleSaveRate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rateModalService) return;
    setRateError(null);
    const sc = Number(rateServiceCharge);
    const gf = Number(rateGovtFee || 0);
    if (!Number.isFinite(sc) || sc < 0 || !Number.isFinite(gf) || gf < 0) {
      const msg = 'Service Charge and Government Fee must be 0 or greater.';
      setRateError(msg);
      onShowToast('error', 'Invalid Rate', msg);
      return;
    }
    setSavingRate(true);
    try {
      await cscApi.updateServiceRate(rateModalService.id, {
        serviceCharge: sc,
        govtFee: gf,
        unitType: rateUnitType,
        effectiveDate: rateEffectiveDate,
        changeReason: rateReason.trim() || 'Admin Rate Configuration',
      });
      onShowToast(
        'success',
        'Service Rate Saved',
        `${rateModalService.name} set to ${formatINR(sc + gf)} (${rateUnitType}). Prior orders remain immutable.`
      );
      setRateModalService(null);
      await loadData();
    } catch (err) {
      const msg = extractFriendlyErrorMessage(err, 'Unable to update service rate.');
      setRateError(msg);
      onShowToast('error', 'Rate Update Blocked', msg);
    } finally {
      setSavingRate(false);
    }
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    setCatError(null);
    if (!catName.trim() || catName.trim().length < 2) {
      setCatError('Category name must be at least 2 characters.');
      return;
    }
    setSavingCat(true);
    try {
      if (editingCat) {
        await cscApi.updateCategory(editingCat.id, {
          name: catName.trim(),
          code: catCode.trim(),
          description: catDesc.trim(),
        });
        onShowToast('success', 'Category Updated');
      } else {
        await cscApi.createCategory({
          name: catName.trim(),
          code: catCode.trim() || undefined,
          description: catDesc.trim(),
        });
        onShowToast('success', 'Category Created');
      }
      setCatModalOpen(false);
      await loadData();
    } catch (err) {
      const msg = extractFriendlyErrorMessage(err, 'Unable to save category.');
      setCatError(msg);
      onShowToast('error', 'Category Error', msg);
    } finally {
      setSavingCat(false);
    }
  };

  const handleSaveService = async (e: React.FormEvent) => {
    e.preventDefault();
    setSvcError(null);
    if (!svcName.trim() || svcName.trim().length < 2) {
      setSvcError('Service name must be at least 2 characters.');
      return;
    }
    const requiredDocuments = svcDocs
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    setSavingSvc(true);
    try {
      if (editingSvc) {
        await cscApi.updateService(editingSvc.id, {
          name: svcName.trim(),
          subGroup: svcSubGroup.trim(),
          description: svcDesc.trim(),
          requiredDocuments,
          availability: svcAvailability,
        });
        onShowToast('success', 'Service Updated');
      } else {
        await cscApi.createService({
          categoryId: svcCatId || categories[0]?.id || 'CAT-01',
          name: svcName.trim(),
          subGroup: svcSubGroup.trim(),
          description: svcDesc.trim(),
          requiredDocuments,
        });
        onShowToast(
          'success',
          'Service Created (Rate Blank)',
          'New service created with blank rates until Admin configures pricing.'
        );
      }
      setSvcModalOpen(false);
      await loadData();
    } catch (err) {
      const msg = extractFriendlyErrorMessage(err, 'Unable to save service.');
      setSvcError(msg);
      onShowToast('error', 'Service Error', msg);
    } finally {
      setSavingSvc(false);
    }
  };

  const handleDuplicate = async (svc: CscService) => {
    try {
      const res = await cscApi.duplicateService(svc.id);
      onShowToast('success', 'Service Duplicated', `${res.data.name} created with blank rate.`);
      await loadData();
    } catch (err) {
      onShowToast('error', 'Duplicate Failed', extractFriendlyErrorMessage(err));
    }
  };

  const selectedCategoryObj = categories.find((c) => c.id === selectedCatId);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-neutral-950 dark:text-white">
            CSC Services Catalog &amp; Dynamic Rate Manager
          </h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
            {categories.length} Categories · {services.length} Sub-Services ({configuredCount} Rate Set ·{' '}
            {blankCount} Blank/Unconfigured) · All rates start blank until explicitly set by Admin.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div className="inline-flex rounded-md border border-neutral-200 dark:border-neutral-700 overflow-hidden bg-neutral-50 dark:bg-neutral-900">
            <button
              type="button"
              onClick={() => setActiveTab('catalog')}
              className={`px-3 h-8 text-xs font-medium cursor-pointer whitespace-nowrap ${
                activeTab === 'catalog'
                  ? 'bg-neutral-950 text-white dark:bg-white dark:text-neutral-950'
                  : 'text-neutral-600 dark:text-neutral-300'
              }`}
            >
              Service Catalog ({services.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('rate-history')}
              className={`px-3 h-8 text-xs font-medium cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'rate-history'
                  ? 'bg-neutral-950 text-white dark:bg-white dark:text-neutral-950'
                  : 'text-neutral-600 dark:text-neutral-300'
              }`}
            >
              <History className="h-3.5 w-3.5" />
              Rate History ({rateHistory.length})
            </button>
          </div>

          {isAdmin && (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                icon={<FolderPlus className="h-3.5 w-3.5" />}
                onClick={() => {
                  setCatError(null);
                  setEditingCat(null);
                  setCatName('');
                  setCatCode('');
                  setCatDesc('');
                  setCatModalOpen(true);
                }}
              >
                Add Category
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                icon={<Plus className="h-3.5 w-3.5" />}
                onClick={() => {
                  setSvcError(null);
                  setEditingSvc(null);
                  setSvcCatId(selectedCatId !== 'ALL' ? selectedCatId : categories[0]?.id || 'CAT-01');
                  setSvcName('');
                  setSvcSubGroup('');
                  setSvcDesc('');
                  setSvcAvailability('Available');
                  setSvcModalOpen(true);
                }}
              >
                Add Service
              </Button>
            </>
          )}
          <Button variant="outline" size="sm" onClick={loadData} loading={loading} icon={<RefreshCw className="h-3.5 w-3.5" />}>
            Refresh
          </Button>
        </div>
      </div>

      {!canEditRates && (
        <div className="px-4 py-2.5 bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-md flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-300">
          <Lock className="h-4 w-4 text-amber-600 shrink-0" />
          <span>
            Operator Read-Only Rate View: Only ADMIN (or an operator explicitly granted{' '}
            <code className="font-mono">csc.rateEdit</code>) can configure or update service fees.
          </span>
        </div>
      )}

      {activeTab === 'catalog' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* 21 Categories Left Rail */}
          <aside className="lg:col-span-4 xl:col-span-3 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-3 space-y-1 max-h-[760px] overflow-y-auto">
            <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
              Categories ({categories.length})
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedCatId('ALL');
                setPage(1);
              }}
              className={`w-full px-2.5 py-2 rounded-md text-left text-xs flex items-center justify-between cursor-pointer ${
                selectedCatId === 'ALL'
                  ? 'bg-neutral-950 text-white dark:bg-white dark:text-neutral-950 font-semibold'
                  : 'hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300'
              }`}
            >
              <span>All Categories</span>
              <span className="font-mono tabular-nums text-[11px]">{services.length}</span>
            </button>
            {categories.map((cat) => {
              const count = services.filter((s) => s.categoryId === cat.id).length;
              const active = selectedCatId === cat.id;
              return (
                <div key={cat.id} className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCatId(cat.id);
                      setPage(1);
                    }}
                    className={`flex-1 min-w-0 px-2.5 py-2 rounded-md text-left text-xs flex items-center justify-between gap-2 cursor-pointer ${
                      active
                        ? 'bg-neutral-950 text-white dark:bg-white dark:text-neutral-950 font-semibold'
                        : 'hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300'
                    }`}
                  >
                    <span className="truncate">{cat.name}</span>
                    <span className="font-mono tabular-nums text-[11px] shrink-0">{count}</span>
                  </button>
                  {isAdmin && (
                    <button
                      type="button"
                      title="Edit Category"
                      onClick={() => {
                        setCatError(null);
                        setEditingCat(cat);
                        setCatName(cat.name);
                        setCatCode(cat.code);
                        setCatDesc(cat.description);
                        setCatModalOpen(true);
                      }}
                      className="p-1.5 rounded text-neutral-400 hover:text-neutral-950 dark:hover:text-white cursor-pointer shrink-0"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </aside>

          {/* Services Table */}
          <section className="lg:col-span-8 xl:col-span-9 space-y-3">
            {selectedCategoryObj?.noticeText && (
              <div className="px-4 py-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg text-xs text-amber-900 dark:text-amber-200 font-medium">
                Compliance Notice ({selectedCategoryObj.name}): {selectedCategoryObj.noticeText}
              </div>
            )}

            <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-3.5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="relative flex-1">
                <Search className="h-3.5 w-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Search 550+ services by name, code, sub-group..."
                  className="w-full h-9 pl-8 pr-3 text-xs bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded-md"
                />
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {(['ALL', 'CONFIGURED', 'BLANK'] as const).map((rf) => (
                  <button
                    key={rf}
                    type="button"
                    onClick={() => {
                      setRateFilter(rf);
                      setPage(1);
                    }}
                    className={`px-2.5 h-8 rounded text-xs font-medium cursor-pointer whitespace-nowrap ${
                      rateFilter === rf
                        ? 'bg-neutral-950 text-white dark:bg-white dark:text-neutral-950'
                        : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300'
                    }`}
                  >
                    {rf === 'ALL' ? 'All Rates' : rf === 'CONFIGURED' ? 'Rate Set' : 'Blank Rate'}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-neutral-50 dark:bg-neutral-950 border-b border-neutral-200 dark:border-neutral-800 text-neutral-500">
                    <tr>
                      <th className="px-3.5 py-2.5 font-semibold">Code / Service</th>
                      <th className="px-3.5 py-2.5 font-semibold">Category</th>
                      <th className="px-3.5 py-2.5 font-semibold text-right">Service Charge</th>
                      <th className="px-3.5 py-2.5 font-semibold text-right">Govt Fee</th>
                      <th className="px-3.5 py-2.5 font-semibold text-right">Total</th>
                      <th className="px-3.5 py-2.5 font-semibold">Unit Type</th>
                      <th className="px-3.5 py-2.5 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                    {paginated.items.map((svc) => (
                      <tr key={svc.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40">
                        <td className="px-3.5 py-2.5 max-w-xs">
                          <div className="font-mono text-[11px] text-neutral-500">{svc.code}</div>
                          <div className="font-medium text-neutral-950 dark:text-white">{svc.name}</div>
                          {svc.subGroup && (
                            <div className="text-[11px] text-neutral-500">{svc.subGroup}</div>
                          )}
                        </td>
                        <td className="px-3.5 py-2.5 text-neutral-600 dark:text-neutral-300">
                          <div>{svc.categoryName}</div>
                          <div className="text-[11px] text-neutral-400">
                            {svc.availability} · {svc.active ? 'Active' : 'Inactive'}
                          </div>
                        </td>
                        <td className="px-3.5 py-2.5 text-right font-mono tabular-nums">
                          {svc.serviceCharge !== null ? formatINR(svc.serviceCharge) : <span className="text-neutral-400">— Blank</span>}
                        </td>
                        <td className="px-3.5 py-2.5 text-right font-mono tabular-nums">
                          {svc.govtFee !== null ? formatINR(svc.govtFee) : <span className="text-neutral-400">— Blank</span>}
                        </td>
                        <td className="px-3.5 py-2.5 text-right font-mono tabular-nums font-semibold">
                          {svc.rateConfigured && svc.totalAmount !== null ? (
                            <span className="text-emerald-700 dark:text-emerald-400">{formatINR(svc.totalAmount)}</span>
                          ) : (
                            <span className="text-amber-700 dark:text-amber-400 font-normal">Rate Not Set</span>
                          )}
                        </td>
                        <td className="px-3.5 py-2.5 text-neutral-600 dark:text-neutral-300 whitespace-nowrap">
                          {svc.unitType || '—'}
                        </td>
                        <td className="px-3.5 py-2.5 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            {canEditRates && (
                              <Button
                                variant={svc.rateConfigured ? 'outline' : 'primary'}
                                size="sm"
                                onClick={() => openRateModal(svc)}
                                icon={<IndianRupee className="h-3 w-3" />}
                              >
                                {svc.rateConfigured ? 'Edit Rate' : 'Set Rate'}
                              </Button>
                            )}
                            {isAdmin && (
                              <>
                                <button
                                  type="button"
                                  title="Edit Service Details"
                                  onClick={() => {
                                    setSvcError(null);
                                    setEditingSvc(svc);
                                    setSvcCatId(svc.categoryId);
                                    setSvcName(svc.name);
                                    setSvcSubGroup(svc.subGroup || '');
                                    setSvcDesc(svc.description);
                                    setSvcDocs(svc.requiredDocuments.join(', '));
                                    setSvcAvailability(svc.availability);
                                    setSvcModalOpen(true);
                                  }}
                                  className="p-1.5 rounded border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
                                >
                                  <Edit3 className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  title="Duplicate Service (Starts with Blank Rate)"
                                  onClick={() => handleDuplicate(svc)}
                                  className="p-1.5 rounded border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
                                >
                                  <Copy className="h-3.5 w-3.5" />
                                </button>
                              </>
                            )}
                            {onStartOrderForService && svc.rateConfigured && (
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => onStartOrderForService(svc.id)}
                                icon={<ShoppingCart className="h-3 w-3" />}
                              >
                                Order
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {paginated.items.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-4 py-10 text-center text-neutral-500">
                          No matching CSC services found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-3 border-t border-neutral-100 dark:border-neutral-800">
                <Pagination
                  pagination={paginated.pagination}
                  onPageChange={setPage}
                />
              </div>
            </div>
          </section>
        </div>
      ) : (
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-neutral-950 dark:text-white">
              Immutable Rate Change Audit Log
            </h3>
            <span className="text-xs text-neutral-500">
              Historical orders retain original snapshots automatically
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-neutral-50 dark:bg-neutral-950 border-b border-neutral-200 dark:border-neutral-800 text-neutral-500">
                <tr>
                  <th className="px-3.5 py-2.5">Date</th>
                  <th className="px-3.5 py-2.5">Service</th>
                  <th className="px-3.5 py-2.5 text-right">Old Total</th>
                  <th className="px-3.5 py-2.5 text-right">New Total</th>
                  <th className="px-3.5 py-2.5">Unit Type</th>
                  <th className="px-3.5 py-2.5">Admin</th>
                  <th className="px-3.5 py-2.5">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {rateHistory.map((h) => (
                  <tr key={h.id}>
                    <td className="px-3.5 py-2.5 font-mono text-neutral-500 whitespace-nowrap">
                      {formatDateTimeIST(h.changedAt)}
                    </td>
                    <td className="px-3.5 py-2.5">
                      <div className="font-medium text-neutral-950 dark:text-white">{h.serviceName}</div>
                      <div className="text-[11px] font-mono text-neutral-500">
                        {h.serviceCode} · {h.categoryName}
                      </div>
                    </td>
                    <td className="px-3.5 py-2.5 text-right font-mono tabular-nums text-neutral-500">
                      {h.oldTotalAmount !== null ? formatINR(h.oldTotalAmount) : 'Blank'}
                    </td>
                    <td className="px-3.5 py-2.5 text-right font-mono tabular-nums font-semibold text-emerald-700 dark:text-emerald-400">
                      {formatINR(h.newTotalAmount)}
                    </td>
                    <td className="px-3.5 py-2.5 whitespace-nowrap">{h.newUnitType}</td>
                    <td className="px-3.5 py-2.5 font-mono">{h.adminId}</td>
                    <td className="px-3.5 py-2.5 text-neutral-600 dark:text-neutral-300">
                      {h.changeReason} (Eff. {formatDateIST(h.effectiveDate)})
                    </td>
                  </tr>
                ))}
                {rateHistory.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-neutral-500">
                      No rate updates recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Dynamic Rate Configuration Modal */}
      <Modal
        isOpen={Boolean(rateModalService)}
        onClose={() => {
          setRateError(null);
          setRateModalService(null);
        }}
        title={`Configure Rate — ${rateModalService?.name || ''}`}
      >
        <form onSubmit={handleSaveRate} className="space-y-4 text-xs" noValidate>
          {rateError && (
            <div role="alert" className="px-3 py-2 rounded border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300">
              {rateError}
            </div>
          )}
          <div className="p-3 rounded bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800">
            <div className="font-mono text-[11px] text-neutral-500">
              {rateModalService?.code} · {rateModalService?.categoryName}
            </div>
            <div className="mt-1 text-neutral-700 dark:text-neutral-300">
              Total Amount = Service Charge + Government Fee. Updating rate applies only to future orders.
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-medium mb-1">Service Charge (INR ₹) *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={rateServiceCharge}
                onChange={(e) => setRateServiceCharge(e.target.value)}
                placeholder="e.g. 50"
                className="w-full h-9 px-3 font-mono bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Government Fee (INR ₹) *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={rateGovtFee}
                onChange={(e) => setRateGovtFee(e.target.value)}
                placeholder="0"
                className="w-full h-9 px-3 font-mono bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
              />
            </div>
          </div>

          <div className="p-3 rounded bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 flex items-center justify-between">
            <span className="font-medium text-emerald-900 dark:text-emerald-200">
              Computed Total Amount
            </span>
            <span className="text-base font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-300">
              {formatINR((Number(rateServiceCharge) || 0) + (Number(rateGovtFee) || 0))}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-medium mb-1">Unit Type *</label>
              <select
                value={rateUnitType}
                onChange={(e) => setRateUnitType(e.target.value as UnitType)}
                className="w-full h-9 px-2.5 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
              >
                {ALL_UNIT_TYPES.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-medium mb-1">Effective Date *</label>
              <input
                type="date"
                required
                value={rateEffectiveDate}
                onChange={(e) => setRateEffectiveDate(e.target.value)}
                className="w-full h-9 px-2.5 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
              />
            </div>
          </div>

          <div>
            <label className="block font-medium mb-1">Change Reason</label>
            <input
              type="text"
              value={rateReason}
              onChange={(e) => setRateReason(e.target.value)}
              placeholder="e.g. Standard center tariff effective Nov 2026"
              className="w-full h-9 px-3 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setRateModalService(null)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" loading={savingRate}>
              Save Dynamic Rate
            </Button>
          </div>
        </form>
      </Modal>

      {/* Category Modal */}
      <Modal
        isOpen={catModalOpen}
        onClose={() => {
          setCatError(null);
          setCatModalOpen(false);
        }}
        title={editingCat ? 'Edit Category' : 'Add Service Category'}
      >
        <form onSubmit={handleSaveCategory} className="space-y-3 text-xs" noValidate>
          {catError && (
            <div role="alert" className="px-3 py-2 rounded border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300">
              {catError}
            </div>
          )}
          <div>
            <label className="block font-medium mb-1">Category Name *</label>
            <input
              type="text"
              required
              value={catName}
              onChange={(e) => {
                setCatError(null);
                setCatName(e.target.value);
              }}
              className="w-full h-9 px-3 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
            />
          </div>
          <div>
            <label className="block font-medium mb-1">Category Code</label>
            <input
              type="text"
              value={catCode}
              onChange={(e) => setCatCode(e.target.value)}
              placeholder="Optional auto-generated"
              className="w-full h-9 px-3 font-mono bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
            />
          </div>
          <div>
            <label className="block font-medium mb-1">Description</label>
            <textarea
              rows={3}
              value={catDesc}
              onChange={(e) => setCatDesc(e.target.value)}
              className="w-full p-2.5 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setCatError(null);
                setCatModalOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" loading={savingCat}>
              Save Category
            </Button>
          </div>
        </form>
      </Modal>

      {/* Service Modal */}
      <Modal
        isOpen={svcModalOpen}
        onClose={() => {
          setSvcError(null);
          setSvcModalOpen(false);
        }}
        title={editingSvc ? 'Edit CSC Service' : 'Create CSC Service (Starts with Blank Rate)'}
      >
        <form onSubmit={handleSaveService} className="space-y-3 text-xs" noValidate>
          {svcError && (
            <div role="alert" className="px-3 py-2 rounded border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300">
              {svcError}
            </div>
          )}
          {!editingSvc && (
            <div>
              <label className="block font-medium mb-1">Category *</label>
              <select
                value={svcCatId}
                onChange={(e) => setSvcCatId(e.target.value)}
                className="w-full h-9 px-2.5 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="block font-medium mb-1">Service Name *</label>
            <input
              type="text"
              required
              value={svcName}
              onChange={(e) => {
                setSvcError(null);
                setSvcName(e.target.value);
              }}
              className="w-full h-9 px-3 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
            />
          </div>
          <div>
            <label className="block font-medium mb-1">Sub-Group (Optional)</label>
            <input
              type="text"
              value={svcSubGroup}
              onChange={(e) => setSvcSubGroup(e.target.value)}
              className="w-full h-9 px-3 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
            />
          </div>
          <div>
            <label className="block font-medium mb-1">Required Documents (comma-separated)</label>
            <input
              type="text"
              value={svcDocs}
              onChange={(e) => setSvcDocs(e.target.value)}
              className="w-full h-9 px-3 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
            />
          </div>
          {editingSvc && (
            <div>
              <label className="block font-medium mb-1">Availability</label>
              <select
                value={svcAvailability}
                onChange={(e) => setSvcAvailability(e.target.value as 'Available' | 'Unavailable')}
                className="w-full h-9 px-2.5 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
              >
                <option value="Available">Available</option>
                <option value="Unavailable">Unavailable</option>
              </select>
            </div>
          )}
          <div>
            <label className="block font-medium mb-1">Description</label>
            <textarea
              rows={2}
              value={svcDesc}
              onChange={(e) => setSvcDesc(e.target.value)}
              className="w-full p-2.5 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setSvcError(null);
                setSvcModalOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" loading={savingSvc}>
              {editingSvc ? 'Update Service' : 'Create (Rate Blank)'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
