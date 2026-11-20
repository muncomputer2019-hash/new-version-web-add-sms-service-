import React, { useMemo, useState } from 'react';
import { Printer, FileDown, Lock, X, Check } from 'lucide-react';
import { CompanyProfileSettings } from '../../modules/types';
import { formatINR } from '../../services/formatters';
import { ReportColumnDef, ReportDataset, reportApi } from '../../services/reportApi';
import { Button } from '../../components/Button';

interface ReportPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  dataset: ReportDataset | null;
  companyProfile?: CompanyProfileSettings | null;
  selectedRowIds?: string[];
  onShowToast: (type: 'success' | 'error' | 'info', title: string, description?: string) => void;
}

export const ReportPrintModal: React.FC<ReportPrintModalProps> = ({
  isOpen,
  onClose,
  dataset,
  companyProfile,
  selectedRowIds = [],
  onShowToast,
}) => {
  const [pageSize, setPageSize] = useState<'A4' | 'A5' | 'CUSTOM'>('A4');
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [customWidthMm, setCustomWidthMm] = useState(210);
  const [customHeightMm, setCustomHeightMm] = useState(297);
  const [marginMm, setMarginMm] = useState(12);
  const [copies, setCopies] = useState(1);
  const [scope, setScope] = useState<'ALL' | 'SELECTED'>(selectedRowIds.length > 0 ? 'SELECTED' : 'ALL');
  const [language, setLanguage] = useState<'en' | 'bn'>('en');
  const [includeHeaderFooter, setIncludeHeaderFooter] = useState(true);
  const [includeLogo, setIncludeLogo] = useState(true);
  const [includeSignature, setIncludeSignature] = useState(Boolean(companyProfile?.signatureUrl));
  const [includeStamp, setIncludeStamp] = useState(Boolean(companyProfile?.stampUrl));
  const [includeWatermark, setIncludeWatermark] = useState(false);
  const [watermarkText, setWatermarkText] = useState('MUN COMPUTER CONFIDENTIAL');
  const [pdfPassword, setPdfPassword] = useState('');
  const [hiddenCols, setHiddenCols] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);

  const visibleColumns = useMemo<ReportColumnDef[]>(() => {
    if (!dataset) return [];
    return dataset.columns.filter((c) => !hiddenCols[c.key]);
  }, [dataset, hiddenCols]);

  const activeRows = useMemo(() => {
    if (!dataset) return [];
    if (scope === 'SELECTED' && selectedRowIds.length > 0) {
      const set = new Set(selectedRowIds);
      const firstKey = dataset.columns[0]?.key;
      return dataset.rows.filter((r, idx) =>
        [
          firstKey ? String(r[firstKey] ?? '') : '',
          String(r.customerId ?? ''),
          String(r.applicationNo ?? ''),
          String(idx + 1),
        ].some((k) => k && set.has(k))
      );
    }
    return dataset.rows;
  }, [dataset, scope, selectedRowIds]);

  if (!isOpen || !dataset) return null;

  const formatCell = (col: ReportColumnDef, raw: unknown) => {
    if (raw === null || raw === undefined || raw === '') return '—';
    if (col.type === 'currency') {
      const num = Number(raw);
      return Number.isFinite(num) ? formatINR(num) : String(raw);
    }
    if (col.type === 'number') {
      const num = Number(raw);
      return Number.isFinite(num) ? new Intl.NumberFormat('en-IN').format(num) : String(raw);
    }
    return String(raw);
  };

  const handleBrowserPrint = async () => {
    setBusy(true);
    try {
      await reportApi.logPrint({
        reportKey: dataset.reportKey,
        reportName: dataset.title,
        reportCategory: dataset.category,
        pageSize,
        orientation,
        copies,
        scope: scope === 'SELECTED' ? 'SELECTED_RECORDS' : 'ALL_PERMITTED',
        dateRangeLabel: dataset.dateRangeLabel,
      });

      // Inject dynamic @page rule for exact page size & margins
      const styleId = 'mun-dynamic-print-page-rule';
      let styleEl = document.getElementById(styleId) as HTMLStyleElement | null;
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = styleId;
        document.head.appendChild(styleEl);
      }
      const sizeCss =
        pageSize === 'CUSTOM'
          ? `${customWidthMm}mm ${customHeightMm}mm`
          : `${pageSize} ${orientation}`;
      styleEl.innerHTML = `@media print { @page { size: ${sizeCss}; margin: ${marginMm}mm; } }`;

      window.print();
      onShowToast('success', 'Print Dispatched', `${copies} copy(ies) logged to Report Audit.`);
    } catch (err) {
      onShowToast('error', 'Print Authorization Failed', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const handleDownloadPdf = async () => {
    setBusy(true);
    try {
      const res = await reportApi.exportPdf({
        reportKey: dataset.reportKey,
        pageSize,
        orientation,
        customWidthMm,
        customHeightMm,
        includeWatermark,
        watermarkText,
        includeLogo,
        includeSignature,
        includeStamp,
        language,
        password: pdfPassword.trim() || undefined,
        selectedRowIds: scope === 'SELECTED' ? selectedRowIds : undefined,
        saveToArchive: true,
      });
      onShowToast(
        'success',
        'PDF Generated & Archived',
        res.archiveCode ? `Archive ID: ${res.archiveCode}` : res.filename
      );
    } catch (err) {
      onShowToast('error', 'PDF Export Failed', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const companyName = companyProfile?.companyName || 'MUN COMPUTER';
  const companyAddress = [
    companyProfile?.addressLine || 'Village Mamudpur',
    companyProfile?.postOffice ? `P.O: ${companyProfile.postOffice}` : '',
    companyProfile?.policeStation ? `P.S: ${companyProfile.policeStation}` : '',
    companyProfile?.district || 'Murshidabad',
    companyProfile?.stateName || 'West Bengal',
    companyProfile?.pinCode || '742406',
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <div className="fixed inset-0 z-50 bg-neutral-950/60 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Top Bar (no-print) */}
        <div className="no-print px-5 py-3.5 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between gap-4 shrink-0">
          <div>
            <h3 className="text-sm font-bold text-neutral-950 dark:text-white">
              Enterprise Print &amp; PDF Studio — {dataset.title}
            </h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Configure paper dimensions, columns, language, watermark, and security before printing or PDF export.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Print Studio"
            className="p-1.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
          {/* Controls Column (no-print) */}
          <aside className="no-print lg:col-span-4 border-r border-neutral-200 dark:border-neutral-800 p-4 overflow-y-auto space-y-4 bg-neutral-50/70 dark:bg-neutral-950/40 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-medium text-neutral-700 dark:text-neutral-300 mb-1">Paper Size</label>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(e.target.value as 'A4' | 'A5' | 'CUSTOM')}
                  className="w-full h-8 px-2 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded"
                >
                  <option value="A4">A4 (210 × 297 mm)</option>
                  <option value="A5">A5 (148 × 210 mm)</option>
                  <option value="CUSTOM">Custom Size (mm)</option>
                </select>
              </div>
              <div>
                <label className="block font-medium text-neutral-700 dark:text-neutral-300 mb-1">Orientation</label>
                <select
                  value={orientation}
                  onChange={(e) => setOrientation(e.target.value as 'portrait' | 'landscape')}
                  className="w-full h-8 px-2 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded"
                >
                  <option value="portrait">Portrait</option>
                  <option value="landscape">Landscape</option>
                </select>
              </div>
            </div>

            {pageSize === 'CUSTOM' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium mb-1">Width (mm)</label>
                  <input
                    type="number"
                    min={100}
                    max={600}
                    value={customWidthMm}
                    onChange={(e) => setCustomWidthMm(Number(e.target.value))}
                    className="w-full h-8 px-2 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded"
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1">Height (mm)</label>
                  <input
                    type="number"
                    min={120}
                    max={800}
                    value={customHeightMm}
                    onChange={(e) => setCustomHeightMm(Number(e.target.value))}
                    className="w-full h-8 px-2 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded"
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block font-medium mb-1">Margin (mm)</label>
                <input
                  type="number"
                  min={5}
                  max={35}
                  value={marginMm}
                  onChange={(e) => setMarginMm(Number(e.target.value))}
                  className="w-full h-8 px-2 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">Copies</label>
                <input
                  type="number"
                  min={1}
                  max={25}
                  value={copies}
                  onChange={(e) => setCopies(Number(e.target.value))}
                  className="w-full h-8 px-2 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">Language</label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as 'en' | 'bn')}
                  className="w-full h-8 px-2 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded"
                >
                  <option value="en">English</option>
                  <option value="bn">Bengali + EN</option>
                </select>
              </div>
            </div>

            {selectedRowIds.length > 0 && (
              <div>
                <label className="block font-medium mb-1">Record Scope</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setScope('ALL')}
                    className={`h-8 px-2 rounded border cursor-pointer ${
                      scope === 'ALL'
                        ? 'bg-neutral-950 text-white border-neutral-950'
                        : 'bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-700'
                    }`}
                  >
                    All ({dataset.rows.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setScope('SELECTED')}
                    className={`h-8 px-2 rounded border cursor-pointer ${
                      scope === 'SELECTED'
                        ? 'bg-neutral-950 text-white border-neutral-950'
                        : 'bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-700'
                    }`}
                  >
                    Selected ({selectedRowIds.length})
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-1.5 border-t border-neutral-200 dark:border-neutral-800 pt-3">
              <div className="font-semibold text-neutral-900 dark:text-white">Branding &amp; Security</div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={includeHeaderFooter} onChange={(e) => setIncludeHeaderFooter(e.target.checked)} />
                <span>Include Header, Timestamp &amp; Page Footer</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={includeLogo} onChange={(e) => setIncludeLogo(e.target.checked)} />
                <span>Include Company Logo</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={includeSignature} onChange={(e) => setIncludeSignature(e.target.checked)} />
                <span>Include Authorised Signature ({companyProfile?.signatureUrl ? 'Configured' : 'Not Uploaded'})</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={includeStamp} onChange={(e) => setIncludeStamp(e.target.checked)} />
                <span>Include Company Stamp ({companyProfile?.stampUrl ? 'Configured' : 'Not Uploaded'})</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={includeWatermark} onChange={(e) => setIncludeWatermark(e.target.checked)} />
                <span>Overlay Confidentiality Watermark</span>
              </label>
              {includeWatermark && (
                <input
                  type="text"
                  value={watermarkText}
                  onChange={(e) => setWatermarkText(e.target.value)}
                  placeholder="Watermark text"
                  className="w-full h-8 px-2 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded"
                />
              )}
            </div>

            <div className="border-t border-neutral-200 dark:border-neutral-800 pt-3">
              <label className="flex items-center gap-1.5 font-medium mb-1">
                <Lock className="h-3.5 w-3.5" /> PDF Password Protection (Optional)
              </label>
              <input
                type="password"
                value={pdfPassword}
                onChange={(e) => setPdfPassword(e.target.value)}
                placeholder="Leave blank for unencrypted PDF"
                className="w-full h-8 px-2 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded"
              />
            </div>

            <div className="border-t border-neutral-200 dark:border-neutral-800 pt-3">
              <div className="font-semibold mb-1.5">Show / Hide Columns</div>
              <div className="max-h-36 overflow-y-auto space-y-1">
                {dataset.columns.map((col) => {
                  const visible = !hiddenCols[col.key];
                  return (
                    <button
                      key={col.key}
                      type="button"
                      onClick={() => setHiddenCols((prev) => ({ ...prev, [col.key]: visible }))}
                      className="w-full flex items-center justify-between px-2 py-1 rounded hover:bg-neutral-200/60 dark:hover:bg-neutral-800 text-left cursor-pointer"
                    >
                      <span className="truncate">{col.label}</span>
                      {visible && <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </aside>

          {/* Live Print Sheet Preview */}
          <div className="lg:col-span-8 bg-neutral-200/70 dark:bg-neutral-950 p-6 overflow-y-auto flex justify-center">
            <div
              className="bg-white text-neutral-950 shadow-sm border border-neutral-300 w-full relative"
              style={{
                maxWidth: orientation === 'landscape' ? '960px' : '740px',
                padding: `${Math.max(marginMm * 2, 20)}px`,
              }}
            >
              {includeWatermark && (
                <div className="pointer-events-none select-none absolute inset-0 flex items-center justify-center overflow-hidden">
                  <span className="text-4xl font-bold tracking-widest text-neutral-950/[0.06] -rotate-25">
                    {watermarkText}
                  </span>
                </div>
              )}

              {includeHeaderFooter && (
                <header className="border-b-2 border-neutral-950 pb-3 mb-4 flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    {includeLogo && (
                      <img
                        src={companyProfile?.logoUrl || '/assets/aistudio/MUN_Computer_Orbit_Logo_11zon_1fce5a24.jpg'}
                        alt={companyName}
                        className="h-12 w-12 object-contain border border-neutral-200 rounded"
                      />
                    )}
                    <div>
                      <h2 className="text-base font-bold tracking-tight">{companyName}</h2>
                      <p className="text-[11px] text-neutral-600">{companyAddress}</p>
                      <p className="text-[11px] text-neutral-600">
                        Mob: {companyProfile?.mobile || '+91 8101352105'} · Email: {companyProfile?.email || 'MUNCOMPUTER2019@GMAIL.COM'}
                        {companyProfile?.gstNumber ? ` · GSTIN: ${companyProfile.gstNumber}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="text-right text-[11px] text-neutral-600 shrink-0 tabular-nums">
                    <div className="font-bold text-neutral-950">FY {dataset.financialYear}</div>
                    <div>{dataset.generatedAt}</div>
                    <div>By: {dataset.generatedBy}</div>
                  </div>
                </header>
              )}

              <div className="mb-3">
                <h1 className="text-sm font-bold text-neutral-950">
                  {language === 'bn' && dataset.titleBn ? `${dataset.titleBn} (${dataset.title})` : dataset.title}
                </h1>
                <p className="text-[11px] text-neutral-600">
                  {dataset.subtitle} · Period: {dataset.dateRangeLabel} · Scope: {activeRows.length} row(s)
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-[11px]">
                  <thead>
                    <tr className="bg-neutral-950 text-white">
                      {visibleColumns.map((c) => (
                        <th
                          key={c.key}
                          className={`px-2 py-1.5 font-semibold border border-neutral-800 ${
                            c.align === 'right' ? 'text-right' : 'text-left'
                          }`}
                        >
                          {language === 'bn' && c.labelBn ? c.labelBn : c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {activeRows.map((row, idx) => (
                      <tr key={idx} className={idx % 2 === 1 ? 'bg-neutral-50' : 'bg-white'}>
                        {visibleColumns.map((col) => (
                          <td
                            key={col.key}
                            className={`px-2 py-1 border border-neutral-200 tabular-nums ${
                              col.align === 'right' ? 'text-right' : 'text-left'
                            }`}
                          >
                            {formatCell(col, row[col.key])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-neutral-100 font-bold">
                      {visibleColumns.map((col, idx) => (
                        <td
                          key={col.key}
                          className={`px-2 py-1.5 border border-neutral-300 tabular-nums ${
                            col.align === 'right' ? 'text-right' : 'text-left'
                          }`}
                        >
                          {idx === 0
                            ? `Total (${activeRows.length})`
                            : dataset.totals[col.key] !== undefined
                              ? formatCell(col, dataset.totals[col.key])
                              : ''}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                </table>
              </div>

              {includeHeaderFooter && (
                <footer className="mt-6 pt-3 border-t border-neutral-300 flex items-end justify-between text-[10px] text-neutral-600">
                  <div>
                    <div>Copies requested: {copies} · Format: {pageSize} {orientation}</div>
                    <div>Generated by MUN COMPUTER BUSINESS MANAGER</div>
                  </div>
                  {(includeSignature || includeStamp) && (
                    <div className="flex items-end gap-4">
                      {includeStamp && companyProfile?.stampUrl && (
                        <img src={companyProfile.stampUrl} alt="Company Stamp" className="h-10 object-contain" />
                      )}
                      <div className="text-center">
                        {includeSignature && companyProfile?.signatureUrl && (
                          <img src={companyProfile.signatureUrl} alt="Authorised Signature" className="h-8 mx-auto object-contain" />
                        )}
                        <div className="border-t border-neutral-500 pt-0.5 font-semibold text-neutral-900">
                          Authorised Signatory
                        </div>
                      </div>
                    </div>
                  )}
                </footer>
              )}
            </div>
          </div>
        </div>

        {/* Footer Actions (no-print) */}
        <div className="no-print px-5 py-3 border-t border-neutral-200 dark:border-neutral-800 flex flex-wrap items-center justify-between gap-3 shrink-0 bg-white dark:bg-neutral-900">
          <div className="text-xs text-neutral-500 dark:text-neutral-400">
            Showing {visibleColumns.length} of {dataset.columns.length} columns · {activeRows.length} record(s)
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Close
            </Button>
            <Button
              variant="outline"
              size="sm"
              loading={busy}
              onClick={handleDownloadPdf}
              icon={<FileDown className="h-3.5 w-3.5" />}
            >
              Download PDF {pdfPassword.trim() ? '(Encrypted)' : ''}
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={busy}
              onClick={handleBrowserPrint}
              icon={<Printer className="h-3.5 w-3.5" />}
            >
              Print Now ({copies} {copies === 1 ? 'Copy' : 'Copies'})
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
