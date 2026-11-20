import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Database,
  Edit3,
  FileText,
  Filter,
  FolderTree,
  Layers,
  Plus,
  Power,
  Search,
  Settings2,
  Trash2,
  Zap,
} from 'lucide-react';
import {
  DynamicFieldType,
  DynamicFormFieldDef,
  ErpServiceItem,
  ServiceCategoryItem,
  ServiceSubcategoryItem,
  UserProfile,
} from '../../modules/types';
import { erpApi } from '../../services/erpApi';
import { Button } from '../../components/Button';
import { Modal } from '../../components/Modal';
import { MobileNumberInput } from '../../components/MobileNumberInput';
import { formatCurrency } from '../../services/apiClient';
import { extractFriendlyErrorMessage } from '../../services/firebase';

interface ServicesCatalogPageProps {
  currentUser: UserProfile;
  onStartApplicationForService: (serviceId: string) => void;
  onShowToast: (type: 'success' | 'error' | 'info', title: string, description?: string) => void;
}

const ALL_FIELD_TYPES: Array<{ value: DynamicFieldType; label: string }> = [
  { value: 'short_text', label: 'Short Text' },
  { value: 'long_text', label: 'Long Text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'mobile', label: 'Mobile Number' },
  { value: 'email', label: 'Email' },
  { value: 'dropdown', label: 'Dropdown' },
  { value: 'radio', label: 'Radio Selection' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'multi_select', label: 'Multi-Select' },
  { value: 'file_upload', label: 'File / Document Upload' },
  { value: 'aadhaar', label: 'Aadhaar Number (Masked)' },
  { value: 'pan', label: 'PAN Card Number' },
  { value: 'address', label: 'Postal Address' },
];

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export const ServicesCatalogPage: React.FC<ServicesCatalogPageProps> = ({
  currentUser,
  onStartApplicationForService,
  onShowToast,
}) => {
  const isAdmin =
    currentUser.role === 'ADMIN' ||
    currentUser.role === 'MANAGER' ||
    Boolean(currentUser.isMasterAdmin);
  const [services, setServices] = useState<ErpServiceItem[]>([]);
  const [categories, setCategories] = useState<ServiceCategoryItem[]>([]);
  const [subcategories, setSubcategories] = useState<ServiceSubcategoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncingCatalog, setSyncingCatalog] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const autoSyncAttemptedRef = useRef(false);
  const loadingRef = useRef(true);
  const syncingCatalogRef = useRef(false);

  // Filtering & Pagination state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('ALL');
  const [selectedSubcategoryFilter, setSelectedSubcategoryFilter] = useState<string>('ALL');
  const [rateFilter, setRateFilter] = useState<'ALL' | 'CONFIGURED' | 'BLANK'>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'Active' | 'Inactive'>('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;

  // Selected Service for Configuration & Builder
  const [selectedService, setSelectedService] = useState<ErpServiceItem | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<'form' | 'docs' | 'sla' | 'automation' | 'pricing'>('form');

  // Modals & Form Submit States
  const [newServiceOpen, setNewServiceOpen] = useState(false);
  const [newCatOpen, setNewCatOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<ServiceCategoryItem | null>(null);
  const [newSubOpen, setNewSubOpen] = useState(false);
  const [applyModalOpen, setApplyModalOpen] = useState(false);
  const [applyingService, setApplyingService] = useState<ErpServiceItem | null>(null);
  const [savingCat, setSavingCat] = useState(false);
  const [savingSub, setSavingSub] = useState(false);
  const [savingSrv, setSavingSrv] = useState(false);
  const [savingPricing, setSavingPricing] = useState(false);
  const [savingSla, setSavingSla] = useState(false);
  const [publishingForm, setPublishingForm] = useState(false);
  const [togglingStatus, setTogglingStatus] = useState(false);
  const [catError, setCatError] = useState<string | null>(null);
  const [subError, setSubError] = useState<string | null>(null);
  const [srvError, setSrvError] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);

  // Apply Service form state
  const [applyCustName, setApplyCustName] = useState('');
  const [applyCustMobile, setApplyCustMobile] = useState('');
  const [applyVillage, setApplyVillage] = useState('');
  const [applyFormData, setApplyFormData] = useState<Record<string, string>>({});
  const [submittingApp, setSubmittingApp] = useState(false);

  // Category & Subcategory Forms
  const [catForm, setCatForm] = useState({ name: '', description: '' });
  const [subForm, setSubForm] = useState({ categoryId: 1, name: '', description: '' });

  // Service Creation Form (serviceCode strictly system-generated)
  const [srvForm, setSrvForm] = useState({
    name: '',
    categoryId: 1,
    subcategoryId: '' as string | number,
    serviceCharge: 0,
    govtFee: 0,
    additionalCharges: 0,
    serviceCost: 0,
    description: '',
    serviceInstructions: '',
    expectedDays: 3,
  });

  // Dynamic Form Builder draft fields
  const [draftFields, setDraftFields] = useState<DynamicFormFieldDef[]>([]);
  const [newField, setNewField] = useState<{
    label: string;
    fieldKey: string;
    fieldType: DynamicFieldType;
    required: boolean;
    optionsCsv: string;
  }>({
    label: '',
    fieldKey: '',
    fieldType: 'short_text',
    required: true,
    optionsCsv: '',
  });

  // Service Details + Pricing edit buffer
  const [editName, setEditName] = useState('');
  const [editCategoryId, setEditCategoryId] = useState(1);
  const [editSubcategoryId, setEditSubcategoryId] = useState<string | number>('');
  const [editDescription, setEditDescription] = useState('');
  const [editInstructions, setEditInstructions] = useState('');
  const [editServiceCharge, setEditServiceCharge] = useState(0);
  const [editGovtFee, setEditGovtFee] = useState(0);
  const [editAdditionalCharges, setEditAdditionalCharges] = useState(0);
  const [editCost, setEditCost] = useState(0);
  const [editStatus, setEditStatus] = useState<ErpServiceItem['status']>('Active');
  const [editAvailability, setEditAvailability] = useState<ErpServiceItem['availability']>('Available');

  // SLA edit buffer
  const [editSlaMode, setEditSlaMode] = useState<'FIXED' | 'RANGE'>('FIXED');
  const [editSlaExpected, setEditSlaExpected] = useState(3);
  const [editSlaMin, setEditSlaMin] = useState(1);
  const [editSlaMax, setEditSlaMax] = useState(5);
  const [editSlaDayType, setEditSlaDayType] = useState<'CALENDAR' | 'WORKING'>('WORKING');

  // Delete Service State & Modal
  const [deleteServiceModalOpen, setDeleteServiceModalOpen] = useState(false);
  const [serviceToDelete, setServiceToDelete] = useState<ErpServiceItem | null>(null);
  const [deletingService, setDeletingService] = useState(false);

  const selectedServiceRef = useRef<ErpServiceItem | null>(null);
  useEffect(() => {
    selectedServiceRef.current = selectedService;
  }, [selectedService]);

  const populateDetailBuffers = useCallback((svc: ErpServiceItem) => {
    const activeVer =
      svc.formVersions.find((v) => v.versionNo === svc.currentFormVersion) ??
      svc.formVersions[svc.formVersions.length - 1];
    setDraftFields(activeVer ? [...activeVer.fields] : []);
    setEditName(svc.name);
    setEditCategoryId(svc.categoryId);
    setEditSubcategoryId(svc.subcategoryId ?? '');
    setEditDescription(svc.description || '');
    setEditInstructions(svc.serviceInstructions || svc.termsAndConditions || '');
    setEditServiceCharge(svc.serviceCharge ?? svc.customerCharge ?? 0);
    setEditGovtFee(svc.govtFee ?? 0);
    setEditAdditionalCharges(svc.additionalCharges ?? 0);
    setEditCost(svc.serviceCost ?? 0);
    setEditStatus(svc.status);
    setEditAvailability(svc.availability);
    setEditSlaMode(svc.sla?.processingMode || 'FIXED');
    setEditSlaExpected(svc.sla?.expectedDays ?? 3);
    setEditSlaMin(svc.sla?.minDays ?? 1);
    setEditSlaMax(svc.sla?.maxDays ?? 5);
    setEditSlaDayType(svc.sla?.dayType || 'WORKING');
  }, []);

  const selectService = useCallback(
    (svc: ErpServiceItem | null) => {
      setSelectedService(svc);
      if (svc) {
        populateDetailBuffers(svc);
      } else {
        setDraftFields([]);
      }
    },
    [populateDetailBuffers]
  );

  const syncSelectionFromList = useCallback(
    (list: ErpServiceItem[], forceRefreshBuffers = false) => {
      const current = selectedServiceRef.current;
      const target = current
        ? list.find((s) => s.serviceId === current.serviceId) ?? list[0] ?? null
        : list[0] ?? null;

      setSelectedService(target);
      if (target && (forceRefreshBuffers || !current || current.serviceId !== target.serviceId)) {
        populateDetailBuffers(target);
      } else if (!target) {
        setDraftFields([]);
      }
    },
    [populateDetailBuffers]
  );

  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  useEffect(() => {
    syncingCatalogRef.current = syncingCatalog;
  }, [syncingCatalog]);

  const loadAll = useCallback(
    async (forceRefreshBuffers = true) => {
      setLoading(true);
      loadingRef.current = true;
      setSyncError(null);
      try {
        let [sRes, cRes, subRes] = await Promise.all([
          erpApi.listServices(),
          erpApi.listServiceCategories(),
          erpApi.listServiceSubcategories(),
        ]);

        if (
          sRes.data.length === 0 &&
          isAdmin &&
          !autoSyncAttemptedRef.current
        ) {
          autoSyncAttemptedRef.current = true;
          setSyncingCatalog(true);
          syncingCatalogRef.current = true;
          try {
            const syncRes = await erpApi.syncCatalog675();
            const d = syncRes.data;
            [sRes, cRes, subRes] = await Promise.all([
              erpApi.listServices(),
              erpApi.listServiceCategories(),
              erpApi.listServiceSubcategories(),
            ]);
            onShowToast(
              'success',
              '675 Services Synced',
              `${d.categoriesCount} Categories · ${d.subcategoriesCount} Subcategories · ${d.servicesCount} Services`
            );
          } catch (syncErr) {
            const msg = extractFriendlyErrorMessage(
              syncErr,
              'Unable to sync 675 Services Catalog.'
            );
            setSyncError(msg);
            onShowToast('error', 'Services Catalog Sync Failed', msg);
          } finally {
            setSyncingCatalog(false);
            syncingCatalogRef.current = false;
          }
        }

        setServices(sRes.data);
        setCategories(cRes.data);
        setSubcategories(subRes.data);
        syncSelectionFromList(sRes.data, forceRefreshBuffers);
      } catch (err) {
        const msg = extractFriendlyErrorMessage(err);
        setSyncError(msg);
        onShowToast('error', 'Failed to load Services', msg);
      } finally {
        setLoading(false);
        loadingRef.current = false;
      }
    },
    [isAdmin, onShowToast, syncSelectionFromList]
  );

  useEffect(() => {
    void loadAll(true);
  }, [loadAll]);

  const handleSyncCatalog675 = async () => {
    setSyncingCatalog(true);
    syncingCatalogRef.current = true;
    setSyncError(null);
    try {
      const res = await erpApi.syncCatalog675();
      const d = res.data;
      onShowToast(
        'success',
        '675 Services Synced',
        `${d.categoriesCount} Categories · ${d.subcategoriesCount} Subcategories · ${d.servicesCount} Services (${d.codeRange})${
          d.legacyRemovedCount ? ` · Cleaned ${d.legacyRemovedCount} legacy doc(s)` : ''
        }`
      );
      await loadAll(true);
    } catch (err) {
      const msg = extractFriendlyErrorMessage(err);
      setSyncError(msg);
      onShowToast('error', 'Catalog Sync Failed', msg);
    } finally {
      setSyncingCatalog(false);
      syncingCatalogRef.current = false;
    }
  };

  const promptDeleteService = (svc: ErpServiceItem) => {
    setServiceToDelete(svc);
    setDeleteServiceModalOpen(true);
  };

  const handleExecuteDeleteService = async () => {
    if (!serviceToDelete) return;
    setDeletingService(true);
    try {
      await erpApi.deleteService(serviceToDelete.serviceId);
      onShowToast(
        'success',
        'Service Permanently Deleted',
        `${serviceToDelete.serviceCode || serviceToDelete.serviceId} (${serviceToDelete.name}) removed from catalog.`
      );
      setDeleteServiceModalOpen(false);
      const deletedId = serviceToDelete.serviceId;
      setServiceToDelete(null);
      setServices((prev) => {
        const remaining = prev.filter((s) => s.serviceId !== deletedId);
        if (selectedServiceRef.current?.serviceId === deletedId) {
          selectService(remaining[0] ?? null);
        }
        return remaining;
      });
      await loadAll(true);
    } catch (err) {
      onShowToast('error', 'Delete Failed', extractFriendlyErrorMessage(err, 'Unable to delete service.'));
    } finally {
      setDeletingService(false);
    }
  };

  const handleToggleServiceStatus = async (svc: ErpServiceItem) => {
    const nextStatus = svc.status === 'Active' ? 'Inactive' : 'Active';
    setTogglingStatus(true);
    try {
      const res = await erpApi.toggleServiceStatus(svc.serviceId, nextStatus);
      onShowToast('success', `Service ${nextStatus}`, `${res.data.serviceCode} marked ${res.data.status}.`);
      setServices((prev) => prev.map((s) => (s.serviceId === res.data.serviceId ? res.data : s)));
      selectService(res.data);
    } catch (err) {
      onShowToast('error', 'Status Update Failed', extractFriendlyErrorMessage(err));
    } finally {
      setTogglingStatus(false);
    }
  };

  const handleAddField = () => {
    if (!newField.label.trim()) return;
    const key = (newField.fieldKey.trim() || newField.label.trim())
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_');
    const options =
      ['dropdown', 'radio', 'multi_select'].includes(newField.fieldType) && newField.optionsCsv
        ? newField.optionsCsv
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined;
    setDraftFields((prev) => [
      ...prev,
      {
        fieldKey: key,
        label: newField.label.trim(),
        fieldType: newField.fieldType,
        required: newField.required,
        displayOrder: prev.length + 1,
        options,
        enabled: true,
      },
    ]);
    setNewField({ label: '', fieldKey: '', fieldType: 'short_text', required: true, optionsCsv: '' });
  };

  const handlePublishFormVersion = async () => {
    if (!selectedService) return;
    if (draftFields.length === 0) {
      onShowToast('error', 'Empty Form', 'Add at least one form field before publishing a new version.');
      return;
    }
    setPublishingForm(true);
    try {
      const res = await erpApi.publishFormVersion(selectedService.serviceId, draftFields);
      onShowToast(
        'success',
        'Form Version Published',
        `${res.data.serviceCode} v${res.data.currentFormVersion} active (historical applications unaffected)`
      );
      selectService(res.data);
      setServices((prev) => prev.map((s) => (s.serviceId === res.data.serviceId ? res.data : s)));
    } catch (err) {
      onShowToast('error', 'Publish Failed', extractFriendlyErrorMessage(err));
    } finally {
      setPublishingForm(false);
    }
  };

  const calculatedEditTotalCharge = useMemo(
    () => round2((Number(editServiceCharge) || 0) + (Number(editGovtFee) || 0) + (Number(editAdditionalCharges) || 0)),
    [editServiceCharge, editGovtFee, editAdditionalCharges]
  );

  const calculatedEditProfit = useMemo(
    () => round2((Number(editServiceCharge) || 0) + (Number(editAdditionalCharges) || 0) - (Number(editCost) || 0)),
    [editServiceCharge, editAdditionalCharges, editCost]
  );

  const handleSaveDetailsPricingAndStatus = async () => {
    if (!selectedService) return;
    if (!editName.trim() || editName.trim().length < 2) {
      onShowToast('error', 'Validation Failed', 'Service name must be at least 2 characters.');
      return;
    }
    setSavingPricing(true);
    try {
      const res = await erpApi.updateService(selectedService.serviceId, {
        name: editName.trim(),
        categoryId: Number(editCategoryId),
        subcategoryId: editSubcategoryId ? Number(editSubcategoryId) : null,
        description: editDescription.trim(),
        serviceInstructions: editInstructions.trim(),
        serviceCharge: Number(editServiceCharge || 0),
        govtFee: Number(editGovtFee || 0),
        additionalCharges: Number(editAdditionalCharges || 0),
        serviceCost: Number(editCost || 0),
        status: editStatus,
        availability: editAvailability,
      });
      onShowToast(
        'success',
        'Service Updated',
        `${res.data.serviceCode} · Total Charge: ${formatCurrency(res.data.totalCustomerCharge)} · Profit: ${formatCurrency(res.data.profitAmount)}`
      );
      selectService(res.data);
      setServices((prev) => prev.map((s) => (s.serviceId === res.data.serviceId ? res.data : s)));
    } catch (err) {
      onShowToast('error', 'Update Failed', extractFriendlyErrorMessage(err));
    } finally {
      setSavingPricing(false);
    }
  };

  const handleSaveSla = async () => {
    if (!selectedService) return;
    setSavingSla(true);
    try {
      const res = await erpApi.updateService(selectedService.serviceId, {
        sla: {
          ...selectedService.sla,
          processingMode: editSlaMode,
          expectedDays: Math.max(1, Number(editSlaExpected || 1)),
          minDays: Math.max(1, Number(editSlaMin || 1)),
          maxDays: Math.max(1, Number(editSlaMax || 1)),
          dayType: editSlaDayType,
        },
      });
      onShowToast('success', 'SLA Updated', `${res.data.serviceCode} SLA set to ${res.data.sla.expectedDays}d (${res.data.sla.dayType}).`);
      selectService(res.data);
      setServices((prev) => prev.map((s) => (s.serviceId === res.data.serviceId ? res.data : s)));
    } catch (err) {
      onShowToast('error', 'SLA Update Failed', extractFriendlyErrorMessage(err));
    } finally {
      setSavingSla(false);
    }
  };

  const handleCreateService = async (e: React.FormEvent) => {
    e.preventDefault();
    setSrvError(null);
    if (!srvForm.name.trim() || srvForm.name.trim().length < 2) {
      setSrvError('Service name must be at least 2 characters.');
      return;
    }
    setSavingSrv(true);
    try {
      const res = await erpApi.createService({
        name: srvForm.name.trim(),
        categoryId: Number(srvForm.categoryId) || categories[0]?.id || 1,
        subcategoryId: srvForm.subcategoryId ? Number(srvForm.subcategoryId) : undefined,
        serviceCharge: Number(srvForm.serviceCharge || 0),
        govtFee: Number(srvForm.govtFee || 0),
        additionalCharges: Number(srvForm.additionalCharges || 0),
        serviceCost: Number(srvForm.serviceCost || 0),
        description: srvForm.description.trim(),
        serviceInstructions: srvForm.serviceInstructions.trim(),
        sla: { processingMode: 'FIXED', expectedDays: Number(srvForm.expectedDays || 3) },
      });
      setNewServiceOpen(false);
      setSrvForm({
        name: '',
        categoryId: categories[0]?.id ?? 1,
        subcategoryId: '',
        serviceCharge: 0,
        govtFee: 0,
        additionalCharges: 0,
        serviceCost: 0,
        description: '',
        serviceInstructions: '',
        expectedDays: 3,
      });
      onShowToast(
        'success',
        'Service Created',
        `${res.data.serviceCode} (${res.data.serviceId}) — ${res.data.name}`
      );
      selectService(res.data);
      await loadAll(true);
    } catch (err) {
      const msg = extractFriendlyErrorMessage(err, 'Unable to create service.');
      setSrvError(msg);
      onShowToast('error', 'Creation Failed', msg);
    } finally {
      setSavingSrv(false);
    }
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    setCatError(null);
    if (!catForm.name.trim() || catForm.name.trim().length < 2) {
      setCatError('Category name must be at least 2 characters.');
      return;
    }
    setSavingCat(true);
    try {
      if (editingCat) {
        const res = await erpApi.updateServiceCategory(editingCat.id, {
          name: catForm.name.trim(),
          description: catForm.description.trim(),
        });
        onShowToast('success', 'Category Updated', `Updated "${res.data.name}" (${res.data.code})`);
      } else {
        const res = await erpApi.createServiceCategory({
          name: catForm.name.trim(),
          description: catForm.description.trim(),
        });
        onShowToast('success', 'Category Created', `Created "${res.data.name}" (${res.data.code})`);
      }
      setNewCatOpen(false);
      setEditingCat(null);
      setCatForm({ name: '', description: '' });
      await loadAll(false);
    } catch (err) {
      const msg = extractFriendlyErrorMessage(err, 'Unable to save category.');
      setCatError(msg);
      onShowToast('error', 'Category Error', msg);
    } finally {
      setSavingCat(false);
    }
  };

  const handleCreateSubcategory = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubError(null);
    if (!subForm.name.trim() || subForm.name.trim().length < 2) {
      setSubError('Subcategory name must be at least 2 characters.');
      return;
    }
    setSavingSub(true);
    try {
      const res = await erpApi.createServiceSubcategory({
        categoryId: Number(subForm.categoryId),
        name: subForm.name.trim(),
        description: subForm.description.trim(),
      });
      setNewSubOpen(false);
      setSubForm({ categoryId: categories[0]?.id ?? 1, name: '', description: '' });
      onShowToast('success', 'Subcategory Created', `${res.data.code} — ${res.data.name}`);
      await loadAll(false);
    } catch (err) {
      const msg = extractFriendlyErrorMessage(err, 'Unable to create subcategory.');
      setSubError(msg);
      onShowToast('error', 'Subcategory Error', msg);
    } finally {
      setSavingSub(false);
    }
  };

  // Subcategories for currently selected filter category
  const activeFilterSubcategories = useMemo(() => {
    if (selectedCategoryFilter === 'ALL') return [];
    return subcategories.filter((sc) => String(sc.categoryId) === String(selectedCategoryFilter));
  }, [subcategories, selectedCategoryFilter]);

  // Subcategories for Create Service modal & Edit Service form
  const createFormSubcategories = useMemo(
    () => subcategories.filter((sc) => Number(sc.categoryId) === Number(srvForm.categoryId)),
    [subcategories, srvForm.categoryId]
  );

  const editFormSubcategories = useMemo(
    () => subcategories.filter((sc) => Number(sc.categoryId) === Number(editCategoryId)),
    [subcategories, editCategoryId]
  );

  // Category & Subcategory count maps for fast rendering over 675 services
  const categoryCountMap = useMemo(() => {
    const counts = new Map<number, number>();
    for (const s of services) {
      counts.set(s.categoryId, (counts.get(s.categoryId) || 0) + 1);
    }
    return counts;
  }, [services]);

  const subcategoryCountMap = useMemo(() => {
    const counts = new Map<number, number>();
    for (const s of services) {
      if (s.subcategoryId) {
        counts.set(s.subcategoryId, (counts.get(s.subcategoryId) || 0) + 1);
      }
    }
    return counts;
  }, [services]);

  // Filtered Services
  const filteredServices = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return services.filter((s) => {
      if (selectedCategoryFilter !== 'ALL' && String(s.categoryId) !== String(selectedCategoryFilter)) {
        return false;
      }
      if (selectedSubcategoryFilter !== 'ALL' && String(s.subcategoryId ?? '') !== String(selectedSubcategoryFilter)) {
        return false;
      }
      if (statusFilter !== 'ALL' && s.status !== statusFilter) return false;
      if (rateFilter === 'CONFIGURED' && (s.totalCustomerCharge ?? s.customerCharge) <= 0) return false;
      if (rateFilter === 'BLANK' && (s.totalCustomerCharge ?? s.customerCharge) > 0) return false;
      if (q) {
        const match =
          s.serviceId.toLowerCase().includes(q) ||
          s.serviceCode.toLowerCase().includes(q) ||
          s.name.toLowerCase().includes(q) ||
          s.categoryName.toLowerCase().includes(q) ||
          (s.subcategoryName || '').toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [services, selectedCategoryFilter, selectedSubcategoryFilter, statusFilter, rateFilter, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredServices.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedServices = filteredServices.slice((safePage - 1) * pageSize, safePage * pageSize);

  const handleOpenApplyWorkflow = (svc: ErpServiceItem) => {
    setApplyingService(svc);
    setApplyCustName('');
    setApplyCustMobile('');
    setApplyVillage('');
    setApplyFormData({});
    setApplyError(null);
    setApplyModalOpen(true);
  };

  const handleExecuteApplyService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!applyingService) return;
    setApplyError(null);
    if (!applyCustName.trim() || applyCustMobile.trim().length < 10) {
      const msg = 'Customer Name and valid 10-digit mobile number are required.';
      setApplyError(msg);
      onShowToast('error', 'Validation Failed', msg);
      return;
    }

    setSubmittingApp(true);
    try {
      const custRes = await erpApi.createCustomer({
        fullName: applyCustName.trim(),
        mobile: applyCustMobile.trim(),
        village: applyVillage.trim() || 'Local Area',
        district: 'Murshidabad',
      });
      const customerId = custRes.data.customerId;

      const appRes = await erpApi.createApplication({
        customerId,
        serviceId: applyingService.serviceId,
        formData: applyFormData,
        adminRemarks: `Applied via centralized Services Catalog workflow for ${applyingService.name}`,
      });

      onShowToast(
        'success',
        'Application Submitted Successfully!',
        `Reference No: ${appRes.data.applicationNo} linked to customer ${customerId}.`
      );
      setApplyModalOpen(false);
      onStartApplicationForService(applyingService.serviceId);
    } catch (err) {
      const msg = extractFriendlyErrorMessage(err, 'Application submission failed.');
      setApplyError(msg);
      onShowToast('error', 'Application Submission Failed', msg);
    } finally {
      setSubmittingApp(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-neutral-950 dark:text-white">
            Services, Form Builder &amp; SLA Configuration
          </h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
            {categories.length} Categories · {subcategories.length} Subcategories · {services.length} Services (Live Master Catalog)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <>
              <Button
                type="button"
                size="sm"
                variant="outline"
                loading={syncingCatalog}
                onClick={handleSyncCatalog675}
                icon={<Database className="h-3.5 w-3.5" />}
              >
                {syncingCatalog ? 'Syncing 675 Services...' : 'Sync / Seed 675 Services'}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setEditingCat(null);
                  setCatError(null);
                  setCatForm({ name: '', description: '' });
                  setNewCatOpen(true);
                }}
                icon={<Layers className="h-3.5 w-3.5" />}
              >
                Add Category
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setSubError(null);
                  const fallbackCatId =
                    selectedCategoryFilter !== 'ALL'
                      ? Number(selectedCategoryFilter)
                      : categories[0]?.id ?? 1;
                  setSubForm({ categoryId: fallbackCatId, name: '', description: '' });
                  setNewSubOpen(true);
                }}
                icon={<FolderTree className="h-3.5 w-3.5" />}
              >
                Add Subcategory
              </Button>
              <Button
                type="button"
                size="sm"
                variant="primary"
                onClick={() => {
                  setSrvError(null);
                  const initCatId =
                    selectedCategoryFilter !== 'ALL'
                      ? Number(selectedCategoryFilter)
                      : categories[0]?.id ?? 1;
                  const firstSub = subcategories.find((sc) => sc.categoryId === initCatId);
                  setSrvForm({
                    name: '',
                    categoryId: initCatId,
                    subcategoryId:
                      selectedSubcategoryFilter !== 'ALL'
                        ? Number(selectedSubcategoryFilter)
                        : firstSub?.id ?? '',
                    serviceCharge: 0,
                    govtFee: 0,
                    additionalCharges: 0,
                    serviceCost: 0,
                    description: '',
                    serviceInstructions: '',
                    expectedDays: 3,
                  });
                  setNewServiceOpen(true);
                }}
                icon={<Plus className="h-3.5 w-3.5" />}
              >
                Add Service
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Actionable Sync Status / Error Banner */}
      {(syncError || (!loading && !syncingCatalog && services.length === 0)) && (
        <div
          role="alert"
          className={`rounded-lg border px-4 py-3 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
            syncError
              ? 'border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-200'
              : 'border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200'
          }`}
        >
          <div className="space-y-0.5">
            <div className="font-semibold">
              {syncError ? 'Services Catalog Sync / Load Issue' : 'Services Catalog is Empty'}
            </div>
            <div>
              {syncError ||
                (isAdmin
                  ? 'Click "Sync / Seed 675 Services" to populate all 21 categories, 77 subcategories, and 675 services.'
                  : 'No services have been synced yet. Sign in as Admin/Manager to run the initial 675-service catalog sync.')}
            </div>
          </div>
          {isAdmin && (
            <Button
              type="button"
              size="sm"
              variant="primary"
              loading={syncingCatalog}
              onClick={handleSyncCatalog675}
              icon={<Database className="h-3.5 w-3.5" />}
            >
              {syncingCatalog ? 'Syncing 675 Services...' : 'Sync / Retry 675 Services'}
            </Button>
          )}
        </div>
      )}

      {/* Category & Subcategory Navigation Bar */}
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-3 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
            Category Navigation ({categories.length} Categories)
          </span>
          <span className="text-xs text-neutral-500">
            Showing {filteredServices.length} of {services.length} Service(s)
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <button
            type="button"
            onClick={() => {
              setSelectedCategoryFilter('ALL');
              setSelectedSubcategoryFilter('ALL');
              setCurrentPage(1);
            }}
            className={`px-3 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
              selectedCategoryFilter === 'ALL'
                ? 'bg-neutral-950 text-white dark:bg-white dark:text-neutral-950'
                : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200'
            }`}
          >
            All Categories ({services.length})
          </button>
          {categories.map((cat) => {
            const count = categoryCountMap.get(cat.id) || 0;
            const isSelected = String(selectedCategoryFilter) === String(cat.id);
            return (
              <div key={cat.id} className="inline-flex items-center">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCategoryFilter(String(cat.id));
                    setSelectedSubcategoryFilter('ALL');
                    setCurrentPage(1);
                  }}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-neutral-950 text-white dark:bg-white dark:text-neutral-950'
                      : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200'
                  }`}
                >
                  <span>{cat.name}</span>
                  <span className="text-[10px] opacity-75 font-mono">({count})</span>
                </button>
                {isSelected && isAdmin && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingCat(cat);
                      setCatError(null);
                      setCatForm({ name: cat.name, description: cat.description });
                      setNewCatOpen(true);
                    }}
                    className="ml-1 p-1 text-neutral-500 hover:text-neutral-900 dark:hover:text-white cursor-pointer"
                    title={`Edit category ${cat.name}`}
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Subcategory Filter Row when a Category is selected */}
        {activeFilterSubcategories.length > 0 && (
          <div className="pt-2 border-t border-neutral-100 dark:border-neutral-800">
            <div className="text-[11px] font-medium text-neutral-500 mb-1.5">
              Subcategories ({activeFilterSubcategories.length})
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <button
                type="button"
                onClick={() => {
                  setSelectedSubcategoryFilter('ALL');
                  setCurrentPage(1);
                }}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                  selectedSubcategoryFilter === 'ALL'
                    ? 'bg-neutral-800 text-white dark:bg-neutral-200 dark:text-neutral-950'
                    : 'bg-neutral-100 dark:bg-neutral-800/70 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200'
                }`}
              >
                All Subcategories
              </button>
              {activeFilterSubcategories.map((sub) => {
                const subCount = subcategoryCountMap.get(sub.id) || 0;
                const isSubSel = String(selectedSubcategoryFilter) === String(sub.id);
                return (
                  <button
                    key={sub.id}
                    type="button"
                    onClick={() => {
                      setSelectedSubcategoryFilter(String(sub.id));
                      setCurrentPage(1);
                    }}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                      isSubSel
                        ? 'bg-neutral-800 text-white dark:bg-neutral-200 dark:text-neutral-950'
                        : 'bg-neutral-100 dark:bg-neutral-800/70 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200'
                    }`}
                  >
                    <span>{sub.name}</span>
                    <span className="text-[10px] opacity-75 font-mono">({subCount})</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Search & Filters Bar */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-3 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-3">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-neutral-400" />
          <input
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Search service name, MC2627SRV code, MCS ID, category..."
            className="w-full h-9 pl-9 pr-3 text-xs bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-md focus:outline-none focus:ring-1 focus:ring-neutral-950"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <div className="flex items-center gap-1.5 text-xs text-neutral-500">
            <Filter className="h-3.5 w-3.5" />
            <span>Filters:</span>
          </div>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as 'ALL' | 'Active' | 'Inactive');
              setCurrentPage(1);
            }}
            className="h-9 px-3 text-xs bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-md"
          >
            <option value="ALL">All Statuses</option>
            <option value="Active">Active Only</option>
            <option value="Inactive">Inactive Only</option>
          </select>
          <select
            value={rateFilter}
            onChange={(e) => {
              setRateFilter(e.target.value as 'ALL' | 'CONFIGURED' | 'BLANK');
              setCurrentPage(1);
            }}
            className="h-9 px-3 text-xs bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-md"
          >
            <option value="ALL">All Rates</option>
            <option value="CONFIGURED">Configured (Charge &gt; 0)</option>
            <option value="BLANK">Blank / Unconfigured (₹0)</option>
          </select>
        </div>
      </div>

      {/* Main Grid: Service List (Left) & Configuration / Form Builder (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Service List (5 Cols) */}
        <div className="lg:col-span-5 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
            <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
              Services Catalog ({filteredServices.length})
            </span>
            <span className="text-[11px] font-mono text-neutral-500">
              Page {safePage} of {totalPages}
            </span>
          </div>

          <div className="divide-y divide-neutral-100 dark:divide-neutral-800 max-h-[640px] overflow-y-auto">
            {loading ? (
              <div className="p-6 text-xs text-neutral-500 text-center">Loading 675 services catalog...</div>
            ) : paginatedServices.length === 0 ? (
              <div className="p-6 text-xs text-neutral-500 text-center space-y-3">
                <p>No services found matching filters.</p>
                {services.length === 0 && isAdmin && (
                  <Button
                    type="button"
                    size="sm"
                    variant="primary"
                    loading={syncingCatalog}
                    onClick={handleSyncCatalog675}
                    icon={<Database className="h-3.5 w-3.5" />}
                  >
                    Sync / Seed 675 Services
                  </Button>
                )}
              </div>
            ) : (
              paginatedServices.map((svc) => {
                const isSelected = selectedService?.serviceId === svc.serviceId;
                const totalFee = svc.totalCustomerCharge ?? svc.customerCharge ?? 0;
                return (
                  <div
                    key={svc.serviceId}
                    onClick={() => selectService(svc)}
                    className={`p-4 cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-neutral-50 dark:bg-neutral-800/60 border-l-2 border-neutral-950 dark:border-white'
                        : 'hover:bg-neutral-50/70 dark:hover:bg-neutral-800/30'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-mono text-[11px] text-neutral-500 truncate">
                          {svc.serviceCode} · {svc.categoryName}
                          {svc.subcategoryName ? ` › ${svc.subcategoryName}` : ''}
                        </div>
                        <div className="font-semibold text-sm text-neutral-950 dark:text-white mt-0.5">
                          {svc.name}
                        </div>
                      </div>
                      <div className="text-right shrink-0 flex items-center gap-2">
                        <div>
                          <div className="font-mono text-xs font-semibold text-neutral-950 dark:text-white">
                            {formatCurrency(totalFee)}
                          </div>
                          <div className="font-mono text-[10px] text-emerald-700 dark:text-emerald-400">
                            Prof: {formatCurrency(svc.profitAmount)}
                          </div>
                        </div>
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              promptDeleteService(svc);
                            }}
                            className="p-1.5 text-neutral-400 hover:text-red-600 dark:hover:text-red-400 rounded transition-colors cursor-pointer"
                            title={`Delete service ${svc.serviceCode || svc.serviceId}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-neutral-500">
                      <span>
                        <span
                          className={`inline-block mr-1.5 font-mono px-1.5 py-0.5 rounded text-[10px] ${
                            svc.status === 'Active'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                              : 'bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300'
                          }`}
                        >
                          {svc.status}
                        </span>
                        Form v{svc.currentFormVersion} · {svc.requiredDocuments.length} docs · SLA {svc.sla?.expectedDays ?? 3}d
                      </span>
                      {svc.status === 'Active' && svc.availability === 'Available' && (
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenApplyWorkflow(svc);
                          }}
                        >
                          Apply Service
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Pagination Footer */}
          {totalPages > 1 && (
            <div className="px-4 py-3 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-between text-xs">
              <Button
                size="sm"
                variant="outline"
                disabled={safePage === 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <span className="font-mono text-neutral-500">
                {safePage} / {totalPages}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={safePage === totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          )}
        </div>

        {/* Selected Service Configuration & Form Builder (7 Cols) */}
        <div className="lg:col-span-7 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5 space-y-4">
          {!selectedService ? (
            <div className="text-xs text-neutral-500 text-center py-12">
              Select a service from the left catalog to inspect or configure its dynamic form, required documents, SLA, details, and pricing.
            </div>
          ) : (
            <>
              {/* Header summary */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-200 dark:border-neutral-800 pb-3">
                <div>
                  <div className="font-mono text-xs text-neutral-500">
                    {selectedService.serviceCode} · {selectedService.serviceId} · {selectedService.categoryName}
                    {selectedService.subcategoryName ? ` › ${selectedService.subcategoryName}` : ''}
                  </div>
                  <h3 className="text-base font-bold text-neutral-950 dark:text-white">
                    {selectedService.name}
                  </h3>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {isAdmin && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        loading={togglingStatus}
                        onClick={() => handleToggleServiceStatus(selectedService)}
                        icon={<Power className="h-3.5 w-3.5" />}
                      >
                        {selectedService.status === 'Active' ? 'Deactivate' : 'Activate'}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => promptDeleteService(selectedService)}
                        className="text-red-600 border-red-200 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950/40"
                        icon={<Trash2 className="h-3.5 w-3.5" />}
                      >
                        Delete Service
                      </Button>
                    </>
                  )}
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => handleOpenApplyWorkflow(selectedService)}
                  >
                    Apply Service Workflow
                  </Button>
                </div>
              </div>

              {/* Sub-tabs */}
              <div className="flex flex-wrap gap-1.5 text-xs">
                {(
                  [
                    ['form', 'Dynamic Form Builder', FileText],
                    ['docs', 'Required Documents', Layers],
                    ['sla', 'SLA & Processing', Settings2],
                    ['automation', 'Automation Rules', Zap],
                    ['pricing', 'Details, Pricing & Status', Edit3],
                  ] as const
                ).map(([key, label, IconComp]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setActiveSubTab(key)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border cursor-pointer ${
                      activeSubTab === key
                        ? 'bg-neutral-950 text-white border-neutral-950 dark:bg-white dark:text-neutral-950 font-medium'
                        : 'border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100'
                    }`}
                  >
                    <IconComp className="h-3.5 w-3.5" />
                    <span>{label}</span>
                  </button>
                ))}
              </div>

              {/* Tab 1: Dynamic Form Builder */}
              {activeSubTab === 'form' && (
                <div className="space-y-4 text-xs">
                  <div className="flex items-center justify-between bg-neutral-50 dark:bg-neutral-950 p-3 rounded border border-neutral-200 dark:border-neutral-800">
                    <div>
                      <span className="font-semibold">Published Version: v{selectedService.currentFormVersion}</span>
                      <p className="text-neutral-500 text-[11px] mt-0.5">
                        {draftFields.length} field(s) configured. Publishing a new version preserves all historical applications.
                      </p>
                    </div>
                    {isAdmin && (
                      <Button
                        type="button"
                        size="sm"
                        variant="primary"
                        loading={publishingForm}
                        onClick={handlePublishFormVersion}
                        icon={<Check className="h-3.5 w-3.5" />}
                      >
                        Publish New Version (v{selectedService.currentFormVersion + 1})
                      </Button>
                    )}
                  </div>

                  <div className="divide-y divide-neutral-100 dark:divide-neutral-800 border border-neutral-200 dark:border-neutral-800 rounded overflow-hidden">
                    {draftFields.length === 0 ? (
                      <div className="p-4 text-neutral-500 text-center">No dynamic form fields configured yet.</div>
                    ) : (
                      draftFields.map((f, idx) => (
                        <div key={`${f.fieldKey}-${idx}`} className="p-3 flex items-center justify-between gap-2 bg-white dark:bg-neutral-900">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-neutral-400">#{idx + 1}</span>
                              <span className="font-semibold text-neutral-950 dark:text-white">{f.label}</span>
                              {f.required && (
                                <span className="text-[10px] bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded font-mono">
                                  Required
                                </span>
                              )}
                            </div>
                            <div className="font-mono text-[11px] text-neutral-500 mt-0.5">
                              Key: {f.fieldKey} · Type: {f.fieldType}
                            </div>
                            {f.options && f.options.length > 0 && (
                              <div className="text-[11px] text-neutral-500 mt-1">
                                Options: {f.options.join(', ')}
                              </div>
                            )}
                          </div>
                          {isAdmin && (
                            <button
                              type="button"
                              onClick={() => setDraftFields((prev) => prev.filter((_, i) => i !== idx))}
                              className="text-red-600 hover:text-red-800 p-1 cursor-pointer"
                              title="Remove Field"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      ))
                    )}
                  </div>

                  {isAdmin && (
                    <div className="bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded p-3 space-y-3">
                      <div className="font-semibold text-neutral-950 dark:text-white">Add Dynamic Form Field</div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <input
                          value={newField.label}
                          onChange={(e) => setNewField({ ...newField, label: e.target.value })}
                          placeholder="Field Label (e.g. Full Name)"
                          className="h-8 px-2 border rounded bg-white dark:bg-neutral-900 text-xs"
                        />
                        <select
                          value={newField.fieldType}
                          onChange={(e) => setNewField({ ...newField, fieldType: e.target.value as DynamicFieldType })}
                          className="h-8 px-2 border rounded bg-white dark:bg-neutral-900 text-xs"
                        >
                          {ALL_FIELD_TYPES.map((t) => (
                            <option key={t.value} value={t.value}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                        <label className="flex items-center gap-1.5">
                          <input
                            type="checkbox"
                            checked={newField.required}
                            onChange={(e) => setNewField({ ...newField, required: e.target.checked })}
                          />
                          Mandatory / Required
                        </label>
                      </div>
                      {['dropdown', 'radio', 'multi_select'].includes(newField.fieldType) && (
                        <input
                          value={newField.optionsCsv}
                          onChange={(e) => setNewField({ ...newField, optionsCsv: e.target.value })}
                          placeholder="Comma-separated options (e.g., Option A, Option B, Option C)"
                          className="w-full h-8 px-2 border rounded bg-white dark:bg-neutral-900 text-xs"
                        />
                      )}
                      <Button size="sm" variant="outline" onClick={handleAddField} icon={<Plus className="h-3 w-3" />}>
                        Append Field to Draft
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* Tab 2: Required Documents */}
              {activeSubTab === 'docs' && (
                <div className="space-y-3 text-xs">
                  <div className="font-semibold text-neutral-950 dark:text-white">
                    Configured Required &amp; Optional Documents Checklist
                  </div>
                  <div className="divide-y divide-neutral-100 dark:divide-neutral-800 border border-neutral-200 dark:border-neutral-800 rounded overflow-hidden">
                    {selectedService.requiredDocuments.length === 0 ? (
                      <div className="p-4 text-neutral-500 text-center">No required documents configured.</div>
                    ) : (
                      selectedService.requiredDocuments.map((d, i) => (
                        <div key={i} className="p-3 flex items-center justify-between bg-white dark:bg-neutral-900">
                          <div>
                            <div className="font-semibold">{typeof d === 'string' ? d : d.label}</div>
                            <div className="text-neutral-500 text-[11px] mt-0.5">
                              Category: {typeof d === 'object' && d.category ? d.category : 'Identity / Support'} ·{' '}
                              {typeof d === 'object' && d.required ? 'Mandatory Document' : 'Optional Document'}
                            </div>
                          </div>
                          <span className="font-mono text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">
                            Active
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* Tab 3: SLA & Processing */}
              {activeSubTab === 'sla' && (
                <div className="border border-neutral-200 dark:border-neutral-800 rounded p-4 text-xs space-y-4 bg-neutral-50 dark:bg-neutral-950">
                  <div className="font-semibold text-neutral-950 dark:text-white">SLA &amp; Processing Targets</div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="block font-medium mb-1">Mode</label>
                      <select
                        disabled={!isAdmin}
                        value={editSlaMode}
                        onChange={(e) => setEditSlaMode(e.target.value as 'FIXED' | 'RANGE')}
                        className="w-full h-9 px-2 border rounded bg-white dark:bg-neutral-900 text-xs"
                      >
                        <option value="FIXED">FIXED</option>
                        <option value="RANGE">RANGE</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-medium mb-1">Expected Days</label>
                      <input
                        disabled={!isAdmin}
                        type="number"
                        min={1}
                        value={editSlaExpected}
                        onChange={(e) => setEditSlaExpected(Number(e.target.value))}
                        className="w-full h-9 px-2 border rounded font-mono bg-white dark:bg-neutral-900 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block font-medium mb-1">Min / Max Days</label>
                      <div className="flex gap-1">
                        <input
                          disabled={!isAdmin}
                          type="number"
                          min={1}
                          value={editSlaMin}
                          onChange={(e) => setEditSlaMin(Number(e.target.value))}
                          className="w-1/2 h-9 px-2 border rounded font-mono bg-white dark:bg-neutral-900 text-xs"
                        />
                        <input
                          disabled={!isAdmin}
                          type="number"
                          min={1}
                          value={editSlaMax}
                          onChange={(e) => setEditSlaMax(Number(e.target.value))}
                          className="w-1/2 h-9 px-2 border rounded font-mono bg-white dark:bg-neutral-900 text-xs"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block font-medium mb-1">Day Type</label>
                      <select
                        disabled={!isAdmin}
                        value={editSlaDayType}
                        onChange={(e) => setEditSlaDayType(e.target.value as 'WORKING' | 'CALENDAR')}
                        className="w-full h-9 px-2 border rounded bg-white dark:bg-neutral-900 text-xs"
                      >
                        <option value="WORKING">WORKING</option>
                        <option value="CALENDAR">CALENDAR</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    Auto-Pause Statuses:{' '}
                    <span className="font-mono text-[11px] bg-neutral-200 dark:bg-neutral-800 px-2 py-0.5 rounded">
                      {selectedService.sla?.pauseOnStatuses?.join(', ') || 'Pending Customer'}
                    </span>
                  </div>
                  {isAdmin && (
                    <Button type="button" size="sm" variant="primary" loading={savingSla} onClick={handleSaveSla}>
                      Save SLA Configuration
                    </Button>
                  )}
                </div>
              )}

              {/* Tab 4: Automation Rules */}
              {activeSubTab === 'automation' && (
                <div className="space-y-2 text-xs">
                  <div className="font-semibold text-neutral-950 dark:text-white">Configured Service Automation Rules</div>
                  {selectedService.automationRules.length === 0 ? (
                    <p className="text-neutral-500 p-4 border rounded border-dashed text-center">
                      No service automation rules configured.
                    </p>
                  ) : (
                    selectedService.automationRules.map((r) => (
                      <div key={r.id} className="border border-neutral-200 dark:border-neutral-800 rounded p-3 flex items-center justify-between">
                        <div>
                          <div className="font-semibold">{r.name}</div>
                          <div className="text-neutral-500 font-mono text-[11px] mt-0.5">
                            Trigger: {r.trigger} → Action: {r.actionType} ({r.actionParam})
                          </div>
                        </div>
                        <span className="font-mono text-[11px]">Executions: {r.executionCount}</span>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Tab 5: Details, Pricing & Status */}
              {activeSubTab === 'pricing' && isAdmin && (
                <div className="space-y-4 text-xs border border-neutral-200 dark:border-neutral-800 rounded p-4 bg-neutral-50 dark:bg-neutral-950">
                  <div className="font-semibold text-neutral-950 dark:text-white">
                    Service Details, Rate Schedule &amp; Profit Engine
                  </div>

                  {/* Read-only System Codes + Editable Service Name */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block font-medium mb-1">Service Code (Read-Only)</label>
                      <input
                        readOnly
                        disabled
                        value={selectedService.serviceCode}
                        className="w-full h-9 px-3 border rounded font-mono bg-neutral-100 dark:bg-neutral-900 text-neutral-500 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block font-medium mb-1">System ID (Read-Only)</label>
                      <input
                        readOnly
                        disabled
                        value={selectedService.serviceId}
                        className="w-full h-9 px-3 border rounded font-mono bg-neutral-100 dark:bg-neutral-900 text-neutral-500 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block font-medium mb-1">Service Name *</label>
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full h-9 px-3 border rounded bg-white dark:bg-neutral-900 text-xs"
                      />
                    </div>
                  </div>

                  {/* Category & Subcategory Assignment */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-medium mb-1">Category</label>
                      <select
                        value={editCategoryId}
                        onChange={(e) => {
                          const nextCat = Number(e.target.value);
                          setEditCategoryId(nextCat);
                          const firstSub = subcategories.find((sc) => sc.categoryId === nextCat);
                          setEditSubcategoryId(firstSub?.id ?? '');
                        }}
                        className="w-full h-9 px-3 border rounded bg-white dark:bg-neutral-900 text-xs"
                      >
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block font-medium mb-1">Subcategory</label>
                      <select
                        value={editSubcategoryId}
                        onChange={(e) => setEditSubcategoryId(e.target.value ? Number(e.target.value) : '')}
                        className="w-full h-9 px-3 border rounded bg-white dark:bg-neutral-900 text-xs"
                      >
                        <option value="">None / General</option>
                        {editFormSubcategories.map((sc) => (
                          <option key={sc.id} value={sc.id}>
                            {sc.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Full 4-component Fee & Profit Engine */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block font-medium mb-1">Service Charge (₹)</label>
                      <input
                        type="number"
                        min={0}
                        value={editServiceCharge}
                        onChange={(e) => setEditServiceCharge(Number(e.target.value))}
                        className="w-full h-9 px-3 border rounded font-mono bg-white dark:bg-neutral-900 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block font-medium mb-1">Govt / Portal Fee (₹)</label>
                      <input
                        type="number"
                        min={0}
                        value={editGovtFee}
                        onChange={(e) => setEditGovtFee(Number(e.target.value))}
                        className="w-full h-9 px-3 border rounded font-mono bg-white dark:bg-neutral-900 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block font-medium mb-1">Additional Charges (₹)</label>
                      <input
                        type="number"
                        min={0}
                        value={editAdditionalCharges}
                        onChange={(e) => setEditAdditionalCharges(Number(e.target.value))}
                        className="w-full h-9 px-3 border rounded font-mono bg-white dark:bg-neutral-900 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block font-medium mb-1">Service Cost (₹)</label>
                      <input
                        type="number"
                        min={0}
                        value={editCost}
                        onChange={(e) => setEditCost(Number(e.target.value))}
                        className="w-full h-9 px-3 border rounded font-mono bg-white dark:bg-neutral-900 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block font-medium mb-1">Total Customer Charge (₹)</label>
                      <div className="h-9 px-3 border rounded flex items-center font-mono font-bold bg-white dark:bg-neutral-900 text-neutral-950 dark:text-white">
                        {formatCurrency(calculatedEditTotalCharge)}
                      </div>
                    </div>
                    <div>
                      <label className="block font-medium mb-1">Calculated Net Profit (₹)</label>
                      <div className="h-9 px-3 border rounded flex items-center font-mono font-bold bg-emerald-50 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300">
                        {formatCurrency(calculatedEditProfit)}
                      </div>
                    </div>
                  </div>

                  {/* Description & Service Instructions */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-medium mb-1">Description</label>
                      <textarea
                        rows={2}
                        value={editDescription}
                        onChange={(e) => setEditDescription(e.target.value)}
                        className="w-full p-2 border rounded bg-white dark:bg-neutral-900 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block font-medium mb-1">Service Instructions / Notes</label>
                      <textarea
                        rows={2}
                        value={editInstructions}
                        onChange={(e) => setEditInstructions(e.target.value)}
                        className="w-full p-2 border rounded bg-white dark:bg-neutral-900 text-xs"
                      />
                    </div>
                  </div>

                  {/* Status & Availability */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-medium mb-1">Service Status</label>
                      <select
                        value={editStatus}
                        onChange={(e) => setEditStatus(e.target.value as ErpServiceItem['status'])}
                        className="h-9 px-3 border rounded bg-white dark:bg-neutral-900 text-xs w-full"
                      >
                        <option value="Active">Active</option>
                        <option value="Inactive">Inactive</option>
                        <option value="Temporarily Suspended">Temporarily Suspended</option>
                        <option value="Archived">Archived</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-medium mb-1">Counter Availability</label>
                      <select
                        value={editAvailability}
                        onChange={(e) => setEditAvailability(e.target.value as ErpServiceItem['availability'])}
                        className="h-9 px-3 border rounded bg-white dark:bg-neutral-900 text-xs w-full"
                      >
                        <option value="Available">Available</option>
                        <option value="Unavailable">Unavailable</option>
                      </select>
                    </div>
                  </div>

                  <Button
                    type="button"
                    size="sm"
                    variant="primary"
                    loading={savingPricing}
                    onClick={handleSaveDetailsPricingAndStatus}
                  >
                    Save Service Details, Pricing &amp; Status
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Apply Service Workflow Modal */}
      <Modal
        isOpen={applyModalOpen}
        onClose={() => setApplyModalOpen(false)}
        title={`Apply Service: ${applyingService?.name ?? ''}`}
      >
        <form onSubmit={handleExecuteApplyService} className="space-y-4 text-xs" noValidate>
          {applyError && (
            <div
              role="alert"
              className="px-3 py-2 rounded border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300"
            >
              {applyError}
            </div>
          )}
          <div className="bg-neutral-50 dark:bg-neutral-950 p-3 rounded border border-neutral-200 dark:border-neutral-800">
            <div className="font-semibold text-neutral-950 dark:text-white">Customer Information</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
              <div>
                <label className="block font-medium mb-1">Customer Full Name *</label>
                <input
                  required
                  value={applyCustName}
                  onChange={(e) => setApplyCustName(e.target.value)}
                  placeholder="Enter customer full name..."
                  className="w-full h-9 px-3 border rounded bg-white dark:bg-neutral-900 text-xs"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">Mobile Number (10 digits) *</label>
                <MobileNumberInput
                  required
                  value={applyCustMobile}
                  onChange={setApplyCustMobile}
                  aria-label="Customer mobile number"
                />
              </div>
            </div>
            <div className="mt-2">
              <label className="block font-medium mb-1">Village / Locality</label>
              <input
                value={applyVillage}
                onChange={(e) => setApplyVillage(e.target.value)}
                placeholder="Mamudpur"
                className="w-full h-9 px-3 border rounded bg-white dark:bg-neutral-900 text-xs"
              />
            </div>
          </div>

          {applyingService && (
            <div className="space-y-3">
              <div className="font-semibold text-neutral-950 dark:text-white">
                Dynamic Form Inputs &amp; Required Checklist
              </div>
              <div className="p-3 border border-neutral-200 dark:border-neutral-800 rounded bg-white dark:bg-neutral-900 space-y-3">
                {applyingService.formVersions
                  .find((v) => v.versionNo === applyingService.currentFormVersion)
                  ?.fields.map((field) => (
                    <div key={field.fieldKey}>
                      <label className="block font-medium mb-1">
                        {field.label} {field.required && <span className="text-red-500">*</span>}
                      </label>
                      <input
                        required={field.required}
                        value={applyFormData[field.fieldKey] ?? ''}
                        onChange={(e) =>
                          setApplyFormData({ ...applyFormData, [field.fieldKey]: e.target.value })
                        }
                        placeholder={`Enter ${field.label}...`}
                        className="w-full h-9 px-3 border rounded bg-neutral-50 dark:bg-neutral-950 text-xs"
                      />
                    </div>
                  ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-neutral-200 dark:border-neutral-800">
            <Button type="button" size="sm" variant="outline" onClick={() => setApplyModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" variant="primary" disabled={submittingApp}>
              {submittingApp ? 'Submitting Application...' : 'Submit & Generate Application No'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Add Master Service Modal */}
      <Modal
        isOpen={newServiceOpen}
        onClose={() => {
          setSrvError(null);
          setNewServiceOpen(false);
        }}
        title="Create Master Service"
      >
        <form onSubmit={handleCreateService} className="space-y-3 text-xs" noValidate>
          {srvError && (
            <div
              role="alert"
              className="px-3 py-2 rounded border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300"
            >
              {srvError}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="block font-medium mb-1">Service Name *</label>
              <input
                required
                value={srvForm.name}
                onChange={(e) => {
                  setSrvError(null);
                  setSrvForm({ ...srvForm, name: e.target.value });
                }}
                placeholder="e.g. Income Certificate Renewal"
                className="w-full h-9 px-3 border rounded bg-white dark:bg-neutral-900 text-xs"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Service Code (System-Generated)</label>
              <input
                readOnly
                disabled
                value="Auto-generated (MC2627SRV-XXX)"
                className="w-full h-9 px-3 border rounded font-mono bg-neutral-100 dark:bg-neutral-950 text-neutral-500 text-xs"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="block font-medium mb-1">Category *</label>
              <select
                value={srvForm.categoryId}
                onChange={(e) => {
                  const nextCatId = Number(e.target.value);
                  const firstSub = subcategories.find((sc) => sc.categoryId === nextCatId);
                  setSrvForm({
                    ...srvForm,
                    categoryId: nextCatId,
                    subcategoryId: firstSub?.id ?? '',
                  });
                }}
                className="w-full h-9 px-3 border rounded bg-white dark:bg-neutral-900 text-xs"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-medium mb-1">Subcategory</label>
              <select
                value={srvForm.subcategoryId}
                onChange={(e) =>
                  setSrvForm({ ...srvForm, subcategoryId: e.target.value ? Number(e.target.value) : '' })
                }
                className="w-full h-9 px-3 border rounded bg-white dark:bg-neutral-900 text-xs"
              >
                <option value="">Default / General</option>
                {createFormSubcategories.map((sc) => (
                  <option key={sc.id} value={sc.id}>
                    {sc.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div>
              <label className="block font-medium mb-1">Service Charge (₹)</label>
              <input
                type="number"
                min={0}
                value={srvForm.serviceCharge}
                onChange={(e) => setSrvForm({ ...srvForm, serviceCharge: Number(e.target.value) })}
                className="w-full h-9 px-2 border rounded font-mono bg-white dark:bg-neutral-900 text-xs"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Govt Fee (₹)</label>
              <input
                type="number"
                min={0}
                value={srvForm.govtFee}
                onChange={(e) => setSrvForm({ ...srvForm, govtFee: Number(e.target.value) })}
                className="w-full h-9 px-2 border rounded font-mono bg-white dark:bg-neutral-900 text-xs"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Additional (₹)</label>
              <input
                type="number"
                min={0}
                value={srvForm.additionalCharges}
                onChange={(e) => setSrvForm({ ...srvForm, additionalCharges: Number(e.target.value) })}
                className="w-full h-9 px-2 border rounded font-mono bg-white dark:bg-neutral-900 text-xs"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Cost (₹)</label>
              <input
                type="number"
                min={0}
                value={srvForm.serviceCost}
                onChange={(e) => setSrvForm({ ...srvForm, serviceCost: Number(e.target.value) })}
                className="w-full h-9 px-2 border rounded font-mono bg-white dark:bg-neutral-900 text-xs"
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 bg-neutral-50 dark:bg-neutral-950 p-2 rounded border border-neutral-200 dark:border-neutral-800 font-mono text-[11px]">
            <div>
              Total: {formatCurrency(round2(srvForm.serviceCharge + srvForm.govtFee + srvForm.additionalCharges))}
            </div>
            <div className="text-emerald-700 dark:text-emerald-400">
              Profit: {formatCurrency(round2(srvForm.serviceCharge + srvForm.additionalCharges - srvForm.serviceCost))}
            </div>
            <div className="flex items-center gap-1 justify-end">
              <span>SLA Days:</span>
              <input
                type="number"
                min={1}
                value={srvForm.expectedDays}
                onChange={(e) => setSrvForm({ ...srvForm, expectedDays: Number(e.target.value) })}
                className="w-12 h-6 px-1 border rounded bg-white dark:bg-neutral-900 text-xs"
              />
            </div>
          </div>
          <textarea
            rows={2}
            value={srvForm.description}
            onChange={(e) => setSrvForm({ ...srvForm, description: e.target.value })}
            placeholder="Service description..."
            className="w-full p-2 border rounded bg-white dark:bg-neutral-900 text-xs"
          />
          <textarea
            rows={2}
            value={srvForm.serviceInstructions}
            onChange={(e) => setSrvForm({ ...srvForm, serviceInstructions: e.target.value })}
            placeholder="Service instructions / operator notes..."
            className="w-full p-2 border rounded bg-white dark:bg-neutral-900 text-xs"
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setSrvError(null);
                setNewServiceOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" variant="primary" loading={savingSrv}>
              Create Service
            </Button>
          </div>
        </form>
      </Modal>

      {/* Add / Edit Category Modal */}
      <Modal
        isOpen={newCatOpen}
        onClose={() => {
          setCatError(null);
          setEditingCat(null);
          setNewCatOpen(false);
        }}
        title={editingCat ? `Edit Category (${editingCat.code})` : 'Add Service Category'}
      >
        <form onSubmit={handleSaveCategory} className="space-y-3 text-xs" noValidate>
          {catError && (
            <div
              role="alert"
              className="px-3 py-2 rounded border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300"
            >
              {catError}
            </div>
          )}
          <div>
            <label className="block font-medium mb-1">Category Name *</label>
            <input
              required
              value={catForm.name}
              onChange={(e) => {
                setCatError(null);
                setCatForm({ ...catForm, name: e.target.value });
              }}
              placeholder="e.g. Citizen & KYC Services"
              className="w-full h-9 px-3 border rounded bg-white dark:bg-neutral-900 text-xs"
            />
          </div>
          <div>
            <label className="block font-medium mb-1">Description</label>
            <input
              value={catForm.description}
              onChange={(e) => setCatForm({ ...catForm, description: e.target.value })}
              placeholder="Category scope description..."
              className="w-full h-9 px-3 border rounded bg-white dark:bg-neutral-900 text-xs"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setCatError(null);
                setEditingCat(null);
                setNewCatOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" variant="primary" loading={savingCat}>
              {editingCat ? 'Save Category' : 'Create Category'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Add Subcategory Modal */}
      <Modal
        isOpen={newSubOpen}
        onClose={() => {
          setSubError(null);
          setNewSubOpen(false);
        }}
        title="Add Service Subcategory"
      >
        <form onSubmit={handleCreateSubcategory} className="space-y-3 text-xs" noValidate>
          {subError && (
            <div
              role="alert"
              className="px-3 py-2 rounded border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300"
            >
              {subError}
            </div>
          )}
          <div>
            <label className="block font-medium mb-1">Parent Category *</label>
            <select
              value={subForm.categoryId}
              onChange={(e) => setSubForm({ ...subForm, categoryId: Number(e.target.value) })}
              className="w-full h-9 px-3 border rounded bg-white dark:bg-neutral-900 text-xs"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block font-medium mb-1">Subcategory Name *</label>
            <input
              required
              value={subForm.name}
              onChange={(e) => {
                setSubError(null);
                setSubForm({ ...subForm, name: e.target.value });
              }}
              placeholder="e.g. Digital Identity Updates"
              className="w-full h-9 px-3 border rounded bg-white dark:bg-neutral-900 text-xs"
            />
          </div>
          <div>
            <label className="block font-medium mb-1">Description</label>
            <input
              value={subForm.description}
              onChange={(e) => setSubForm({ ...subForm, description: e.target.value })}
              placeholder="Subcategory scope description..."
              className="w-full h-9 px-3 border rounded bg-white dark:bg-neutral-900 text-xs"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setSubError(null);
                setNewSubOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" variant="primary" loading={savingSub}>
              Create Subcategory
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Service Confirmation Modal */}
      <Modal
        isOpen={deleteServiceModalOpen}
        onClose={() => setDeleteServiceModalOpen(false)}
        title={`Confirm Service Deletion: ${serviceToDelete?.serviceCode || serviceToDelete?.serviceId || ''}`}
      >
        <div className="space-y-4 text-xs">
          <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed">
            Are you sure you want to permanently delete service{' '}
            <span className="font-semibold">{serviceToDelete?.name}</span> ({serviceToDelete?.serviceCode} /{' '}
            {serviceToDelete?.serviceId})? This will permanently delete the document from Firestore and will not restore it on reload.
          </p>
          <div className="flex justify-end gap-2 pt-3 border-t border-neutral-200 dark:border-neutral-800">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setDeleteServiceModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              variant="primary"
              loading={deletingService}
              onClick={handleExecuteDeleteService}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Confirm &amp; Delete Service
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
