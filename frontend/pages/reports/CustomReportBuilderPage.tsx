import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Play,
  Save,
  Plus,
  Trash2,
  Copy,
  FileDown,
  FileSpreadsheet,
  Printer,
} from 'lucide-react';
import { CompanyProfileSettings } from '../../modules/types';
import { formatINR } from '../../services/formatters';
import {
  BuilderDataSourceKey,
  BuilderDataSourceSchema,
  CalculatedColumnRule,
  CustomFilterRule,
  CustomReportTemplate,
  ReportDataset,
  reportApi,
} from '../../services/reportApi';
import { Button } from '../../components/Button';
import { ReportPrintModal } from './ReportPrintModal';

interface CustomReportBuilderPageProps {
  companyProfile?: CompanyProfileSettings | null;
  onShowToast: (type: 'success' | 'error' | 'info', title: string, description?: string) => void;
}

export const CustomReportBuilderPage: React.FC<CustomReportBuilderPageProps> = ({
  companyProfile,
  onShowToast,
}) => {
  const [schemas, setSchemas] = useState<BuilderDataSourceSchema[]>([]);
  const [templates, setTemplates] = useState<CustomReportTemplate[]>([]);
  const [activeTemplateCode, setActiveTemplateCode] = useState<string | null>(null);

  const [reportTitle, setReportTitle] = useState('Custom Operational Report');
  const [dataSource, setDataSource] = useState<BuilderDataSourceKey>('APPLICATIONS');
  const [selectedFields, setSelectedFields] = useState<string[]>([
    'applicationNo',
    'customerName',
    'serviceName',
    'status',
    'serviceCharge',
    'balanceDue',
  ]);
  const [filterLogic, setFilterLogic] = useState<'AND' | 'OR'>('AND');
  const [filters, setFilters] = useState<CustomFilterRule[]>([]);
  const [groupByField, setGroupByField] = useState('');
  const [sortByField, setSortByField] = useState('');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [search, setSearch] = useState('');
  const [calculatedColumns, setCalculatedColumns] = useState<CalculatedColumnRule[]>([]);
  const [includeSubtotals, setIncludeSubtotals] = useState(true);
  const [includeGrandTotal, setIncludeGrandTotal] = useState(true);

  const [preview, setPreview] = useState<ReportDataset | null>(null);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);

  const loadInitial = useCallback(async () => {
    try {
      const [sRes, tRes] = await Promise.all([
        reportApi.getBuilderSchemas(),
        reportApi.listTemplates(),
      ]);
      setSchemas(sRes.data);
      setTemplates(tRes.data);
    } catch (err) {
      onShowToast('error', 'Failed to load builder schemas', err instanceof Error ? err.message : undefined);
    }
  }, [onShowToast]);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  const activeSchema = useMemo(
    () => schemas.find((s) => s.key === dataSource),
    [schemas, dataSource]
  );

  const handleDataSourceChange = (nextDs: BuilderDataSourceKey) => {
    setDataSource(nextDs);
    const found = schemas.find((s) => s.key === nextDs);
    if (found) {
      setSelectedFields(found.fields.slice(0, 6).map((f) => f.key));
      setFilters([]);
      setGroupByField('');
      setSortByField('');
      setCalculatedColumns([]);
    }
  };

  const toggleField = (fieldKey: string) => {
    setSelectedFields((prev) =>
      prev.includes(fieldKey)
        ? prev.length > 1
          ? prev.filter((k) => k !== fieldKey)
          : prev
        : [...prev, fieldKey]
    );
  };

  const buildRequestPayload = () => ({
    dataSource,
    selectedFields,
    filters: filters.filter((f) => f.field && f.value !== ''),
    filterLogic,
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
    groupByField: groupByField || undefined,
    sortByField: sortByField || undefined,
    sortDirection,
    search: search || undefined,
    calculatedColumns: calculatedColumns.filter((c) => c.key && c.label && c.expression),
    includeSubtotals,
    includeGrandTotal,
    title: reportTitle,
  });

  const handleRunPreview = async () => {
    setRunning(true);
    try {
      const res = await reportApi.executeCustomReport(buildRequestPayload());
      setPreview(res.data);
      onShowToast('success', 'Preview Generated', `${res.data.rows.length} row(s) returned.`);
    } catch (err) {
      onShowToast('error', 'Custom Query Error', err instanceof Error ? err.message : undefined);
    } finally {
      setRunning(false);
    }
  };

  const handleSaveTemplate = async () => {
    setSaving(true);
    try {
      if (activeTemplateCode) {
        const res = await reportApi.updateTemplate(activeTemplateCode, {
          name: reportTitle,
          dataSource,
          selectedFields,
          filters,
          filterLogic,
          groupByField,
          sortByField,
          sortDirection,
          calculatedColumns,
          includeSubtotals,
          includeGrandTotal,
        });
        onShowToast('success', 'Template Updated', `${res.data.templateCode} v${res.data.versionNo}`);
      } else {
        const res = await reportApi.createTemplate({
          name: reportTitle,
          dataSource,
          selectedFields,
          filters,
          filterLogic,
          groupByField,
          sortByField,
          sortDirection,
          calculatedColumns,
          includeSubtotals,
          includeGrandTotal,
        });
        setActiveTemplateCode(res.data.templateCode);
        onShowToast('success', 'Template Saved', `${res.data.templateCode}`);
      }
      loadInitial();
    } catch (err) {
      onShowToast('error', 'Unable to Save Template', err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  const handleLoadTemplate = (tpl: CustomReportTemplate) => {
    setActiveTemplateCode(tpl.templateCode);
    setReportTitle(tpl.name);
    setDataSource(tpl.dataSource);
    setSelectedFields(tpl.selectedFields);
    setFilters(tpl.filters);
    setFilterLogic(tpl.filterLogic);
    setGroupByField(tpl.groupByField);
    setSortByField(tpl.sortByField);
    setSortDirection(tpl.sortDirection);
    setCalculatedColumns(tpl.calculatedColumns);
    setIncludeSubtotals(tpl.includeSubtotals);
    setIncludeGrandTotal(tpl.includeGrandTotal);
  };

  const handleDuplicateTemplate = async (code: string) => {
    try {
      await reportApi.duplicateTemplate(code);
      onShowToast('success', 'Template Duplicated');
      loadInitial();
    } catch (err) {
      onShowToast('error', 'Duplicate Failed', err instanceof Error ? err.message : undefined);
    }
  };

  const handleDeleteTemplate = async (code: string) => {
    try {
      await reportApi.deleteTemplate(code);
      if (activeTemplateCode === code) setActiveTemplateCode(null);
      onShowToast('success', 'Template Deleted');
      loadInitial();
    } catch (err) {
      onShowToast('error', 'Delete Failed', err instanceof Error ? err.message : undefined);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-neutral-950 dark:text-white tracking-tight">
            Custom Report Builder &amp; Saved Templates
          </h1>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
            Combine allowlisted fields, AND/OR conditions, safe calculated formula columns (e.g. <code className="font-mono">[serviceCharge] - [serviceCost]</code>), grouping &amp; totals.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" loading={saving} onClick={handleSaveTemplate} icon={<Save className="h-3.5 w-3.5" />}>
            {activeTemplateCode ? `Update ${activeTemplateCode}` : 'Save New Template'}
          </Button>
          <Button variant="primary" size="sm" loading={running} onClick={handleRunPreview} icon={<Play className="h-3.5 w-3.5" />}>
            Run Preview
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Saved Templates */}
        <aside className="lg:col-span-3 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-3.5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-200">Saved Templates</span>
            <button
              type="button"
              onClick={() => {
                setActiveTemplateCode(null);
                setReportTitle('New Custom Report');
              }}
              className="text-[11px] text-blue-700 dark:text-blue-400 hover:underline cursor-pointer"
            >
              + Blank
            </button>
          </div>
          <div className="space-y-2 max-h-[540px] overflow-y-auto">
            {templates.map((tpl) => (
              <div
                key={tpl.templateCode}
                className={`p-2.5 rounded border text-xs ${
                  activeTemplateCode === tpl.templateCode
                    ? 'border-neutral-950 bg-neutral-50 dark:bg-neutral-800 dark:border-white'
                    : 'border-neutral-200 dark:border-neutral-800'
                }`}
              >
                <button
                  type="button"
                  onClick={() => handleLoadTemplate(tpl)}
                  className="text-left w-full cursor-pointer"
                >
                  <div className="font-semibold text-neutral-950 dark:text-white truncate">{tpl.name}</div>
                  <div className="text-[11px] font-mono text-neutral-500 mt-0.5">
                    {tpl.templateCode} · v{tpl.versionNo} · {tpl.dataSource}
                  </div>
                </button>
                <div className="mt-2 flex items-center gap-2 border-t border-neutral-100 dark:border-neutral-800 pt-1.5">
                  <button
                    type="button"
                    onClick={() => handleDuplicateTemplate(tpl.templateCode)}
                    className="inline-flex items-center gap-1 text-[11px] text-neutral-600 hover:text-neutral-950 dark:text-neutral-400 cursor-pointer"
                  >
                    <Copy className="h-3 w-3" /> Duplicate
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteTemplate(tpl.templateCode)}
                    className="inline-flex items-center gap-1 text-[11px] text-red-600 hover:text-red-800 cursor-pointer ml-auto"
                  >
                    <Trash2 className="h-3 w-3" /> Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </aside>

        {/* Builder Studio */}
        <section className="lg:col-span-9 space-y-4">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-4 space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div className="sm:col-span-2">
                <label className="block font-medium mb-1">Report Title</label>
                <input
                  type="text"
                  value={reportTitle}
                  onChange={(e) => setReportTitle(e.target.value)}
                  className="w-full h-9 px-2.5 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">Data Source</label>
                <select
                  value={dataSource}
                  onChange={(e) => handleDataSourceChange(e.target.value as BuilderDataSourceKey)}
                  className="w-full h-9 px-2.5 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
                >
                  {schemas.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-medium mb-1">Keyword Search</label>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Optional text search..."
                  className="w-full h-9 px-2.5 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
                />
              </div>
            </div>

            {/* Field Selector */}
            {activeSchema && (
              <div>
                <div className="font-medium mb-1.5">Select Columns ({selectedFields.length} active)</div>
                <div className="flex flex-wrap gap-2">
                  {activeSchema.fields.map((f) => {
                    const selected = selectedFields.includes(f.key);
                    return (
                      <button
                        key={f.key}
                        type="button"
                        onClick={() => toggleField(f.key)}
                        className={`px-2.5 py-1 rounded border text-[11px] cursor-pointer ${
                          selected
                            ? 'bg-neutral-950 text-white border-neutral-950 dark:bg-white dark:text-neutral-950'
                            : 'bg-neutral-50 dark:bg-neutral-950 border-neutral-200 dark:border-neutral-700'
                        }`}
                      >
                        {f.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Date Range, Group By & Sorting */}
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-2.5 border-t border-neutral-100 dark:border-neutral-800 pt-3">
              <div>
                <label className="block font-medium mb-1">From Date</label>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="w-full h-8 px-2 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">To Date</label>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="w-full h-8 px-2 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">Group By (Subtotals)</label>
                <select
                  value={groupByField}
                  onChange={(e) => setGroupByField(e.target.value)}
                  className="w-full h-8 px-2 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
                >
                  <option value="">No Grouping</option>
                  {(activeSchema?.fields ?? []).map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-medium mb-1">Sort By</label>
                <select
                  value={sortByField}
                  onChange={(e) => setSortByField(e.target.value)}
                  className="w-full h-8 px-2 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
                >
                  <option value="">Default Order</option>
                  {(activeSchema?.fields ?? []).map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-medium mb-1">Direction</label>
                <select
                  value={sortDirection}
                  onChange={(e) => setSortDirection(e.target.value as 'asc' | 'desc')}
                  className="w-full h-8 px-2 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
                >
                  <option value="desc">Descending</option>
                  <option value="asc">Ascending</option>
                </select>
              </div>
            </div>

            {/* Filter Rules */}
            <div className="border-t border-neutral-100 dark:border-neutral-800 pt-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">Filter Rules</span>
                  <select
                    value={filterLogic}
                    onChange={(e) => setFilterLogic(e.target.value as 'AND' | 'OR')}
                    className="h-7 px-2 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded font-mono"
                  >
                    <option value="AND">Match ALL (AND)</option>
                    <option value="OR">Match ANY (OR)</option>
                  </select>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setFilters((prev) => [
                      ...prev,
                      { field: activeSchema?.fields[0]?.key || 'status', operator: 'eq', value: '' },
                    ])
                  }
                  icon={<Plus className="h-3 w-3" />}
                >
                  Add Condition
                </Button>
              </div>

              {filters.map((rule, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                  <select
                    value={rule.field}
                    onChange={(e) =>
                      setFilters((prev) => prev.map((r, i) => (i === idx ? { ...r, field: e.target.value } : r)))
                    }
                    className="col-span-4 h-8 px-2 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
                  >
                    {(activeSchema?.fields ?? []).map((f) => (
                      <option key={f.key} value={f.key}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                  <select
                    value={rule.operator}
                    onChange={(e) =>
                      setFilters((prev) =>
                        prev.map((r, i) =>
                          i === idx ? { ...r, operator: e.target.value as CustomFilterRule['operator'] } : r
                        )
                      )
                    }
                    className="col-span-3 h-8 px-2 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
                  >
                    <option value="eq">Equals (=)</option>
                    <option value="neq">Not Equals (!=)</option>
                    <option value="contains">Contains</option>
                    <option value="gt">Greater (&gt;)</option>
                    <option value="gte">At Least (&gt;=)</option>
                    <option value="lt">Less (&lt;)</option>
                    <option value="lte">At Most (&lt;=)</option>
                  </select>
                  <input
                    type="text"
                    value={rule.value}
                    onChange={(e) =>
                      setFilters((prev) => prev.map((r, i) => (i === idx ? { ...r, value: e.target.value } : r)))
                    }
                    placeholder="Value..."
                    className="col-span-4 h-8 px-2 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
                  />
                  <button
                    type="button"
                    onClick={() => setFilters((prev) => prev.filter((_, i) => i !== idx))}
                    className="col-span-1 text-red-600 hover:text-red-800 flex justify-center cursor-pointer"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>

            {/* Safe Calculated Formula Columns */}
            <div className="border-t border-neutral-100 dark:border-neutral-800 pt-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold">Calculated Formula Columns (Safe Arithmetic Only)</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setCalculatedColumns((prev) => [
                      ...prev,
                      {
                        key: `calc_${prev.length + 1}`,
                        label: `Computed Col ${prev.length + 1}`,
                        expression: '',
                        format: 'currency',
                      },
                    ])
                  }
                  icon={<Plus className="h-3 w-3" />}
                >
                  Add Formula Column
                </Button>
              </div>
              {calculatedColumns.map((col, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                  <input
                    type="text"
                    value={col.label}
                    onChange={(e) =>
                      setCalculatedColumns((prev) =>
                        prev.map((c, i) => (i === idx ? { ...c, label: e.target.value } : c))
                      )
                    }
                    placeholder="Column Label"
                    className="col-span-3 h-8 px-2 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
                  />
                  <input
                    type="text"
                    value={col.expression}
                    onChange={(e) =>
                      setCalculatedColumns((prev) =>
                        prev.map((c, i) => (i === idx ? { ...c, expression: e.target.value } : c))
                      )
                    }
                    placeholder="e.g. [serviceCharge] - [serviceCost]"
                    className="col-span-6 h-8 px-2 font-mono bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
                  />
                  <select
                    value={col.format}
                    onChange={(e) =>
                      setCalculatedColumns((prev) =>
                        prev.map((c, i) =>
                          i === idx ? { ...c, format: e.target.value as CalculatedColumnRule['format'] } : c
                        )
                      )
                    }
                    className="col-span-2 h-8 px-2 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
                  >
                    <option value="currency">Currency (₹)</option>
                    <option value="number">Number</option>
                    <option value="percent">Percent</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => setCalculatedColumns((prev) => prev.filter((_, i) => i !== idx))}
                    className="col-span-1 text-red-600 flex justify-center cursor-pointer"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <div className="flex items-center gap-4 pt-1">
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={includeSubtotals} onChange={(e) => setIncludeSubtotals(e.target.checked)} />
                  <span>Include Group Subtotals</span>
                </label>
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={includeGrandTotal} onChange={(e) => setIncludeGrandTotal(e.target.checked)} />
                  <span>Include Grand Total Footer</span>
                </label>
              </div>
            </div>
          </div>

          {/* Live Execution Preview */}
          {preview && (
            <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-bold">{preview.title}</h2>
                  <p className="text-[11px] text-neutral-500">{preview.subtitle} · {preview.rows.length} rows</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      reportApi
                        .exportPdf({ customExecution: buildRequestPayload(), saveToArchive: true })
                        .then(() => onShowToast('success', 'Custom PDF Exported & Archived'))
                        .catch((e) => onShowToast('error', 'Export failed', e.message))
                    }
                    icon={<FileDown className="h-3.5 w-3.5" />}
                  >
                    PDF
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      reportApi
                        .exportExcel({ customExecution: buildRequestPayload(), format: 'xlsx', saveToArchive: true })
                        .then(() => onShowToast('success', 'Custom Excel Exported & Archived'))
                        .catch((e) => onShowToast('error', 'Export failed', e.message))
                    }
                    icon={<FileSpreadsheet className="h-3.5 w-3.5" />}
                  >
                    Excel
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setPrintOpen(true)} icon={<Printer className="h-3.5 w-3.5" />}>
                    Print
                  </Button>
                </div>
              </div>

              <div className="overflow-x-auto max-h-[400px]">
                <table className="w-full border-collapse text-left text-xs">
                  <thead className="bg-neutral-50 dark:bg-neutral-950 border-b border-neutral-200 dark:border-neutral-800">
                    <tr>
                      {preview.columns.map((c) => (
                        <th key={c.key} className={`px-3 py-2 font-semibold ${c.align === 'right' ? 'text-right' : 'text-left'}`}>
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                    {preview.rows.map((r, idx) => (
                      <tr key={idx}>
                        {preview.columns.map((c) => (
                          <td key={c.key} className={`px-3 py-2 tabular-nums ${c.align === 'right' ? 'text-right font-mono' : ''}`}>
                            {c.type === 'currency' && Number.isFinite(Number(r[c.key]))
                              ? formatINR(Number(r[c.key]))
                              : String(r[c.key] ?? '—')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </div>

      <ReportPrintModal
        isOpen={printOpen}
        onClose={() => setPrintOpen(false)}
        dataset={preview}
        companyProfile={companyProfile}
        onShowToast={onShowToast}
      />
    </div>
  );
};
