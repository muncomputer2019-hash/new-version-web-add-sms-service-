import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, CheckCircle2, FileUp, UserPlus } from 'lucide-react';
import {
  DynamicFormFieldDef,
  ErpApplicationItem,
  ErpCustomerItem,
  ErpServiceItem,
  UserProfile,
} from '../../modules/types';
import { erpApi, readFileAsBase64 } from '../../services/erpApi';
import { Button } from '../../components/Button';
import { MobileNumberInput } from '../../components/MobileNumberInput';
import { formatCurrency } from '../../services/apiClient';

interface ApplicationCreateWizardProps {
  currentUser: UserProfile;
  initialCustomerId?: string | null;
  initialServiceId?: string | null;
  onCreated: (app: ErpApplicationItem) => void;
  onCancel: () => void;
  onShowToast: (type: 'success' | 'error' | 'info', title: string, description?: string) => void;
}

export const ApplicationCreateWizard: React.FC<ApplicationCreateWizardProps> = ({
  currentUser,
  initialCustomerId,
  initialServiceId,
  onCreated,
  onCancel,
  onShowToast,
}) => {
  const [workflowMode, setWorkflowMode] = useState<'CUSTOMER_FIRST' | 'SERVICE_FIRST'>(
    initialServiceId && !initialCustomerId ? 'SERVICE_FIRST' : 'CUSTOMER_FIRST'
  );
  const [customers, setCustomers] = useState<ErpCustomerItem[]>([]);
  const [services, setServices] = useState<ErpServiceItem[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState(initialCustomerId || '');
  const [selectedServiceId, setSelectedServiceId] = useState(initialServiceId || '');
  const [customerSearch, setCustomerSearch] = useState('');
  const [serviceSearch, setServiceSearch] = useState('');

  // Inline registration in Service-First or Customer-First workflow
  const [inlineCustOpen, setInlineCustOpen] = useState(false);
  const [inlineCust, setInlineCust] = useState({ fullName: '', mobile: '', village: '' });

  // Dynamic form values
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [initialDocs, setInitialDocs] = useState<
    Array<{
      docKey: string;
      category: string;
      originalName: string;
      mimeType: string;
      contentBase64: string;
      sizeBytes: number;
    }>
  >([]);
  const [duplicateWarning, setDuplicateWarning] = useState<
    Array<{ applicationNo: string; status: string }>
  >([]);
  const [duplicateOverrideReason, setDuplicateOverrideReason] = useState('');
  const [mandatoryDocExceptionReason, setMandatoryDocExceptionReason] = useState('');
  const [collectInitialPayment, setCollectInitialPayment] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'UPI' | 'Card'>('Cash');
  const [upiReference, setUpiReference] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    Promise.all([erpApi.listCustomers(), erpApi.listServices()])
      .then(([cRes, sRes]) => {
        setCustomers(cRes.data);
        setServices(sRes.data.filter((s) => s.status === 'Active' && s.availability === 'Available'));
      })
      .catch((err) =>
        onShowToast('error', 'Failed to load wizard data', err instanceof Error ? err.message : undefined)
      );
  }, [onShowToast]);

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.customerId === selectedCustomerId) || null,
    [customers, selectedCustomerId]
  );

  const selectedService = useMemo(
    () => services.find((s) => s.serviceId === selectedServiceId) || null,
    [services, selectedServiceId]
  );

  const activeFormFields: DynamicFormFieldDef[] = useMemo(() => {
    if (!selectedService) return [];
    const ver =
      selectedService.formVersions.find((v) => v.versionNo === selectedService.currentFormVersion) ??
      selectedService.formVersions[selectedService.formVersions.length - 1];
    return (ver?.fields ?? []).filter((f) => f.enabled).sort((a, b) => a.displayOrder - b.displayOrder);
  }, [selectedService]);

  // Seed default form values when service changes
  useEffect(() => {
    if (!selectedService) return;
    const defaults: Record<string, unknown> = {};
    for (const f of activeFormFields) {
      if (f.fieldType === 'checkbox') defaults[f.fieldKey] = false;
      else if (f.fieldType === 'multi_select') defaults[f.fieldKey] = [];
      else if (f.fieldType === 'mobile' && selectedCustomer) defaults[f.fieldKey] = selectedCustomer.mobile;
      else if (f.fieldType === 'address' && selectedCustomer) defaults[f.fieldKey] = selectedCustomer.presentAddress;
      else defaults[f.fieldKey] = f.defaultValue ?? '';
    }
    setFormData(defaults);
    setPaymentAmount(selectedService.customerCharge);
  }, [selectedService, activeFormFields, selectedCustomer]);

  // Check duplicate when both customer & service chosen
  useEffect(() => {
    if (!selectedCustomerId || !selectedServiceId) {
      setDuplicateWarning([]);
      return;
    }
    erpApi
      .checkDuplicateApplication(selectedCustomerId, selectedServiceId)
      .then((res) => setDuplicateWarning(res.data.matches))
      .catch(() => setDuplicateWarning([]));
  }, [selectedCustomerId, selectedServiceId]);

  const handleInlineCustomerCreate = async () => {
    try {
      const res = await erpApi.createCustomer({
        fullName: inlineCust.fullName,
        mobile: inlineCust.mobile,
        village: inlineCust.village,
        consents: [
          { category: 'STATUS_UPDATE_CONSENT', granted: true },
          { category: 'DATA_PRIVACY_CONSENT', granted: true },
        ],
      });
      setCustomers((prev) => [res.data, ...prev]);
      setSelectedCustomerId(res.data.customerId);
      setInlineCustOpen(false);
      setInlineCust({ fullName: '', mobile: '', village: '' });
      onShowToast('success', 'Customer Registered Inline', res.data.customerId);
    } catch (err) {
      onShowToast('error', 'Inline Customer Registration Failed', err instanceof Error ? err.message : undefined);
    }
  };

  const handleFileAttach = async (docKey: string, category: string, file: File | null) => {
    if (!file) return;
    const allowed = ['application/pdf', 'image/jpeg', 'image/png'];
    if (!allowed.includes(file.type)) {
      onShowToast('error', 'Invalid File Type', 'Only PDF, JPG, JPEG, and PNG files are allowed.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      onShowToast('error', 'File Too Large', 'Maximum allowed document size is 10 MB.');
      return;
    }
    const contentBase64 = await readFileAsBase64(file);
    setInitialDocs((prev) => [
      ...prev.filter((d) => d.docKey !== docKey),
      {
        docKey,
        category,
        originalName: file.name,
        mimeType: file.type,
        contentBase64,
        sizeBytes: file.size,
      },
    ]);
  };

  const handleSubmit = async (submitMode: 'Draft' | 'Submitted') => {
    if (!selectedCustomerId || !selectedServiceId) {
      onShowToast('error', 'Selection Required', 'Select both Customer and Service.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await erpApi.createApplication({
        customerId: selectedCustomerId,
        serviceId: selectedServiceId,
        submitMode,
        formData,
        initialDocuments: initialDocs,
        duplicateOverrideReason: duplicateOverrideReason || undefined,
        mandatoryDocExceptionReason: mandatoryDocExceptionReason || undefined,
        initialPayment:
          collectInitialPayment && paymentAmount > 0
            ? { amount: paymentAmount, paymentMethod, upiReference }
            : undefined,
      });
      onShowToast('success', `Application ${res.data.applicationNo} (${submitMode}) Created`);
      onCreated(res.data);
    } catch (err) {
      onShowToast('error', 'Submission Blocked', err instanceof Error ? err.message : undefined);
    } finally {
      setSubmitting(false);
    }
  };

  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    return customers.filter(
      (c) =>
        !q ||
        c.fullName.toLowerCase().includes(q) ||
        c.customerId.toLowerCase().includes(q) ||
        c.mobile.toLowerCase().includes(q)
    );
  }, [customers, customerSearch]);

  const filteredServices = useMemo(() => {
    const q = serviceSearch.trim().toLowerCase();
    return services.filter(
      (s) =>
        !q ||
        s.name.toLowerCase().includes(q) ||
        s.serviceId.toLowerCase().includes(q) ||
        s.categoryName.toLowerCase().includes(q)
    );
  }, [services, serviceSearch]);

  const renderFieldInput = (field: DynamicFormFieldDef) => {
    const val = formData[field.fieldKey];
    const setVal = (v: unknown) => setFormData((prev) => ({ ...prev, [field.fieldKey]: v }));

    switch (field.fieldType) {
      case 'long_text':
      case 'address':
        return (
          <textarea
            rows={2}
            value={String(val ?? '')}
            onChange={(e) => setVal(e.target.value)}
            className="w-full p-2 border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-950 text-xs"
          />
        );
      case 'dropdown':
        return (
          <select
            value={String(val ?? '')}
            onChange={(e) => setVal(e.target.value)}
            className="w-full h-9 px-2 border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-950 text-xs"
          >
            <option value="">-- Select --</option>
            {(field.options ?? []).map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        );
      case 'radio':
        return (
          <div className="flex flex-wrap gap-3 pt-1">
            {(field.options ?? []).map((opt) => (
              <label key={opt} className="inline-flex items-center gap-1.5 text-xs cursor-pointer">
                <input
                  type="radio"
                  name={field.fieldKey}
                  checked={val === opt}
                  onChange={() => setVal(opt)}
                />
                <span>{opt}</span>
              </label>
            ))}
          </div>
        );
      case 'yes_no':
        return (
          <div className="flex gap-4 pt-1">
            {['Yes', 'No'].map((opt) => (
              <label key={opt} className="inline-flex items-center gap-1.5 text-xs cursor-pointer">
                <input
                  type="radio"
                  name={field.fieldKey}
                  checked={val === opt}
                  onChange={() => setVal(opt)}
                />
                <span>{opt}</span>
              </label>
            ))}
          </div>
        );
      case 'checkbox':
        return (
          <label className="inline-flex items-center gap-2 text-xs pt-1 cursor-pointer">
            <input
              type="checkbox"
              checked={Boolean(val)}
              onChange={(e) => setVal(e.target.checked)}
            />
            <span>Confirmed</span>
          </label>
        );
      case 'multi_select': {
        const arr = Array.isArray(val) ? (val as string[]) : [];
        return (
          <div className="flex flex-wrap gap-2 pt-1">
            {(field.options ?? []).map((opt) => (
              <label key={opt} className="inline-flex items-center gap-1 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={arr.includes(opt)}
                  onChange={(e) =>
                    setVal(e.target.checked ? [...arr, opt] : arr.filter((i) => i !== opt))
                  }
                />
                <span>{opt}</span>
              </label>
            ))}
          </div>
        );
      }
      case 'date':
        return (
          <input
            type="date"
            value={String(val ?? '')}
            onChange={(e) => setVal(e.target.value)}
            className="w-full h-9 px-3 border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-950 text-xs"
          />
        );
      case 'number':
        return (
          <input
            type="number"
            value={String(val ?? '')}
            onChange={(e) => setVal(e.target.value)}
            className="w-full h-9 px-3 border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-950 text-xs font-mono"
          />
        );
      default:
        return (
          <input
            type={field.fieldType === 'email' ? 'email' : 'text'}
            value={String(val ?? '')}
            onChange={(e) => setVal(e.target.value)}
            placeholder={field.fieldType === 'pan' ? 'ABCDE1234F' : field.fieldType === 'aadhaar' ? '12 digits (auto-masked)' : ''}
            className="w-full h-9 px-3 border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-950 text-xs"
          />
        );
    }
  };

  return (
    <div className="space-y-5 max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button size="sm" variant="outline" onClick={onCancel} icon={<ArrowLeft className="h-3.5 w-3.5" />}>
            Back to Queue
          </Button>
          <div>
            <h2 className="text-lg font-bold text-neutral-950 dark:text-white">
              Create New Service Application
            </h2>
            <p className="text-xs text-neutral-500">
              Atomic server-side MCA numbering, dynamic versioned form validation &amp; checklist guard
            </p>
          </div>
        </div>

        <div className="inline-flex border border-neutral-300 dark:border-neutral-700 rounded overflow-hidden text-xs">
          <button
            type="button"
            onClick={() => setWorkflowMode('CUSTOMER_FIRST')}
            className={`px-3 h-8 font-medium cursor-pointer ${
              workflowMode === 'CUSTOMER_FIRST'
                ? 'bg-neutral-950 text-white dark:bg-white dark:text-neutral-950'
                : 'bg-white dark:bg-neutral-900'
            }`}
          >
            Workflow A: Customer First
          </button>
          <button
            type="button"
            onClick={() => setWorkflowMode('SERVICE_FIRST')}
            className={`px-3 h-8 font-medium cursor-pointer ${
              workflowMode === 'SERVICE_FIRST'
                ? 'bg-neutral-950 text-white dark:bg-white dark:text-neutral-950'
                : 'bg-white dark:bg-neutral-900'
            }`}
          >
            Workflow B: Service First
          </button>
        </div>
      </div>

      {/* Step 1: Select Customer & Service (order adapts cleanly to workflowMode) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Customer Selector Card */}
        <div
          className={`bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-4 space-y-3 text-xs ${
            workflowMode === 'SERVICE_FIRST' ? 'md:order-2' : 'md:order-1'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="font-semibold text-sm">
              {workflowMode === 'CUSTOMER_FIRST' ? 'Step 1: Select Customer' : 'Step 2: Select or Register Customer'}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setInlineCustOpen((p) => !p)}
              icon={<UserPlus className="h-3 w-3" />}
            >
              {inlineCustOpen ? 'Close Inline Form' : 'Quick Register'}
            </Button>
          </div>

          {inlineCustOpen ? (
            <div className="p-3 border border-neutral-200 dark:border-neutral-700 rounded space-y-2 bg-neutral-50 dark:bg-neutral-950">
              <input
                value={inlineCust.fullName}
                onChange={(e) => setInlineCust({ ...inlineCust, fullName: e.target.value })}
                placeholder="Customer Full Name *"
                className="w-full h-8 px-2 border rounded bg-white dark:bg-neutral-900"
              />
              <div className="grid grid-cols-2 gap-2">
                <MobileNumberInput
                  required
                  value={inlineCust.mobile}
                  onChange={(val) => setInlineCust((prev) => ({ ...prev, mobile: val }))}
                  heightClassName="h-8"
                  aria-label="Customer mobile number"
                />
                <input
                  value={inlineCust.village}
                  onChange={(e) => setInlineCust({ ...inlineCust, village: e.target.value })}
                  placeholder="Village *"
                  className="h-8 px-2 border rounded bg-white dark:bg-neutral-900"
                />
              </div>
              <Button size="sm" variant="primary" onClick={handleInlineCustomerCreate}>
                Save &amp; Select Customer
              </Button>
            </div>
          ) : (
            <>
              <input
                type="search"
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                placeholder="Filter customers by name, MCC ID or mobile..."
                className="w-full h-8 px-2.5 border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-950"
              />
              <select
                value={selectedCustomerId}
                onChange={(e) => setSelectedCustomerId(e.target.value)}
                className="w-full h-9 px-2.5 border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-950"
              >
                <option value="">-- Choose Customer --</option>
                {filteredCustomers.map((c) => (
                  <option key={c.customerId} value={c.customerId}>
                    {c.customerId} — {c.fullName} ({c.mobile})
                  </option>
                ))}
              </select>
            </>
          )}

          {selectedCustomer && (
            <div className="p-2.5 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded space-y-0.5">
              <div className="font-semibold">{selectedCustomer.fullName} · {selectedCustomer.customerId}</div>
              <div className="text-neutral-500">{selectedCustomer.presentAddress}</div>
            </div>
          )}
        </div>

        {/* Service Selector Card */}
        <div
          className={`bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-4 space-y-3 text-xs ${
            workflowMode === 'SERVICE_FIRST' ? 'md:order-1' : 'md:order-2'
          }`}
        >
          <div className="font-semibold text-sm">
            {workflowMode === 'SERVICE_FIRST' ? 'Step 1: Select Service' : 'Step 2: Select Service'}
          </div>
          <input
            type="search"
            value={serviceSearch}
            onChange={(e) => setServiceSearch(e.target.value)}
            placeholder="Search service name, ID or category..."
            className="w-full h-8 px-2.5 border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-950"
          />
          <select
            value={selectedServiceId}
            onChange={(e) => setSelectedServiceId(e.target.value)}
            className="w-full h-9 px-2.5 border border-neutral-300 dark:border-neutral-700 rounded bg-white dark:bg-neutral-950"
          >
            <option value="">-- Choose Active Service ({filteredServices.length}) --</option>
            {filteredServices.map((s) => (
              <option key={s.serviceId} value={s.serviceId}>
                {s.serviceId} — {s.name} ({formatCurrency(s.customerCharge)})
              </option>
            ))}
          </select>

          {selectedService && (
            <div className="p-2.5 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded space-y-1">
              <div className="flex justify-between">
                <span className="font-semibold">{selectedService.name} (Form v{selectedService.currentFormVersion})</span>
                <span className="font-mono font-bold">{formatCurrency(selectedService.customerCharge)}</span>
              </div>
              <div className="text-neutral-500">
                Expected SLA: {selectedService.sla.expectedDays} {selectedService.sla.dayType} day(s) · {selectedService.requiredDocuments.filter((d) => d.required).length} mandatory docs
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Duplicate Application Guard Warning */}
      {duplicateWarning.length > 0 && (
        <div className="p-4 border border-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded-lg text-xs space-y-2">
          <div className="flex items-center gap-2 font-semibold text-amber-800 dark:text-amber-300">
            <AlertTriangle className="h-4 w-4" />
            Duplicate Application Detected: Customer already has active {duplicateWarning.map((d) => `${d.applicationNo} (${d.status})`).join(', ')}
          </div>
          <input
            value={duplicateOverrideReason}
            onChange={(e) => setDuplicateOverrideReason(e.target.value)}
            placeholder="Enter authorized override reason if creating a second application intentionally..."
            className="w-full h-9 px-3 border border-amber-300 rounded bg-white dark:bg-neutral-950"
          />
        </div>
      )}

      {/* Dynamic Service Form + Required Docs */}
      {selectedService && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-7 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5 space-y-3">
            <h3 className="text-sm font-bold text-neutral-950 dark:text-white">
              Service Form (v{selectedService.currentFormVersion})
            </h3>
            <div className="space-y-3 text-xs">
              {activeFormFields.map((field) => (
                <div key={field.fieldKey}>
                  <label className="block font-medium mb-1">
                    {field.label} {field.required && <span className="text-red-600">*</span>}
                  </label>
                  {renderFieldInput(field)}
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-5 space-y-4">
            {/* Document Upload Checklist */}
            <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5 space-y-3 text-xs">
              <h3 className="text-sm font-bold text-neutral-950 dark:text-white">
                Required Document Checklist (Private Vault)
              </h3>
              {selectedService.requiredDocuments.filter((d) => d.enabled).length === 0 ? (
                <p className="text-neutral-500">No documents configured for this service.</p>
              ) : (
                selectedService.requiredDocuments
                  .filter((d) => d.enabled)
                  .map((docDef) => {
                    const attached = initialDocs.find((d) => d.docKey === docDef.docKey);
                    return (
                      <div key={docDef.docKey} className="border border-neutral-200 dark:border-neutral-800 rounded p-3 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold">
                            {docDef.label} {docDef.required ? '(Mandatory)' : '(Optional)'}
                          </span>
                          {attached && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                        </div>
                        <div className="text-[11px] text-neutral-500">
                          Allowed: {docDef.allowedFormats.join(', ')} · Max {docDef.maxSizeMb} MB
                        </div>
                        <label className="inline-flex items-center gap-1.5 px-2.5 py-1 border border-neutral-300 dark:border-neutral-700 rounded cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800">
                          <FileUp className="h-3.5 w-3.5" />
                          <span>{attached ? attached.originalName : 'Select File'}</span>
                          <input
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png"
                            className="hidden"
                            onChange={(e) =>
                              handleFileAttach(
                                docDef.docKey,
                                docDef.category,
                                e.target.files?.[0] ?? null
                              )
                            }
                          />
                        </label>
                      </div>
                    );
                  })
              )}

              {(currentUser.role === 'ADMIN' || currentUser.role === 'MANAGER') && (
                <div>
                  <label className="block font-medium mb-1">
                    Mandatory Doc Exception Reason (Manager/Admin Only)
                  </label>
                  <input
                    value={mandatoryDocExceptionReason}
                    onChange={(e) => setMandatoryDocExceptionReason(e.target.value)}
                    placeholder="Only needed if submitting before mandatory upload"
                    className="w-full h-8 px-2.5 border rounded bg-white dark:bg-neutral-950"
                  />
                </div>
              )}
            </div>

            {/* Optional Initial Counter Payment */}
            <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5 space-y-3 text-xs">
              <label className="flex items-center gap-2 font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  checked={collectInitialPayment}
                  onChange={(e) => setCollectInitialPayment(e.target.checked)}
                />
                Collect Initial Payment &amp; Issue MCR Receipt
              </label>

              {collectInitialPayment && (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block mb-1">Amount (₹)</label>
                      <input
                        type="number"
                        value={paymentAmount}
                        onChange={(e) => setPaymentAmount(Number(e.target.value))}
                        className="w-full h-8 px-2 border rounded font-mono bg-white dark:bg-neutral-950"
                      />
                    </div>
                    <div>
                      <label className="block mb-1">Method</label>
                      <select
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value as 'Cash' | 'UPI' | 'Card')}
                        className="w-full h-8 px-2 border rounded bg-white dark:bg-neutral-950"
                      >
                        <option value="Cash">Cash</option>
                        <option value="UPI">UPI</option>
                        <option value="Card">Card</option>
                      </select>
                    </div>
                  </div>
                  {paymentMethod === 'UPI' && (
                    <input
                      value={upiReference}
                      onChange={(e) => setUpiReference(e.target.value)}
                      placeholder="UPI Reference ID *"
                      className="w-full h-8 px-2 border rounded font-mono bg-white dark:bg-neutral-950"
                    />
                  )}
                </div>
              )}

              <div className="pt-2 flex flex-wrap justify-end gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={submitting}
                  onClick={() => handleSubmit('Draft')}
                >
                  Save Draft
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  loading={submitting}
                  onClick={() => handleSubmit('Submitted')}
                >
                  Submit Application
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
