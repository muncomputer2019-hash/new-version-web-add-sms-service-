import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FileDown,
  FileSpreadsheet,
  Printer,
  Layers,
  Search,
  CheckSquare,
  Square,
  RefreshCw,
} from 'lucide-react';
import { CompanyProfileSettings, UserProfile } from '../../modules/types';
import { formatINR } from '../../services/formatters';
import {
  ReportCatalogItem,
  ReportCategoryKey,
  ReportColumnDef,
  ReportDataset,
  reportApi,
} from '../../services/reportApi';
import { Button } from '../../components/Button';
import { ReportPrintModal } from './ReportPrintModal';

import { Pagination } from '../../components/Pagination';
import { paginateArray } from '../../services/apiClient';

interface AllReportsCenterPageProps {
  currentUser: UserProfile;
  companyProfile?: CompanyProfileSettings | null;
  initialReportKey?: string | null;
  onShowToast: (type: 'success' | 'error' | 'info', title: string, description?: string) => void;
}

const CATEGORY_TABS: Array<{ key: ReportCategoryKey; label: string }> = [
  { key: 'CUSTOMER', label: 'Customer Reports (13)' },
  { key: 'APPLICATION_SERVICE', label: 'Application & Service (13)' },
  { key: 'FINANCIAL', label: 'Financial Reports (19)' },
  { key: 'BUSINESS_INVENTORY', label: 'Business & Inventory' },
  { key: 'CSC_OPERATIONS', label: 'CSC Digital Services (25)' },
];

export const AllReportsCenterPage: React.FC<AllReportsCenterPageProps> = ({
  currentUser,
  companyProfile,
  initialReportKey,
  onShowToast,
}) => {
  const [catalog, setCatalog] = useState<ReportCatalogItem[]>([]);
  const [activeCategory, setActiveCategory] = useState<ReportCategoryKey>('CUSTOMER');
  const [selectedKey, setSelectedKey] = useState<string>(initialReportKey || 'CUST_COMPLETE_LIST');
  const [dataset, setDataset] = useState<ReportDataset | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Filters
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [financialYear, setFinancialYear] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [searchFilter, setSearchFilter] = useState('');
  const [exportLang, setExportLang] = useState<'en' | 'bn'>('en');

  // Selected row checkboxes, sorting, pagination & multi-report PDF bundle
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
  const [bundleKeys, setBundleKeys] = useState<string[]>([]);
  const [sortCol, setSortCol] = useState<string>('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [tablePage, setTablePage] = useState(1);
  const [printOpen, setPrintOpen] = useState(false);

  useEffect(() => {
    reportApi
      .getCatalog()
      .then((res) => {
        setCatalog(res.data);
        if (initialReportKey) {
          const found = res.data.find((c) => c.reportKey === initialReportKey);
          if (found) {
            setActiveCategory(found.category);
            setSelectedKey(found.reportKey);
          }
        } else {
          const firstEnabled = res.data.find((c) => c.category === 'CUSTOMER' && c.enabled) || res.data.find((c) => c.enabled);
          if (firstEnabled) {
            setActiveCategory(firstEnabled.category);
            setSelectedKey(firstEnabled.reportKey);
          }
        }
      })
      .catch((err) => {
        onShowToast('error', 'Failed to load catalog', err instanceof Error ? err.message : undefined);
      });
  }, [initialReportKey, onShowToast]);

  const runSelectedReport = useCallback(
    async (keyToRun = selectedKey) => {
      if (!keyToRun) return;
      setLoading(true);
      setSelectedRowKeys([]);
      try {
        const res = await reportApi.generateReport(keyToRun, {
          fromDate: fromDate || undefined,
          toDate: toDate || undefined,
          financialYear: financialYear !== 'ALL' ? financialYear : undefined,
          status: statusFilter || undefined,
          location: locationFilter || undefined,
          search: searchFilter || undefined,
        });
        setDataset(res.data);
        setTablePage(1);
        setSortCol('');
      } catch (err) {
        onShowToast('error', 'Report Restricted or Failed', err instanceof Error ? err.message : undefined);
        setDataset(null);
      } finally {
        setLoading(false);
      }
    },
    [selectedKey, fromDate, toDate, financialYear, statusFilter, locationFilter, searchFilter, onShowToast]
  );

  useEffect(() => {
    if (selectedKey) {
      runSelectedReport(selectedKey);
    }
  }, [selectedKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const categoryItems = useMemo(
    () => catalog.filter((c) => c.category === activeCategory && c.enabled),
    [catalog, activeCategory]
  );

  const sortedRows = useMemo(() => {
    if (!dataset) return [];
    const rows = [...dataset.rows];
    if (!sortCol) return rows;
    return rows.sort((a, b) => {
      const av = a[sortCol];
      const bv = b[sortCol];
      if (av === bv) return 0;
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      const cmp =
        typeof av === 'number' && typeof bv === 'number'
          ? av - bv
          : String(av).localeCompare(String(bv), undefined, { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [dataset, sortCol, sortDir]);

  const paginatedDataset = useMemo(
    () => paginateArray(sortedRows, tablePage, 20),
    [sortedRows, tablePage]
  );

  const canExportPdf =
    currentUser.role === 'ADMIN' || Boolean(currentUser.permissions?.['report.export.pdf']);
  const canExportExcel =
    currentUser.role === 'ADMIN' || Boolean(currentUser.permissions?.['report.export.excel']);
  const canPrint =
    currentUser.role === 'ADMIN' || Boolean(currentUser.permissions?.['report.print']);

  const toggleRowSelect = (rowKey: string) => {
    setSelectedRowKeys((prev) =>
      prev.includes(rowKey) ? prev.filter((k) => k !== rowKey) : [...prev, rowKey]
    );
  };

  const toggleBundleReport = (key: string) => {
    setBundleKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const handleExport = async (type: 'PDF' | 'XLSX' | 'CSV') => {
    if (!dataset) return;
    setExporting(true);
    try {
      const filters = {
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        financialYear: financialYear !== 'ALL' ? financialYear : undefined,
        status: statusFilter || undefined,
        location: locationFilter || undefined,
        search: searchFilter || undefined,
      };
      if (type === 'PDF') {
        const res = await reportApi.exportPdf({
          reportKey: dataset.reportKey,
          filters,
          language: exportLang,
          selectedRowIds: selectedRowKeys.length > 0 ? selectedRowKeys : undefined,
          saveToArchive: true,
        });
        onShowToast('success', 'PDF Downloaded', res.archiveCode ? `Archived as ${res.archiveCode}` : res.filename);
      } else {
        const res = await reportApi.exportExcel({
          reportKey: dataset.reportKey,
          filters,
          format: type === 'CSV' ? 'csv' : 'xlsx',
          language: exportLang,
          selectedRowIds: selectedRowKeys.length > 0 ? selectedRowKeys : undefined,
          saveToArchive: true,
        });
        onShowToast('success', `${type} Downloaded`, res.archiveCode ? `Archived as ${res.archiveCode}` : res.filename);
      }
    } catch (err) {
      onShowToast('error', `${type} Export Failed`, err instanceof Error ? err.message : undefined);
    } finally {
      setExporting(false);
    }
  };

  const handleCombinedPdf = async () => {
    if (bundleKeys.length < 2) {
      onShowToast('info', 'Select at least 2 reports', 'Check 2 or more reports in the catalog list to build a Combined PDF.');
      return;
    }
    setExporting(true);
    try {
      const res = await reportApi.exportPdf(
        {
          reportKeys: bundleKeys,
          filters: {
            fromDate: fromDate || undefined,
            toDate: toDate || undefined,
            financialYear: financialYear !== 'ALL' ? financialYear : undefined,
          },
          language: exportLang,
          saveToArchive: true,
        },
        'MUN_COMBINED_REPORT.pdf'
      );
      onShowToast('success', 'Combined Multi-Section PDF Exported', res.archiveCode ? `Archive: ${res.archiveCode}` : res.filename);
    } catch (err) {
      onShowToast('error', 'Combined PDF Failed', err instanceof Error ? err.message : undefined);
    } finally {
      setExporting(false);
    }
  };

  const formatCell = (col: ReportColumnDef, val: unknown) => {
    if (val === null || val === undefined || val === '') return '—';
    if (col.type === 'currency') {
      const num = Number(val);
      return Number.isFinite(num) ? formatINR(num) : String(val);
    }
    if (col.type === 'number') {
      const num = Number(val);
      return Number.isFinite(num) ? new Intl.NumberFormat('en-IN').format(num) : String(val);
    }
    return String(val);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-neutral-950 dark:text-white tracking-tight">
            All Reports Center
          </h1>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
            Customer, Application, Service, Financial (Posted GL), and Business Inventory reports with Unicode PDF, multi-sheet Excel, CSV &amp; Print Studio.
          </p>
        </div>

        {bundleKeys.length > 0 && (
          <Button
            variant="primary"
            size="sm"
            loading={exporting}
            disabled={!canExportPdf}
            onClick={handleCombinedPdf}
            icon={<Layers className="h-3.5 w-3.5" />}
          >
            Export Combined PDF ({bundleKeys.length} Selected)
          </Button>
        )}
      </div>

      {/* Category Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-neutral-200 dark:border-neutral-800 pb-3">
        {CATEGORY_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => {
              setActiveCategory(tab.key);
              const first = catalog.find((c) => c.category === tab.key && c.enabled);
              if (first) setSelectedKey(first.reportKey);
            }}
            className={`px-3.5 py-2 rounded-md text-xs font-medium cursor-pointer transition-colors ${
              activeCategory === tab.key
                ? 'bg-neutral-950 text-white dark:bg-white dark:text-neutral-950'
                : 'bg-neutral-100 dark:bg-neutral-900 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-800'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Catalog Selector */}
        <aside className="lg:col-span-4 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-3 space-y-1.5 max-h-[700px] overflow-y-auto">
          <div className="px-2 py-1 text-[11px] font-semibold text-neutral-500 uppercase tracking-wider flex items-center justify-between">
            <span>Select Report</span>
            <span>Bundle PDF</span>
          </div>
          {categoryItems.map((item) => {
            const active = item.reportKey === selectedKey;
            const bundled = bundleKeys.includes(item.reportKey);
            return (
              <div
                key={item.reportKey}
                className={`flex items-start justify-between gap-2 p-2.5 rounded-md border text-xs transition-colors ${
                  active
                    ? 'border-neutral-950 bg-neutral-950 text-white dark:bg-white dark:text-neutral-950 dark:border-white'
                    : 'border-transparent hover:bg-neutral-50 dark:hover:bg-neutral-800/70'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setSelectedKey(item.reportKey)}
                  className="text-left flex-1 cursor-pointer min-w-0"
                >
                  <div className="font-semibold truncate">{item.title}</div>
                  <div className={`text-[11px] truncate ${active ? 'text-neutral-300 dark:text-neutral-600' : 'text-neutral-500'}`}>
                    {item.titleBn}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => toggleBundleReport(item.reportKey)}
                  title="Include in Combined Multi-Report PDF"
                  className="p-1 rounded cursor-pointer shrink-0"
                >
                  {bundled ? (
                    <CheckSquare className="h-4 w-4 text-blue-500" />
                  ) : (
                    <Square className="h-4 w-4 opacity-50" />
                  )}
                </button>
              </div>
            );
          })}
          {categoryItems.length === 0 && (
            <div className="p-4 text-xs text-neutral-500">
              No active reports available in this category for your current role/modules.
            </div>
          )}
        </aside>

        {/* Right Report Viewer */}
        <section className="lg:col-span-8 space-y-4">
          {/* Filter Bar */}
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-4 space-y-3 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                aria-label="From Date"
                className="h-8 px-2 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
              />
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                aria-label="To Date"
                className="h-8 px-2 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
              />
              <select
                value={financialYear}
                onChange={(e) => setFinancialYear(e.target.value)}
                className="h-8 px-2 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
              >
                <option value="ALL">All FYs</option>
                <option value="2026-27">FY 2026-27</option>
                <option value="2025-26">FY 2025-26</option>
              </select>
              <input
                type="text"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                placeholder="Status filter..."
                className="h-8 px-2 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
              />
              <input
                type="text"
                value={locationFilter}
                onChange={(e) => setLocationFilter(e.target.value)}
                placeholder="Village / PIN..."
                className="h-8 px-2 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
              />
              <div className="relative">
                <Search className="h-3.5 w-3.5 text-neutral-400 absolute left-2 top-2.5" />
                <input
                  type="text"
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  placeholder="Keyword search..."
                  className="w-full h-8 pl-7 pr-2 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-neutral-100 dark:border-neutral-800">
              <div className="flex items-center gap-2">
                <Button variant="primary" size="sm" loading={loading} onClick={() => runSelectedReport()} icon={<RefreshCw className="h-3.5 w-3.5" />}>
                  Run Report
                </Button>
                <select
                  value={exportLang}
                  onChange={(e) => setExportLang(e.target.value as 'en' | 'bn')}
                  className="h-8 px-2 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
                >
                  <option value="en">Export Lang: English</option>
                  <option value="bn">Export Lang: Bengali + EN</option>
                </select>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!dataset || !canExportPdf}
                  loading={exporting}
                  onClick={() => handleExport('PDF')}
                  icon={<FileDown className="h-3.5 w-3.5" />}
                >
                  PDF
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!dataset || !canExportExcel}
                  loading={exporting}
                  onClick={() => handleExport('XLSX')}
                  icon={<FileSpreadsheet className="h-3.5 w-3.5" />}
                >
                  Excel (.xlsx)
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!dataset || !canExportExcel}
                  loading={exporting}
                  onClick={() => handleExport('CSV')}
                >
                  CSV
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!dataset || !canPrint}
                  onClick={() => setPrintOpen(true)}
                  icon={<Printer className="h-3.5 w-3.5" />}
                >
                  Print Studio
                </Button>
              </div>
            </div>
          </div>

          {/* Dataset Render */}
          {dataset && (
            <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden">
              <div className="p-4 border-b border-neutral-200 dark:border-neutral-800">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h2 className="text-base font-bold text-neutral-950 dark:text-white">{dataset.title}</h2>
                    <p className="text-xs text-neutral-500">{dataset.subtitle} · {dataset.dateRangeLabel}</p>
                  </div>
                  <div className="text-[11px] font-mono text-neutral-500">
                    FY {dataset.financialYear} · {dataset.rows.length} row(s)
                    {selectedRowKeys.length > 0 ? ` · ${selectedRowKeys.length} selected` : ''}
                  </div>
                </div>

                {dataset.summaryCards && dataset.summaryCards.length > 0 && (
                  <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {dataset.summaryCards.map((sc) => (
                      <div key={sc.label} className="p-2.5 rounded border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950/60">
                        <div className="text-[11px] text-neutral-500">{sc.label}</div>
                        <div className="text-sm font-bold text-neutral-950 dark:text-white tabular-nums mt-0.5">{sc.value}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="overflow-x-auto max-h-[480px]">
                <table className="w-full border-collapse text-left text-xs">
                  <thead className="bg-neutral-50 dark:bg-neutral-950 sticky top-0 z-10 border-b border-neutral-200 dark:border-neutral-800">
                    <tr>
                      <th className="px-3 py-2.5 w-8">
                        <span className="sr-only">Select</span>
                      </th>
                      {dataset.columns.map((c) => (
                        <th
                          key={c.key}
                          onClick={() => {
                            if (sortCol === c.key) {
                              setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
                            } else {
                              setSortCol(c.key);
                              setSortDir('asc');
                            }
                          }}
                          title="Click to sort"
                          className={`px-3 py-2.5 font-semibold text-neutral-700 dark:text-neutral-300 whitespace-nowrap cursor-pointer select-none hover:underline ${
                            c.align === 'right' ? 'text-right' : 'text-left'
                          }`}
                        >
                          {exportLang === 'bn' && c.labelBn ? c.labelBn : c.label}
                          {sortCol === c.key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                    {paginatedDataset.items.map((row, idx) => {
                      const rowId = String(row[dataset.columns[0]?.key] ?? idx + 1);
                      const checked = selectedRowKeys.includes(rowId);
                      return (
                        <tr key={idx} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40">
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleRowSelect(rowId)}
                              className="h-3.5 w-3.5 cursor-pointer"
                            />
                          </td>
                          {dataset.columns.map((col) => (
                            <td
                              key={col.key}
                              className={`px-3 py-2 tabular-nums whitespace-nowrap ${
                                col.align === 'right' ? 'text-right font-mono' : ''
                              }`}
                            >
                              {formatCell(col, row[col.key])}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                    {dataset.rows.length === 0 && (
                      <tr>
                        <td colSpan={dataset.columns.length + 1} className="px-4 py-8 text-center text-neutral-500">
                          No records match the current filter criteria.
                        </td>
                      </tr>
                    )}
                  </tbody>
                  {Object.keys(dataset.totals).length > 0 && dataset.rows.length > 0 && (
                    <tfoot className="bg-neutral-100 dark:bg-neutral-950 border-t border-neutral-300 dark:border-neutral-700 font-bold">
                      <tr>
                        <td className="px-3 py-2" />
                        {dataset.columns.map((col, idx) => (
                          <td
                            key={col.key}
                            className={`px-3 py-2 tabular-nums whitespace-nowrap ${
                              col.align === 'right' ? 'text-right font-mono' : ''
                            }`}
                          >
                            {idx === 0
                              ? `TOTAL (${dataset.rows.length})`
                              : dataset.totals[col.key] !== undefined
                                ? formatCell(col, dataset.totals[col.key])
                                : ''}
                          </td>
                        ))}
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>

              {dataset.rows.length > 0 && (
                <div className="px-4 py-2.5 border-t border-neutral-100 dark:border-neutral-800">
                  <Pagination
                    pagination={paginatedDataset.pagination}
                    onPageChange={setTablePage}
                  />
                </div>
              )}

              {dataset.notes && dataset.notes.length > 0 && (
                <div className="p-3 bg-neutral-50 dark:bg-neutral-950 border-t border-neutral-200 dark:border-neutral-800 text-[11px] text-neutral-600 dark:text-neutral-400 space-y-0.5">
                  {dataset.notes.map((n, i) => (
                    <div key={i}>• {n}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      <ReportPrintModal
        isOpen={printOpen}
        onClose={() => setPrintOpen(false)}
        dataset={dataset}
        companyProfile={companyProfile}
        selectedRowIds={selectedRowKeys}
        onShowToast={onShowToast}
      />
    </div>
  );
};
