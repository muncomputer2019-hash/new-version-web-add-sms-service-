import React, { useMemo, useState } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import {
  CustomerRecord,
} from '../modules/types';
import { extractFriendlyErrorMessage } from '../services/firebase';

export type QuickCreateMode = 'application' | 'customer';

interface QuickCreateModalProps {
  isOpen: boolean;
  mode: QuickCreateMode;
  customers: CustomerRecord[];
  onClose: () => void;
  onCreateCustomer: (
    customer: Omit<CustomerRecord, 'id' | 'customerCode' | 'totalApplications' | 'totalSpent' | 'createdAt'>
  ) => Promise<void> | void;
  onCreateApplication: (app: {
    customerId: number;
    serviceName: string;
    category: string;
    feeAmount: number;
    paidAmount: number;
    assignedTo: string;
    dueDate: string;
    notes: string;
  }) => Promise<void> | void;
}

export const QuickCreateModal: React.FC<QuickCreateModalProps> = ({
  isOpen,
  mode,
  customers,
  onClose,
  onCreateCustomer,
  onCreateApplication,
}) => {
  // Customer form state
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [segment, setSegment] = useState<'Individual' | 'Corporate' | 'Government'>('Individual');

  // Application form state
  const [customerId, setCustomerId] = useState<string>(
    customers[0]?.id ? String(customers[0].id) : ''
  );
  const [serviceName, setServiceName] = useState('');
  const [category, setCategory] = useState('Online Application');
  const [feeAmount, setFeeAmount] = useState('');
  const [paidAmount, setPaidAmount] = useState('0');
  const [assignedTo, setAssignedTo] = useState('Rashed Khan');
  const [dueDate, setDueDate] = useState('2026-11-18');
  const [notes, setNotes] = useState('');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const selectedCustomerValid = useMemo(
    () => customers.some((c) => String(c.id) === customerId),
    [customers, customerId]
  );

  const resetForms = () => {
    setFullName('');
    setPhone('');
    setEmail('');
    setSegment('Individual');
    setServiceName('');
    setFeeAmount('');
    setPaidAmount('0');
    setNotes('');
    setErrors({});
    setSubmitError(null);
  };

  const handleClose = () => {
    resetForms();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nextErrors: Record<string, string> = {};

    if (mode === 'customer') {
      if (!fullName.trim() || fullName.trim().length < 2) {
        nextErrors.fullName = 'Customer full name must be at least 2 characters.';
      }
      if (!phone.trim() || phone.trim().length < 8) {
        nextErrors.phone = 'Enter a valid contact phone number (at least 8 digits).';
      }
      if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        nextErrors.email = 'Enter a valid email address.';
      }
    } else {
      if (!selectedCustomerValid) {
        nextErrors.customerId = 'Please select an existing customer.';
      }
      if (!serviceName.trim() || serviceName.trim().length < 3) {
        nextErrors.serviceName = 'Service title must be at least 3 characters.';
      }
      const parsedFee = Number(feeAmount);
      const parsedPaid = Number(paidAmount || '0');
      if (Number.isNaN(parsedFee) || parsedFee <= 0) {
        nextErrors.feeAmount = 'Fee amount must be greater than 0.';
      }
      if (Number.isNaN(parsedPaid) || parsedPaid < 0) {
        nextErrors.paidAmount = 'Paid amount cannot be negative.';
      } else if (!Number.isNaN(parsedFee) && parsedPaid > parsedFee) {
        nextErrors.paidAmount = 'Paid amount cannot exceed total fee.';
      }
      if (!dueDate) {
        nextErrors.dueDate = 'Select a target completion date.';
      }
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setSubmitError(null);
    setSubmitting(true);
    try {
      if (mode === 'customer') {
        await onCreateCustomer({
          fullName: fullName.trim(),
          phone: phone.trim(),
          email: email.trim(),
          segment,
          status: 'Active',
        });
      } else {
        await onCreateApplication({
          customerId: Number(customerId),
          serviceName: serviceName.trim(),
          category,
          feeAmount: Number(feeAmount),
          paidAmount: Number(paidAmount || '0'),
          assignedTo,
          dueDate,
          notes: notes.trim(),
        });
      }
      handleClose();
    } catch (err) {
      setSubmitError(extractFriendlyErrorMessage(err, 'Unable to save record. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={mode === 'customer' ? 'Register New Customer' : 'New Service Application'}
      subtitle="Saves directly to live Cloud Firestore database."
      size="md"
      footer={
        <>
          <Button variant="outline" size="sm" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="quick-create-form"
            variant="primary"
            size="sm"
            loading={submitting}
          >
            {mode === 'customer' ? 'Save Customer' : 'Create Application'}
          </Button>
        </>
      }
    >
      <form id="quick-create-form" onSubmit={handleSubmit} className="space-y-4" noValidate>
        {submitError && (
          <div role="alert" className="px-3 py-2 text-xs rounded border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300">
            {submitError}
          </div>
        )}
        {mode === 'customer' ? (
          <>
            <div>
              <label htmlFor="qc-fullname" className="block text-xs font-medium text-neutral-800 dark:text-neutral-200 mb-1.5">
                Full Name or Organization <span className="text-red-600">*</span>
              </label>
              <input
                id="qc-fullname"
                type="text"
                value={fullName}
                onChange={(e) => {
                  setFullName(e.target.value);
                  setErrors((prev) => ({ ...prev, fullName: '' }));
                }}
                placeholder="e.g. Mahmudul Hasan"
                className="w-full h-10 px-3 text-sm bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-md text-neutral-950 dark:text-neutral-100 focus:outline-none focus:border-blue-800"
              />
              {errors.fullName && (
                <p className="mt-1 text-xs text-red-600">{errors.fullName}</p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="qc-phone" className="block text-xs font-medium text-neutral-800 dark:text-neutral-200 mb-1.5">
                  Phone Number <span className="text-red-600">*</span>
                </label>
                <div className="flex rounded-md border border-neutral-200 dark:border-neutral-800 overflow-hidden bg-white dark:bg-neutral-950">
                  <span className="inline-flex items-center px-3 bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 text-xs font-mono font-medium border-r border-neutral-200 dark:border-neutral-800">
                    +91
                  </span>
                  <input
                    id="qc-phone"
                    required
                    type="tel"
                    inputMode="numeric"
                    autoComplete="off"
                    value={phone}
                    onChange={(e) => {
                      setPhone(e.target.value.replace(/\D/g, '').slice(0, 10));
                      setErrors((prev) => ({ ...prev, phone: '' }));
                    }}
                    placeholder="9830000000"
                    className="w-full h-10 px-3 border-0 bg-transparent text-sm font-mono focus:outline-none"
                  />
                </div>
                {errors.phone && (
                  <p className="mt-1 text-xs text-red-600">{errors.phone}</p>
                )}
              </div>

              <div>
                <label htmlFor="qc-segment" className="block text-xs font-medium text-neutral-800 dark:text-neutral-200 mb-1.5">
                  Customer Segment
                </label>
                <select
                  id="qc-segment"
                  value={segment}
                  onChange={(e) =>
                    setSegment(e.target.value as 'Individual' | 'Corporate' | 'Government')
                  }
                  className="w-full h-10 px-3 text-sm bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-md text-neutral-950 dark:text-neutral-100 focus:outline-none focus:border-blue-800"
                >
                  <option value="Individual">Individual</option>
                  <option value="Corporate">Corporate</option>
                  <option value="Government">Government</option>
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="qc-email" className="block text-xs font-medium text-neutral-800 dark:text-neutral-200 mb-1.5">
                Email Address (Optional)
              </label>
              <input
                id="qc-email"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setErrors((prev) => ({ ...prev, email: '' }));
                }}
                placeholder="client@example.com"
                className="w-full h-10 px-3 text-sm bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-md text-neutral-950 dark:text-neutral-100 focus:outline-none focus:border-blue-800"
              />
              {errors.email && (
                <p className="mt-1 text-xs text-red-600">{errors.email}</p>
              )}
            </div>
          </>
        ) : (
          <>
            <div>
              <label htmlFor="qa-customer" className="block text-xs font-medium text-neutral-800 dark:text-neutral-200 mb-1.5">
                Customer <span className="text-red-600">*</span>
              </label>
              <select
                id="qa-customer"
                value={customerId}
                onChange={(e) => {
                  setCustomerId(e.target.value);
                  setErrors((prev) => ({ ...prev, customerId: '' }));
                }}
                className="w-full h-10 px-3 text-sm bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-md text-neutral-950 dark:text-neutral-100 focus:outline-none focus:border-blue-800"
              >
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.fullName} ({c.customerCode})
                  </option>
                ))}
              </select>
              {errors.customerId && (
                <p className="mt-1 text-xs text-red-600">{errors.customerId}</p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="qa-service" className="block text-xs font-medium text-neutral-800 dark:text-neutral-200 mb-1.5">
                  Service Title <span className="text-red-600">*</span>
                </label>
                <input
                  id="qa-service"
                  type="text"
                  value={serviceName}
                  onChange={(e) => {
                    setServiceName(e.target.value);
                    setErrors((prev) => ({ ...prev, serviceName: '' }));
                  }}
                  placeholder="e.g. SSD Upgrade & OS Install"
                  className="w-full h-10 px-3 text-sm bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-md text-neutral-950 dark:text-neutral-100 focus:outline-none focus:border-blue-800"
                />
                {errors.serviceName && (
                  <p className="mt-1 text-xs text-red-600">{errors.serviceName}</p>
                )}
              </div>

              <div>
                <label htmlFor="qa-category" className="block text-xs font-medium text-neutral-800 dark:text-neutral-200 mb-1.5">
                  Category
                </label>
                <select
                  id="qa-category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full h-10 px-3 text-sm bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-md text-neutral-950 dark:text-neutral-100 focus:outline-none focus:border-blue-800"
                >
                  <option value="Online Application">Online Application</option>
                  <option value="Software Service">Software Service</option>
                  <option value="Hardware Repair">Hardware Repair</option>
                  <option value="Hardware Upgrade">Hardware Upgrade</option>
                  <option value="IT Infrastructure">IT Infrastructure</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label htmlFor="qa-fee" className="block text-xs font-medium text-neutral-800 dark:text-neutral-200 mb-1.5">
                  Fee Amount (₹) <span className="text-red-600">*</span>
                </label>
                <input
                  id="qa-fee"
                  type="number"
                  min="1"
                  step="0.01"
                  value={feeAmount}
                  onChange={(e) => {
                    setFeeAmount(e.target.value);
                    setErrors((prev) => ({ ...prev, feeAmount: '' }));
                  }}
                  placeholder="500.00"
                  className="w-full h-10 px-3 text-sm font-mono tabular-nums bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-md text-neutral-950 dark:text-neutral-100 focus:outline-none focus:border-blue-800"
                />
                {errors.feeAmount && (
                  <p className="mt-1 text-xs text-red-600">{errors.feeAmount}</p>
                )}
              </div>

              <div>
                <label htmlFor="qa-paid" className="block text-xs font-medium text-neutral-800 dark:text-neutral-200 mb-1.5">
                  Advance Paid (₹)
                </label>
                <input
                  id="qa-paid"
                  type="number"
                  min="0"
                  step="0.01"
                  value={paidAmount}
                  onChange={(e) => {
                    setPaidAmount(e.target.value);
                    setErrors((prev) => ({ ...prev, paidAmount: '' }));
                  }}
                  className="w-full h-10 px-3 text-sm font-mono tabular-nums bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-md text-neutral-950 dark:text-neutral-100 focus:outline-none focus:border-blue-800"
                />
                {errors.paidAmount && (
                  <p className="mt-1 text-xs text-red-600">{errors.paidAmount}</p>
                )}
              </div>

              <div>
                <label htmlFor="qa-due" className="block text-xs font-medium text-neutral-800 dark:text-neutral-200 mb-1.5">
                  Due Date <span className="text-red-600">*</span>
                </label>
                <input
                  id="qa-due"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full h-10 px-3 text-sm font-mono bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-md text-neutral-950 dark:text-neutral-100 focus:outline-none focus:border-blue-800"
                />
              </div>
            </div>

            <div>
              <label htmlFor="qa-assigned" className="block text-xs font-medium text-neutral-800 dark:text-neutral-200 mb-1.5">
                Assign Specialist
              </label>
              <select
                id="qa-assigned"
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                className="w-full h-10 px-3 text-sm bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-md text-neutral-950 dark:text-neutral-100 focus:outline-none focus:border-blue-800"
              >
                <option value="Rashed Khan">Rashed Khan</option>
                <option value="Nadia Sultana">Nadia Sultana</option>
                <option value="Tanvir Ahmed">Tanvir Ahmed</option>
              </select>
            </div>

            <div>
              <label htmlFor="qa-notes" className="block text-xs font-medium text-neutral-800 dark:text-neutral-200 mb-1.5">
                Notes (Optional)
              </label>
              <textarea
                id="qa-notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Required documents or hardware notes..."
                className="w-full px-3 py-2 text-sm bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-md text-neutral-950 dark:text-neutral-100 focus:outline-none focus:border-blue-800"
              />
            </div>
          </>
        )}
      </form>
    </Modal>
  );
};
