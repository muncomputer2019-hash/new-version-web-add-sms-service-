import React from 'react';
import { Printer, X } from 'lucide-react';
import {
  CompanyProfileSettings,
  DocumentTemplateItem,
  PaymentQrSettings,
  PrintSettingsConfig,
} from '../../modules/types';
import { Button } from '../../components/Button';
import { formatINR, formatDateIST } from '../../services/formatters';

interface PrintPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  company: CompanyProfileSettings;
  template: DocumentTemplateItem;
  printSettings: PrintSettingsConfig;
  paymentQr: PaymentQrSettings;
  sampleNumber: string;
}

export const PrintPreviewModal: React.FC<PrintPreviewModalProps> = ({
  isOpen,
  onClose,
  company,
  template,
  printSettings,
  paymentQr,
  sampleNumber,
}) => {
  if (!isOpen) return null;

  const isDetailed = template.designVariant === 'Detailed Professional';

  return (
    <div
      className="fixed inset-0 z-50 bg-neutral-950/60 flex items-center justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="A4 Print Preview"
    >
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg max-w-4xl w-full shadow-2xl overflow-hidden">
        {/* Top Action Bar (hidden during print) */}
        <div className="no-print px-5 py-3.5 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between gap-3 bg-neutral-50 dark:bg-neutral-950">
          <div>
            <h3 className="text-sm font-semibold text-neutral-950 dark:text-white">
              A4 Print Preview — {template.docType} ({template.designVariant} · v{template.versionNo})
            </h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Paper: {printSettings.paperSize} · Mode: {printSettings.printMode} · Default Copies: {printSettings.defaultCopies}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              size="sm"
              onClick={() => window.print()}
              icon={<Printer className="h-3.5 w-3.5" />}
            >
              Print / Save as PDF
            </Button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close print preview"
              className="p-1.5 rounded-md text-neutral-500 hover:text-neutral-950 dark:hover:text-white cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Printable A4 Sheet (always crisp white/black paper contrast) */}
        <div className="p-6 sm:p-10 bg-white text-neutral-950">
          <div className="border border-neutral-300 p-6 sm:p-8 space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between gap-4 border-b border-neutral-300 pb-5">
              <div className="flex items-start gap-3">
                {printSettings.includeLogo && company.logoUrl && (
                  <img
                    src={company.logoUrl}
                    alt={company.companyName}
                    className="h-14 w-14 object-contain border border-neutral-200 p-0.5 rounded"
                  />
                )}
                <div>
                  <h1 className="text-xl font-bold tracking-tight text-neutral-950">
                    {company.companyName}
                  </h1>
                  <p className="text-xs text-neutral-700 mt-0.5">
                    {company.addressLine}, P.O. {company.postOffice}, P.S. {company.policeStation}
                  </p>
                  <p className="text-xs text-neutral-700">
                    District: {company.district}, {company.stateName}, {company.countryName} — PIN {company.pinCode}
                  </p>
                  <p className="text-xs font-mono text-neutral-700 mt-1">
                    Mob/WhatsApp: {company.mobile} · Email: {company.email}
                  </p>
                  {isDetailed && (company.gstNumber || company.panNumber) && (
                    <p className="text-[11px] font-mono text-neutral-600 mt-0.5">
                      {company.gstNumber ? `GSTIN: ${company.gstNumber}  ` : ''}
                      {company.panNumber ? `PAN: ${company.panNumber}` : ''}
                    </p>
                  )}
                </div>
              </div>

              <div className="text-right shrink-0">
                <div className="text-sm font-bold uppercase tracking-wider text-neutral-950">
                  {template.docType === 'RECEIPT' ? 'Payment Receipt' : 'Tax / Service Invoice'}
                </div>
                <div className="mt-1 font-mono text-xs font-semibold text-neutral-900">
                  {sampleNumber}
                </div>
                <div className="text-xs text-neutral-600 mt-0.5 tabular-nums">
                  Date: {formatDateIST('2026-11-16')}
                </div>
                <div className="text-[11px] text-neutral-500">FY 2026–27</div>
              </div>
            </div>

            {/* Customer & Counter Info */}
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <div className="text-neutral-500 font-medium">Billed To</div>
                <div className="font-semibold text-neutral-950 mt-0.5">Aarav Chowdhury</div>
                <div className="text-neutral-700">Murshidabad · Mobile: +91 98300-11223</div>
              </div>
              <div className="text-right">
                <div className="text-neutral-500 font-medium">Counter &amp; Mode</div>
                <div className="font-semibold text-neutral-950 mt-0.5">CTR-01 · Main Service Desk</div>
                <div className="text-neutral-700">
                  Payment: {paymentQr.upiEnabled ? 'UPI / Cash' : 'Cash'}
                </div>
              </div>
            </div>

            {/* Line Items Table */}
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-y border-neutral-300 bg-neutral-50">
                  <th className="py-2 px-3 text-left font-semibold">Service Description</th>
                  <th className="py-2 px-3 text-left font-semibold">Application Ref</th>
                  {isDetailed && <th className="py-2 px-3 text-left font-semibold">Qty</th>}
                  <th className="py-2 px-3 text-right font-semibold">Amount (INR)</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-neutral-200">
                  <td className="py-2.5 px-3 font-medium">PAN Card New Application &amp; Processing</td>
                  <td className="py-2.5 px-3 font-mono">MCA-2026-27-000014</td>
                  {isDetailed && <td className="py-2.5 px-3 font-mono">1</td>}
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums">{formatINR(250)}</td>
                </tr>
                {isDetailed && (
                  <tr className="border-b border-neutral-200">
                    <td className="py-2.5 px-3 font-medium">Document Scanning &amp; Verification</td>
                    <td className="py-2.5 px-3 font-mono">SVC-SCAN-01</td>
                    <td className="py-2.5 px-3 font-mono">1</td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums">{formatINR(50)}</td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={isDetailed ? 3 : 2} className="py-3 px-3 text-right font-bold">
                    Total Paid (INR)
                  </td>
                  <td className="py-3 px-3 text-right font-mono font-bold text-sm tabular-nums">
                    {formatINR(isDetailed ? 300 : 250)}
                  </td>
                </tr>
              </tfoot>
            </table>

            {/* Footer: QR, Terms, Signature & Stamp */}
            <div className="pt-4 border-t border-neutral-300 grid grid-cols-1 sm:grid-cols-12 gap-4 items-end text-xs">
              <div className="sm:col-span-6 space-y-2">
                {template.termsAndConditions && (
                  <div>
                    <div className="font-semibold text-neutral-900">Terms &amp; Conditions</div>
                    <p className="text-[11px] text-neutral-600">{template.termsAndConditions}</p>
                  </div>
                )}
                {template.disclaimer && (
                  <div>
                    <div className="font-semibold text-neutral-900">Disclaimer</div>
                    <p className="text-[11px] text-neutral-600">{template.disclaimer}</p>
                  </div>
                )}
              </div>

              <div className="sm:col-span-3 flex flex-col items-center">
                {template.showQr && paymentQr.upiEnabled && (
                  <div className="border border-neutral-300 p-2 rounded text-center">
                    {paymentQr.staticQrPreviewUrl ? (
                      <img
                        src={paymentQr.staticQrPreviewUrl}
                        alt="UPI QR"
                        className="h-16 w-16 object-contain mx-auto"
                      />
                    ) : (
                      <div className="h-16 w-16 bg-neutral-100 border border-dashed border-neutral-400 flex items-center justify-center text-[10px] font-mono text-neutral-600">
                        STATIC QR
                      </div>
                    )}
                    <div className="mt-1 text-[10px] font-mono text-neutral-700 truncate max-w-[110px]">
                      {paymentQr.upiId || company.upiId || 'UPI Configured'}
                    </div>
                  </div>
                )}
              </div>

              <div className="sm:col-span-3 text-right space-y-1">
                {printSettings.includeCompanyStamp && company.stampUrl && (
                  <img
                    src={company.stampUrl}
                    alt="Company Stamp"
                    className="h-12 ml-auto object-contain opacity-90"
                  />
                )}
                {printSettings.includeDigitalSignature && company.signatureUrl && (
                  <img
                    src={company.signatureUrl}
                    alt="Authorized Signature"
                    className="h-10 ml-auto object-contain"
                  />
                )}
                <div className="pt-2 border-t border-neutral-300 text-[11px] font-semibold">
                  Authorized Signatory
                </div>
                <div className="text-[10px] text-neutral-500">{company.companyName}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
