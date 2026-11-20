import React from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { StatusText } from './StatusText';
import { ApplicationRecord } from '../modules/types';
import { formatCurrency } from '../services/apiClient';

interface ApplicationDetailModalProps {
  application: ApplicationRecord | null;
  onClose: () => void;
  onUpdateStatus: (id: number, status: ApplicationRecord['status']) => void;
}

export const ApplicationDetailModal: React.FC<ApplicationDetailModalProps> = ({
  application,
  onClose,
  onUpdateStatus,
}) => {
  if (!application) return null;

  const balanceDue = Math.max(0, application.feeAmount - application.paidAmount);

  return (
    <Modal
      isOpen={Boolean(application)}
      onClose={onClose}
      title={application.applicationNo}
      subtitle={`${application.serviceName} · Submitted ${application.submittedAt}`}
      size="md"
      footer={
        <div className="flex flex-wrap items-center justify-between w-full gap-2">
          <div className="flex items-center gap-2">
            {application.status !== 'Completed' && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  onUpdateStatus(application.id, 'Completed');
                  onClose();
                }}
              >
                Mark Completed
              </Button>
            )}
            {application.status === 'Pending' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  onUpdateStatus(application.id, 'Processing');
                  onClose();
                }}
              >
                Move to Processing
              </Button>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-neutral-100 dark:border-neutral-800">
          <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Current Status</span>
          <StatusText status={application.status} />
        </div>

        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <div>
            <dt className="text-xs text-neutral-500 dark:text-neutral-400">Customer</dt>
            <dd className="font-medium text-neutral-950 dark:text-neutral-100 mt-0.5">{application.customerName}</dd>
          </div>
          <div>
            <dt className="text-xs text-neutral-500 dark:text-neutral-400">Contact Phone</dt>
            <dd className="font-mono text-xs text-neutral-800 dark:text-neutral-200 mt-1">{application.customerPhone}</dd>
          </div>
          <div>
            <dt className="text-xs text-neutral-500 dark:text-neutral-400">Category</dt>
            <dd className="text-neutral-900 dark:text-neutral-200 mt-0.5">{application.category}</dd>
          </div>
          <div>
            <dt className="text-xs text-neutral-500 dark:text-neutral-400">Assigned Staff</dt>
            <dd className="text-neutral-900 dark:text-neutral-200 mt-0.5">{application.assignedTo}</dd>
          </div>
          <div>
            <dt className="text-xs text-neutral-500 dark:text-neutral-400">Due Date</dt>
            <dd className="font-mono text-xs text-neutral-800 dark:text-neutral-200 mt-1">{application.dueDate}</dd>
          </div>
          <div>
            <dt className="text-xs text-neutral-500 dark:text-neutral-400">Total Fee / Paid</dt>
            <dd className="font-mono tabular-nums text-neutral-950 dark:text-neutral-100 mt-0.5">
              {formatCurrency(application.feeAmount)} · Paid {formatCurrency(application.paidAmount)}
            </dd>
          </div>
        </dl>

        <div className="flex items-center justify-between pt-3 border-t border-neutral-100 dark:border-neutral-800 text-sm">
          <span className="text-neutral-600 dark:text-neutral-400">Balance Due</span>
          <span
            className={`font-mono font-semibold tabular-nums ${
              balanceDue > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400'
            }`}
          >
            {formatCurrency(balanceDue)}
          </span>
        </div>

        {application.notes && (
          <div className="pt-3 border-t border-neutral-100 dark:border-neutral-800">
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-1">Operational Notes</p>
            <p className="text-sm text-neutral-700 dark:text-neutral-300">{application.notes}</p>
          </div>
        )}
      </div>
    </Modal>
  );
};
