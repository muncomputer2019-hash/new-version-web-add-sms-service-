import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  PauseCircle,
  RefreshCw,
  ShieldAlert,
  XCircle,
} from 'lucide-react';

export type StatusValue =
  | 'Completed'
  | 'Paid'
  | 'Active'
  | 'Processing'
  | 'Pending'
  | 'On Hold'
  | 'Inactive'
  | 'Refunded'
  | 'ACTIVE'
  | 'PENDING'
  | 'SUSPENDED'
  | 'DEACTIVATED'
  | 'REJECTED'
  | 'APPROVED'
  | 'CORRECTION_REQUIRED'
  | 'REVOKED'
  | 'EXPIRED'
  | 'SUCCESS'
  | 'FAILURE'
  | 'BLOCKED';

interface StatusTextProps {
  status: StatusValue | string;
}

const STATUS_MAP: Record<
  string,
  { colorClass: string; Icon: React.ComponentType<{ className?: string }>; label?: string }
> = {
  Completed: { colorClass: 'text-emerald-700 dark:text-emerald-400', Icon: CheckCircle2 },
  Paid: { colorClass: 'text-emerald-700 dark:text-emerald-400', Icon: CheckCircle2 },
  Active: { colorClass: 'text-emerald-700 dark:text-emerald-400', Icon: CheckCircle2 },
  ACTIVE: { colorClass: 'text-emerald-700 dark:text-emerald-400', Icon: CheckCircle2 },
  APPROVED: { colorClass: 'text-emerald-700 dark:text-emerald-400', Icon: CheckCircle2 },
  Approved: { colorClass: 'text-emerald-700 dark:text-emerald-400', Icon: CheckCircle2 },
  SUCCESS: { colorClass: 'text-emerald-700 dark:text-emerald-400', Icon: CheckCircle2 },
  Success: { colorClass: 'text-emerald-700 dark:text-emerald-400', Icon: CheckCircle2 },
  Connected: { colorClass: 'text-emerald-700 dark:text-emerald-400', Icon: CheckCircle2 },
  Restored: { colorClass: 'text-blue-800 dark:text-blue-400', Icon: RefreshCw },
  Processing: { colorClass: 'text-blue-800 dark:text-blue-400', Icon: RefreshCw },
  Pending: { colorClass: 'text-amber-700 dark:text-amber-400', Icon: Clock },
  PENDING: { colorClass: 'text-amber-700 dark:text-amber-400', Icon: Clock },
  'Pending Admin Approval': { colorClass: 'text-amber-700 dark:text-amber-400', Icon: Clock },
  CORRECTION_REQUIRED: {
    colorClass: 'text-amber-700 dark:text-amber-400',
    Icon: AlertTriangle,
    label: 'CORRECTION',
  },
  'On Hold': { colorClass: 'text-neutral-600 dark:text-neutral-400', Icon: PauseCircle },
  Inactive: { colorClass: 'text-neutral-500 dark:text-neutral-400', Icon: XCircle },
  'Not Tested': { colorClass: 'text-neutral-500 dark:text-neutral-400', Icon: Clock },
  DEACTIVATED: { colorClass: 'text-neutral-500 dark:text-neutral-400', Icon: XCircle },
  EXPIRED: { colorClass: 'text-neutral-500 dark:text-neutral-400', Icon: Clock },
  SUSPENDED: { colorClass: 'text-red-600 dark:text-red-400', Icon: ShieldAlert },
  REJECTED: { colorClass: 'text-red-600 dark:text-red-400', Icon: XCircle },
  Rejected: { colorClass: 'text-red-600 dark:text-red-400', Icon: XCircle },
  REVOKED: { colorClass: 'text-red-600 dark:text-red-400', Icon: XCircle },
  FAILURE: { colorClass: 'text-red-600 dark:text-red-400', Icon: XCircle },
  Failed: { colorClass: 'text-red-600 dark:text-red-400', Icon: XCircle },
  BLOCKED: { colorClass: 'text-red-600 dark:text-red-400', Icon: ShieldAlert },
  Refunded: { colorClass: 'text-red-600 dark:text-red-400', Icon: XCircle },
  Cancelled: { colorClass: 'text-red-600 dark:text-red-400', Icon: XCircle },
  Draft: { colorClass: 'text-neutral-500 dark:text-neutral-400', Icon: Clock },
  'Document Required': { colorClass: 'text-amber-700 dark:text-amber-400', Icon: AlertTriangle },
  'Document Pending': { colorClass: 'text-amber-700 dark:text-amber-400', Icon: AlertTriangle },
  'Document Verified': { colorClass: 'text-emerald-700 dark:text-emerald-400', Icon: CheckCircle2 },
  'Ready to Process': { colorClass: 'text-blue-800 dark:text-blue-400', Icon: Clock },
  'Ready to Submit': { colorClass: 'text-blue-800 dark:text-blue-400', Icon: Clock },
  'e-KYC Pending': { colorClass: 'text-amber-700 dark:text-amber-400', Icon: AlertTriangle },
  'e-KYC Completed': { colorClass: 'text-emerald-700 dark:text-emerald-400', Icon: CheckCircle2 },
  Submitted: { colorClass: 'text-blue-800 dark:text-blue-400', Icon: RefreshCw },
  'Under Verification': { colorClass: 'text-blue-800 dark:text-blue-400', Icon: RefreshCw },
  'Under Process': { colorClass: 'text-blue-800 dark:text-blue-400', Icon: RefreshCw },
  'Acknowledgement Received': { colorClass: 'text-blue-800 dark:text-blue-400', Icon: CheckCircle2 },
  Forwarded: { colorClass: 'text-blue-800 dark:text-blue-400', Icon: RefreshCw },
  'Reply Received': { colorClass: 'text-emerald-700 dark:text-emerald-400', Icon: CheckCircle2 },
  'Card Generated': { colorClass: 'text-emerald-700 dark:text-emerald-400', Icon: CheckCircle2 },
  'Card Downloaded': { colorClass: 'text-emerald-700 dark:text-emerald-400', Icon: CheckCircle2 },
  Delivered: { colorClass: 'text-emerald-700 dark:text-emerald-400', Icon: CheckCircle2 },
  Resolved: { colorClass: 'text-emerald-700 dark:text-emerald-400', Icon: CheckCircle2 },
  Closed: { colorClass: 'text-neutral-600 dark:text-neutral-400', Icon: CheckCircle2 },
  Unpaid: { colorClass: 'text-red-600 dark:text-red-400', Icon: AlertTriangle },
  Partial: { colorClass: 'text-amber-700 dark:text-amber-400', Icon: Clock },
  Due: { colorClass: 'text-amber-700 dark:text-amber-400', Icon: AlertTriangle },
};

export const StatusText: React.FC<StatusTextProps> = ({ status }) => {
  const config = STATUS_MAP[status] ?? {
    colorClass: 'text-neutral-700 dark:text-neutral-300',
    Icon: Clock,
  };
  const { colorClass, Icon, label } = config;

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap ${colorClass}`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{label ?? status}</span>
    </span>
  );
};
