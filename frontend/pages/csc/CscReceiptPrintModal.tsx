import React from 'react';
import { Printer, X } from 'lucide-react';
import { Button } from '../../components/Button';
import { BRAND } from '../../assets/brand';
import { CscReceiptPayload } from '../../services/cscApi';
import { formatDateIST, formatINR } from '../../services/formatters';

interface CscReceiptPrintModalProps {
  isOpen: boolean;
  receiptPayload: CscReceiptPayload | null;
  onClose: () => void;
}

export const CscReceiptPrintModal: React.FC<CscReceiptPrintModalProps> = ({
  isOpen,
  receiptPayload,
  onClose,
}) => {
  if (!isOpen || !receiptPayload) return null;

  const { receipt, center, orderSummary } = receiptPayload;

  return (
    <div
      className="fixed inset-0 z-50 bg-neutral-950/60 flex items-center justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Printable A4 Payment Receipt"
    >
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg max-w-3xl w-full shadow-2xl overflow-hidden my-auto">
        <div className="no-print px-5 py-3.5 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between bg-neutral-50 dark:bg-neutral-950">
          <div>
            <h3 className="text-sm font-semibold text-neutral-950 dark:text-white">
              A4 Payment Receipt Preview
            </h3>
            <p className="text-xs text-neutral-500 font-mono">
              {receipt.receiptNumber} · Reprints: {receipt.reprintCount}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              size="sm"
              onClick={() => window.print()}
              icon={<Printer className="h-3.5 w-3.5" />}
            >
              Print A4 Receipt
            </Button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close receipt preview"
              className="p-1.5 rounded hover:bg-neutral-200 dark:hover:bg-neutral-800 text-neutral-500 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Printable A4 Sheet */}
        <div className="p-6 sm:p-8 bg-white text-neutral-950 print:p-0 text-xs">
          <div className="border border-neutral-300 rounded p-6 space-y-5">
            {/* Header with Logo */}
            <div className="flex items-start justify-between gap-4 border-b border-neutral-200 pb-4">
              <div className="flex items-center gap-3">
                <img
                  src={BRAND.logoPath}
                  alt={center.name}
                  className="h-14 w-14 object-contain rounded border border-neutral-200 bg-white p-1"
                />
                <div>
                  <div className="text-lg font-bold tracking-tight text-neutral-950">
                    {center.name}
                  </div>
                  <div className="text-[11px] text-neutral-600">{center.address}</div>
                  <div className="text-[11px] text-neutral-600 font-mono mt-0.5">
                    Tel: {center.mobile} · {center.email} · {center.website}
                  </div>
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
                  Official Payment Receipt
                </div>
                <div className="text-sm font-bold font-mono text-neutral-950 mt-0.5">
                  {receipt.receiptNumber}
                </div>
                {receipt.reprintCount > 1 && (
                  <div className="mt-1 inline-block px-2 py-0.5 border border-neutral-400 text-[10px] font-mono font-semibold text-neutral-700 rounded">
                    REPRINT #{receipt.reprintCount}
                  </div>
                )}
              </div>
            </div>

            {/* Order & Customer Metadata */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-neutral-50 border border-neutral-200 rounded p-3">
              <div>
                <div className="text-[10px] uppercase text-neutral-500">Order / Filing No</div>
                <div className="font-mono font-semibold text-neutral-950 mt-0.5">
                  {orderSummary.orderId}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-neutral-500">Customer Name</div>
                <div className="font-semibold text-neutral-950 mt-0.5">
                  {orderSummary.customerName}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-neutral-500">Mobile</div>
                <div className="font-mono text-neutral-900 mt-0.5">{orderSummary.mobile || '—'}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-neutral-500">Payment Date</div>
                <div className="font-mono text-neutral-900 mt-0.5">
                  {formatDateIST(receipt.paymentDate)}
                </div>
              </div>
            </div>

            {/* Line Items Table */}
            <table className="w-full border-collapse border border-neutral-200 text-left">
              <thead>
                <tr className="bg-neutral-100 border-b border-neutral-200 text-[11px] font-semibold text-neutral-700">
                  <th className="px-3 py-2">Service / Item</th>
                  <th className="px-3 py-2 text-right">Qty</th>
                  <th className="px-3 py-2 text-right">Service Charge</th>
                  <th className="px-3 py-2 text-right">Govt Fee</th>
                  <th className="px-3 py-2 text-right">Line Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {orderSummary.items.map((item, idx) => (
                  <tr key={idx}>
                    <td className="px-3 py-2 font-medium text-neutral-900">{item.name}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{item.qty}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      {formatINR(item.serviceCharge)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      {formatINR(item.govtFee)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-semibold tabular-nums">
                      {formatINR(item.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Payment Totals & Operator */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div className="space-y-1.5 text-[11px] text-neutral-700">
                <div>
                  <span className="font-semibold">Payment Type:</span> {receipt.paymentType}
                </div>
                <div>
                  <span className="font-semibold">Payment Method:</span> {receipt.paymentMethod}
                  {receipt.paymentReference ? ` (Ref: ${receipt.paymentReference})` : ''}
                </div>
                <div>
                  <span className="font-semibold">Operator:</span> {receipt.operatorName} (
                  <span className="font-mono">{receipt.operatorId}</span>)
                </div>
                <div>
                  <span className="font-semibold">Remarks:</span> {receipt.remarks || '—'}
                </div>
              </div>

              <div className="border border-neutral-200 rounded p-3 bg-neutral-50 space-y-1.5 font-mono tabular-nums">
                <div className="flex justify-between">
                  <span className="text-neutral-600">Order Total Amount</span>
                  <span className="font-semibold">{formatINR(orderSummary.totalAmount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-600">This Receipt Paid</span>
                  <span className="font-bold text-emerald-700">{formatINR(receipt.amount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-600">Cumulative Paid</span>
                  <span className="font-semibold">{formatINR(orderSummary.paidAmount)}</span>
                </div>
                <div className="flex justify-between border-t border-neutral-300 pt-1.5 text-sm">
                  <span className="font-semibold">Remaining Due</span>
                  <span
                    className={`font-bold ${
                      orderSummary.remainingDue > 0 ? 'text-amber-700' : 'text-emerald-700'
                    }`}
                  >
                    {formatINR(orderSummary.remainingDue)}
                  </span>
                </div>
              </div>
            </div>

            {/* Footer Compliance Notice */}
            <div className="border-t border-neutral-200 pt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[10px] text-neutral-500">
              <span>
                Note: Service center facilitates application drafting &amp; portal submission. Official
                approvals, refunds, or entitlements depend solely on the concerned authority.
              </span>
              <span className="font-mono shrink-0">Authorised Signatory · MUN COMPUTER</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
