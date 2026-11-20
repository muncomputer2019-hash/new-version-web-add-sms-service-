import React, { useMemo, useState } from 'react';
import { Plus, Search, Check } from 'lucide-react';
import {
  ApplicationRecord,
  CustomerRecord,
  NotificationItem,
  TransactionRecord,
} from '../modules/types';
import { Button } from '../components/Button';
import { DataTable, TableColumn } from '../components/DataTable';
import { StatusText } from '../components/StatusText';
import { formatCurrency, paginateArray } from '../services/apiClient';
import { formatDateIST } from '../services/formatters';
import { QuickCreateMode } from '../components/QuickCreateModal';

/* ---------------- Customers Directory ---------------- */
interface CustomersPageProps {
  customers: CustomerRecord[];
  onOpenQuickCreate: (mode: QuickCreateMode) => void;
}

export const CustomersPage: React.FC<CustomersPageProps> = ({
  customers,
  onOpenQuickCreate,
}) => {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return customers.filter(
      (c) =>
        !q ||
        c.fullName.toLowerCase().includes(q) ||
        c.customerCode.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q)
    );
  }, [customers, query]);

  const paginated = useMemo(() => paginateArray(filtered, page, 6), [filtered, page]);

  const columns: TableColumn<CustomerRecord>[] = [
    {
      key: 'code',
      header: 'Code',
      render: (r) => <span className="font-mono text-xs font-medium">{r.customerCode}</span>,
    },
    {
      key: 'name',
      header: 'Customer',
      render: (r) => (
        <div>
          <div className="font-medium text-neutral-950 dark:text-white">{r.fullName}</div>
          <div className="text-xs text-neutral-500 dark:text-neutral-400">{r.email}</div>
        </div>
      ),
    },
    {
      key: 'phone',
      header: 'Phone',
      className: 'hidden sm:table-cell',
      render: (r) => <span className="font-mono text-xs text-neutral-700 dark:text-neutral-300">{r.phone}</span>,
    },
    {
      key: 'segment',
      header: 'Segment',
      className: 'hidden md:table-cell',
      render: (r) => <span className="text-xs text-neutral-700 dark:text-neutral-300">{r.segment}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => <StatusText status={r.status} />,
    },
    {
      key: 'spent',
      header: 'Total Spent',
      align: 'right',
      render: (r) => (
        <span className="font-mono text-xs font-semibold tabular-nums">{formatCurrency(r.totalSpent)}</span>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-neutral-950 dark:text-white">Customers Directory</h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
            Client directory with duplicate Mobile/Aadhaar protection controlled via Master Settings
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={() => onOpenQuickCreate('customer')}
          icon={<Plus className="h-3.5 w-3.5" />}
        >
          Add Customer
        </Button>
      </div>

      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden">
        <div className="p-4 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between gap-3">
          <div className="relative w-full max-w-xs">
            <Search className="h-3.5 w-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search name, code, or phone..."
              className="w-full h-9 pl-8 pr-3 text-xs bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded-md focus:outline-none focus:border-blue-800"
            />
          </div>
          <span className="text-xs text-neutral-500 dark:text-neutral-400 tabular-nums shrink-0">
            {filtered.length} customers
          </span>
        </div>

        <DataTable
          columns={columns}
          data={paginated.items}
          rowKey={(c) => c.id}
          pagination={paginated.pagination}
          onPageChange={setPage}
        />
      </div>
    </div>
  );
};

/* ---------------- Applications Directory ---------------- */
interface ApplicationsPageProps {
  applications: ApplicationRecord[];
  onOpenQuickCreate: (mode: QuickCreateMode) => void;
  onSelectApplication: (app: ApplicationRecord) => void;
}

export const ApplicationsPage: React.FC<ApplicationsPageProps> = ({
  applications,
  onOpenQuickCreate,
  onSelectApplication,
}) => {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return applications.filter(
      (a) =>
        !q ||
        a.applicationNo.toLowerCase().includes(q) ||
        a.customerName.toLowerCase().includes(q) ||
        a.serviceName.toLowerCase().includes(q)
    );
  }, [applications, query]);

  const paginated = useMemo(() => paginateArray(filtered, page, 6), [filtered, page]);

  const columns: TableColumn<ApplicationRecord>[] = [
    {
      key: 'appNo',
      header: 'Application ID',
      render: (r) => <span className="font-mono text-xs font-medium">{r.applicationNo}</span>,
    },
    {
      key: 'customer',
      header: 'Customer & Service',
      render: (r) => (
        <div>
          <div className="font-medium text-neutral-950 dark:text-white">{r.customerName}</div>
          <div className="text-xs text-neutral-500 dark:text-neutral-400">{r.serviceName}</div>
        </div>
      ),
    },
    {
      key: 'assigned',
      header: 'Specialist',
      className: 'hidden sm:table-cell',
      render: (r) => <span className="text-xs text-neutral-700 dark:text-neutral-300">{r.assignedTo}</span>,
    },
    {
      key: 'dueDate',
      header: 'Due Date (IST)',
      className: 'hidden md:table-cell',
      render: (r) => (
        <span className="font-mono text-xs text-neutral-500 dark:text-neutral-400 tabular-nums">
          {formatDateIST(r.dueDate)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => <StatusText status={r.status} />,
    },
    {
      key: 'fee',
      header: 'Fee',
      align: 'right',
      render: (r) => (
        <span className="font-mono text-xs font-semibold tabular-nums">{formatCurrency(r.feeAmount)}</span>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-neutral-950 dark:text-white">Applications Queue</h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
            Click any application row to inspect details or update operational status
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={() => onOpenQuickCreate('application')}
          icon={<Plus className="h-3.5 w-3.5" />}
        >
          New Application
        </Button>
      </div>

      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden">
        <div className="p-4 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between gap-3">
          <div className="relative w-full max-w-xs">
            <Search className="h-3.5 w-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search ID, customer, or service..."
              className="w-full h-9 pl-8 pr-3 text-xs bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded-md focus:outline-none focus:border-blue-800"
            />
          </div>
          <span className="text-xs text-neutral-500 dark:text-neutral-400 tabular-nums shrink-0">
            {filtered.length} applications
          </span>
        </div>

        <DataTable
          columns={columns}
          data={paginated.items}
          rowKey={(a) => a.id}
          pagination={paginated.pagination}
          onPageChange={setPage}
          onRowClick={onSelectApplication}
        />
      </div>
    </div>
  );
};

/* ---------------- Transactions Ledger Preview ---------------- */
export const TransactionsPage: React.FC<{ transactions: TransactionRecord[] }> = ({
  transactions,
}) => {
  const [page, setPage] = useState(1);
  const paginated = useMemo(() => paginateArray(transactions, page, 6), [transactions, page]);

  const columns: TableColumn<TransactionRecord>[] = [
    {
      key: 'ref',
      header: 'Reference No',
      render: (r) => <span className="font-mono text-xs font-medium">{r.referenceNo}</span>,
    },
    {
      key: 'customer',
      header: 'Customer',
      render: (r) => (
        <div>
          <div className="font-medium text-neutral-950 dark:text-white">{r.customerName}</div>
          <div className="text-xs font-mono text-neutral-500 dark:text-neutral-400">{r.applicationNo}</div>
        </div>
      ),
    },
    {
      key: 'method',
      header: 'Method',
      render: (r) => <span className="text-xs text-neutral-700 dark:text-neutral-300">{r.paymentMethod}</span>,
    },
    {
      key: 'date',
      header: 'Date (IST)',
      className: 'hidden sm:table-cell',
      render: (r) => (
        <span className="font-mono text-xs text-neutral-500 dark:text-neutral-400 tabular-nums">
          {formatDateIST(r.recordedAt.slice(0, 10))}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => <StatusText status={r.status} />,
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      render: (r) => (
        <span className="font-mono text-xs font-semibold tabular-nums">{formatCurrency(r.amount)}</span>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-neutral-950 dark:text-white">Transactions Ledger</h2>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
          Counter settlements in INR (₹) · Sequential FY receipt numbering managed in Master Settings
        </p>
      </div>

      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden">
        <DataTable
          columns={columns}
          data={paginated.items}
          rowKey={(t) => t.id}
          pagination={paginated.pagination}
          onPageChange={setPage}
        />
      </div>
    </div>
  );
};

/* ---------------- Notifications Center ---------------- */
export const NotificationsPage: React.FC<{
  notifications: NotificationItem[];
  liveDispatches?: Array<{
    id: number;
    applicationNo?: string;
    customerId: string;
    channel: string;
    eventKey: string;
    recipient: string;
    messagePreview: string;
    consentGranted: boolean;
    status: string;
    statusReason: string;
    createdAt: string;
  }>;
  onMarkAllRead: () => void;
}> = ({ notifications, liveDispatches = [], onMarkAllRead }) => {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-neutral-950 dark:text-white">
            Notifications &amp; Consent-Gated Dispatches
          </h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
            Internal dashboard alerts and external SMS/WhatsApp/Email dispatch status (strictly checked against Customer Consent &amp; Master Settings credentials)
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onMarkAllRead}
          icon={<Check className="h-3.5 w-3.5" />}
        >
          Mark All Read
        </Button>
      </div>

      {liveDispatches.length > 0 && (
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 text-xs font-semibold">
            Live Customer &amp; Application Notification Log ({liveDispatches.length})
          </div>
          <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {liveDispatches.map((d) => (
              <div key={d.id} className="p-4 flex flex-wrap items-start justify-between gap-3 text-xs">
                <div>
                  <div className="flex items-center gap-2 font-mono text-neutral-500">
                    <span className="font-bold text-neutral-950 dark:text-white">{d.channel}</span>
                    <span>·</span>
                    <span>{d.applicationNo || d.customerId}</span>
                    <span>·</span>
                    <span>Consent: {d.consentGranted ? 'Granted' : 'Not Granted'}</span>
                  </div>
                  <div className="mt-1 text-sm font-medium text-neutral-950 dark:text-white">
                    {d.messagePreview}
                  </div>
                  <div className="mt-0.5 text-neutral-500">{d.statusReason}</div>
                </div>
                <span className="font-mono font-semibold text-xs text-neutral-900 dark:text-neutral-100">
                  {d.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg divide-y divide-neutral-100 dark:divide-neutral-800">
        {notifications.map((n) => (
          <div key={n.id} className="p-4 sm:p-5 flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
                <span className="font-medium text-neutral-700 dark:text-neutral-300">{n.category}</span>
                <span aria-hidden="true">·</span>
                <span>{n.createdAt}</span>
                {!n.isRead && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-blue-800 dark:text-blue-400 font-semibold">Unread</span>
                  </>
                )}
              </div>
              <h3 className="mt-1 text-sm font-semibold text-neutral-950 dark:text-white">{n.title}</h3>
              <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">{n.message}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

