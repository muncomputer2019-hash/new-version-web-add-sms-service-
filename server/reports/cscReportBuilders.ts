import { CscStore } from '../cscStore';
import { round2 } from '../finance/accountingEngine';
import { SecurityStore } from '../securityStore';
import { ServerUser } from '../types';
import { ReportCatalogItem, ReportDataset, ReportFilterInput } from './reportTypes';

function inDateRangeCsc(dateStr: string | null | undefined, filters?: ReportFilterInput): boolean {
  if (!dateStr) return !filters?.fromDate && !filters?.toDate;
  const iso = dateStr.slice(0, 10);
  if (filters?.fromDate && iso < filters.fromDate) return false;
  if (filters?.toDate && iso > filters.toDate) return false;
  return true;
}

export const CSC_REPORT_CATALOG_ITEMS: Omit<ReportCatalogItem, 'enabled'>[] = [
  { reportKey: 'CSC_RPT_01', title: '1. Category-wise Service Report', titleBn: 'ক্যাটাগরি-ভিত্তিক পরিষেবা রিপোর্ট', category: 'CSC_OPERATIONS', description: 'Orders, quantities, service charges, govt fees, and revenue grouped by the 21 service categories.', financialRestricted: false },
  { reportKey: 'CSC_RPT_02', title: '2. Sub-service-wise Order Report', titleBn: 'সাব-সার্ভিস অর্ডার রিপোর্ট', category: 'CSC_OPERATIONS', description: 'Line-item breakdown of all 550+ sub-services ordered with unit snapshots.', financialRestricted: false },
  { reportKey: 'CSC_RPT_03', title: '3. Daily Sales Report', titleBn: 'দৈনিক বিক্রয় রিপোর্ট', category: 'CSC_OPERATIONS', description: 'Date-wise daily CSC orders, PVC orders, total billing, collection, and dues.', financialRestricted: false },
  { reportKey: 'CSC_RPT_04', title: '4. Monthly Sales Report', titleBn: 'মাসিক বিক্রয় রিপোর্ট', category: 'CSC_OPERATIONS', description: 'Month-by-month aggregated sales, collections, and pending dues.', financialRestricted: true },
  { reportKey: 'CSC_RPT_05', title: '5. Date-wise Revenue Report', titleBn: 'তারিখ-ভিত্তিক রাজস্ব রিপোর্ট', category: 'CSC_OPERATIONS', description: 'Chronological revenue breakdown combining Service Charge vs Govt Fee vs PVC sales.', financialRestricted: true },
  { reportKey: 'CSC_RPT_06', title: '6. Payment Collection Report', titleBn: 'পেমেন্ট আদায় রিপোর্ট', category: 'CSC_OPERATIONS', description: 'All collected receipts (Advance, Partial, Full, Due Collection) by payment method.', financialRestricted: false },
  { reportKey: 'CSC_RPT_07', title: '7. Due Payment Report', titleBn: 'বকেয়া পেমেন্ট রিপোর্ট', category: 'CSC_OPERATIONS', description: 'All CSC orders, PVC orders, and grievances with outstanding remaining due.', financialRestricted: false },
  { reportKey: 'CSC_RPT_08', title: '8. Refund / Cancellation Report', titleBn: 'রিফান্ড ও বাতিল রিপোর্ট', category: 'CSC_OPERATIONS', description: 'Cancelled orders and processed refunds with operator accountability.', financialRestricted: false },
  { reportKey: 'CSC_RPT_09', title: '9. Service Charge vs Govt Fee Report', titleBn: 'সার্ভিস চার্জ বনাম সরকারি ফি', category: 'CSC_OPERATIONS', description: 'Margin split comparing center Service Charge against official Government Fee.', financialRestricted: true },
  { reportKey: 'CSC_RPT_10', title: '10. Unit-wise Billing Report', titleBn: 'ইউনিট-ভিত্তিক বিলিং রিপোর্ট', category: 'CSC_OPERATIONS', description: 'Billing breakdown across the 8 UnitTypes (Per Application, Per Page, Per Card, etc.).', financialRestricted: false },
  { reportKey: 'CSC_RPT_11', title: '11. Customer-wise Service History Report', titleBn: 'গ্রাহক পরিষেবা ইতিহাস', category: 'CSC_OPERATIONS', description: 'Every CSC & PVC service availed per customer with payment and due status.', financialRestricted: false },
  { reportKey: 'CSC_RPT_12', title: '12. Operator-wise Performance Report', titleBn: 'অপারেটর কর্মক্ষমতা রিপোর্ট', category: 'CSC_OPERATIONS', description: 'Orders handled, completions, collections, and PVC cards entered per operator.', financialRestricted: false },
  { reportKey: 'CSC_RPT_13', title: '13. Application Status Breakdown (All 17 Statuses)', titleBn: 'আবেদন স্ট্যাটাস রিপোর্ট', category: 'CSC_OPERATIONS', description: 'Distribution and register across Pending, Processing, Completed, Rejected, and all 17 stages.', financialRestricted: false },
  { reportKey: 'CSC_RPT_14', title: '14. Document Verification Pending Report', titleBn: 'নথি যাচাই বকেয়া রিপোর্ট', category: 'CSC_OPERATIONS', description: 'Uploaded private documents awaiting verification or flagged for re-upload.', financialRestricted: false },
  { reportKey: 'CSC_RPT_15', title: '15. Rate History Audit Report', titleBn: 'রেট পরিবর্তন অডিট রিপোর্ট', category: 'CSC_OPERATIONS', description: 'Immutable audit trail of all Admin service rate, govt fee, and unit type changes.', financialRestricted: true },
  { reportKey: 'CSC_RPT_16', title: '16. Individual PVC Card Report', titleBn: 'ব্যক্তিগত পিভিসি কার্ড রিপোর্ট', category: 'CSC_OPERATIONS', description: 'Individual PVC card printing orders, slab rates applied, cards printed, and delivery.', financialRestricted: false },
  { reportKey: 'CSC_RPT_17', title: '17. Wholesale PVC Card Report', titleBn: 'পাইকারি পিভিসি কার্ড রিপোর্ট', category: 'CSC_OPERATIONS', description: 'Wholesale PVC bulk orders linked to shops and Admin-configured wholesale slabs.', financialRestricted: false },
  { reportKey: 'CSC_RPT_18', title: '18. Wholesale Shop-wise Report', titleBn: 'পাইকারি দোকান-ভিত্তিক রিপোর্ট', category: 'CSC_OPERATIONS', description: 'Aggregated order counts, total cards, billed, paid, and dues per Wholesale Shop.', financialRestricted: false },
  { reportKey: 'CSC_RPT_19', title: '19. Grievance & RTI Report', titleBn: 'অভিযোগ ও আরটিআই রিপোর্ট', category: 'CSC_OPERATIONS', description: 'All Public Grievance and RTI/Appeal filings across all 11 statuses and 6 service types.', financialRestricted: false },
  { reportKey: 'CSC_RPT_20', title: '20. Ayushman Bharat PM-JAY Service Report', titleBn: 'আয়ুষ্মান ভারত পিএম-জেএওয়াই রিপোর্ট', category: 'CSC_OPERATIONS', description: 'Dedicated PM-JAY service orders, e-KYC methods, and card delivery status.', financialRestricted: false },
  { reportKey: 'CSC_RPT_21', title: '21. e-KYC Status Report', titleBn: 'ই-কেওয়াইসি স্ট্যাটাস রিপোর্ট', category: 'CSC_OPERATIONS', description: 'Aadhaar e-KYC tracking across PM-JAY and MMSBY applications (Pending/Completed/Rejected).', financialRestricted: false },
  { reportKey: 'CSC_RPT_22', title: '22. MMSBY Scheme Service Report', titleBn: 'এমএমএসবিওয়াই প্রকল্প রিপোর্ট', category: 'CSC_OPERATIONS', description: 'Mukhyamantri Swasthya Bima Yojana (distinct from Swasthya Sathi) service register.', financialRestricted: false },
  { reportKey: 'CSC_RPT_23', title: '23. NPCI & Digital Payment Service Report', titleBn: 'এনপিসিআই ও ডিজিটাল পেমেন্ট রিপোর্ট', category: 'CSC_OPERATIONS', description: 'Aadhaar Seeding, UPI, BHIM/FASTag, NACH/DBT requests routed via Bank/PSP.', financialRestricted: false },
  { reportKey: 'CSC_RPT_24', title: '24. Cyber Crime Assistance Report', titleBn: 'সাইবার ক্রাইম সহায়তা রিপোর্ট', category: 'CSC_OPERATIONS', description: 'Cyber Crime Portal / 1930 helpline complaint drafting, fraud amounts, and ack tracking.', financialRestricted: false },
  { reportKey: 'CSC_RPT_25', title: '25. Customer-wise Grievance & Application Combined Report', titleBn: 'গ্রাহক অভিযোগ ও আবেদন সমন্বিত রিপোর্ট', category: 'CSC_OPERATIONS', description: 'Unified 360-degree view of service orders, PVC orders, and grievances per customer.', financialRestricted: false },
];

export function buildCscReportDataset(
  csc: CscStore,
  securityStore: SecurityStore,
  reportKey: string,
  _user: ServerUser,
  filters: ReportFilterInput,
  base: Omit<ReportDataset, 'columns' | 'rows' | 'totals' | 'totalRowsBeforeLimit'>
): Omit<ReportDataset, 'totalRowsBeforeLimit'> {
  const orders = csc.orders.filter((o) => inDateRangeCsc(o.orderDate, filters));
  const pvcOrders = csc.pvcOrders.filter((p) => inDateRangeCsc(p.orderDate, filters));
  const grievances = csc.grievances.filter((g) => inDateRangeCsc(g.submissionDate, filters));

  switch (reportKey) {
    case 'CSC_RPT_01': {
      const map = new Map<string, { categoryName: string; orders: number; qty: number; serviceCharge: number; govtFee: number; totalSales: number; collected: number }>();
      for (const o of orders) {
        const cur = map.get(o.selectedCategoryName) ?? {
          categoryName: o.selectedCategoryName,
          orders: 0,
          qty: 0,
          serviceCharge: 0,
          govtFee: 0,
          totalSales: 0,
          collected: 0,
        };
        cur.orders += 1;
        cur.qty += o.items.reduce((s, it) => s + it.quantity, 0);
        cur.serviceCharge = round2(cur.serviceCharge + o.serviceCharge);
        cur.govtFee = round2(cur.govtFee + o.govtFee);
        cur.totalSales = round2(cur.totalSales + o.totalAmount);
        cur.collected = round2(cur.collected + Math.max(0, o.totalPaid - o.refundedAmount));
        map.set(o.selectedCategoryName, cur);
      }
      const rows = Array.from(map.values()).sort((a, b) => b.totalSales - a.totalSales);
      return {
        ...base,
        columns: [
          { key: 'categoryName', label: 'Category', type: 'text' },
          { key: 'orders', label: 'Orders', type: 'number', align: 'right' },
          { key: 'qty', label: 'Total Qty', type: 'number', align: 'right' },
          { key: 'serviceCharge', label: 'Service Charge (₹)', type: 'currency', align: 'right' },
          { key: 'govtFee', label: 'Govt Fee (₹)', type: 'currency', align: 'right' },
          { key: 'totalSales', label: 'Total Sales (₹)', type: 'currency', align: 'right' },
          { key: 'collected', label: 'Collected (₹)', type: 'currency', align: 'right' },
        ],
        rows,
        totals: {
          categories: rows.length,
          totalSales: round2(rows.reduce((s, r) => s + r.totalSales, 0)),
          collected: round2(rows.reduce((s, r) => s + r.collected, 0)),
        },
      };
    }

    case 'CSC_RPT_02': {
      const rows = orders.flatMap((o) =>
        o.items.map((it) => ({
          orderId: o.orderId,
          orderDate: o.orderDate,
          categoryName: it.categoryName,
          serviceCode: it.serviceCode,
          serviceName: it.serviceName,
          unitType: it.unitType,
          quantity: it.quantity,
          serviceCharge: it.lineServiceCharge,
          govtFee: it.lineGovtFee,
          lineTotal: it.lineTotal,
          status: o.applicationStatus,
        }))
      );
      return {
        ...base,
        columns: [
          { key: 'orderId', label: 'Order ID', type: 'text' },
          { key: 'orderDate', label: 'Order Date', type: 'date' },
          { key: 'categoryName', label: 'Category', type: 'text' },
          { key: 'serviceCode', label: 'Code', type: 'text' },
          { key: 'serviceName', label: 'Sub-Service', type: 'text' },
          { key: 'unitType', label: 'Unit', type: 'text' },
          { key: 'quantity', label: 'Qty', type: 'number', align: 'right' },
          { key: 'serviceCharge', label: 'Service Charge (₹)', type: 'currency', align: 'right' },
          { key: 'govtFee', label: 'Govt Fee (₹)', type: 'currency', align: 'right' },
          { key: 'lineTotal', label: 'Total (₹)', type: 'currency', align: 'right' },
          { key: 'status', label: 'Status', type: 'status' },
        ],
        rows,
        totals: { lines: rows.length, total: round2(rows.reduce((s, r) => s + r.lineTotal, 0)) },
      };
    }

    case 'CSC_RPT_03':
    case 'CSC_RPT_04':
    case 'CSC_RPT_05': {
      const isMonthly = reportKey === 'CSC_RPT_04';
      const bucket = new Map<string, { period: string; cscOrders: number; pvcOrders: number; serviceCharge: number; govtFee: number; pvcSales: number; totalSales: number; collected: number; due: number }>();
      const touch = (key: string) => {
        const cur = bucket.get(key) ?? {
          period: key,
          cscOrders: 0,
          pvcOrders: 0,
          serviceCharge: 0,
          govtFee: 0,
          pvcSales: 0,
          totalSales: 0,
          collected: 0,
          due: 0,
        };
        bucket.set(key, cur);
        return cur;
      };
      for (const o of orders) {
        if (o.applicationStatus === 'Cancelled') continue;
        const k = isMonthly ? o.orderDate.slice(0, 7) : o.orderDate;
        const cur = touch(k);
        cur.cscOrders += 1;
        cur.serviceCharge = round2(cur.serviceCharge + o.serviceCharge);
        cur.govtFee = round2(cur.govtFee + o.govtFee);
        cur.totalSales = round2(cur.totalSales + o.totalAmount);
        cur.collected = round2(cur.collected + Math.max(0, o.totalPaid - o.refundedAmount));
        cur.due = round2(cur.due + o.remainingDue);
      }
      for (const p of pvcOrders) {
        if (p.deliveryStatus === 'Cancelled') continue;
        const k = isMonthly ? p.orderDate.slice(0, 7) : p.orderDate;
        const cur = touch(k);
        cur.pvcOrders += 1;
        cur.pvcSales = round2(cur.pvcSales + p.grandTotal);
        cur.totalSales = round2(cur.totalSales + p.grandTotal);
        cur.collected = round2(cur.collected + p.totalPaid);
        cur.due = round2(cur.due + p.remainingDue);
      }
      const rows = Array.from(bucket.values()).sort((a, b) => a.period.localeCompare(b.period));
      return {
        ...base,
        columns: [
          { key: 'period', label: isMonthly ? 'Month (YYYY-MM)' : 'Date', type: 'text' },
          { key: 'cscOrders', label: 'CSC Orders', type: 'number', align: 'right' },
          { key: 'pvcOrders', label: 'PVC Orders', type: 'number', align: 'right' },
          { key: 'serviceCharge', label: 'Service Charge (₹)', type: 'currency', align: 'right' },
          { key: 'govtFee', label: 'Govt Fee (₹)', type: 'currency', align: 'right' },
          { key: 'pvcSales', label: 'PVC Sales (₹)', type: 'currency', align: 'right' },
          { key: 'totalSales', label: 'Total Sales (₹)', type: 'currency', align: 'right' },
          { key: 'collected', label: 'Collected (₹)', type: 'currency', align: 'right' },
          { key: 'due', label: 'Due (₹)', type: 'currency', align: 'right' },
        ],
        rows,
        totals: {
          periods: rows.length,
          totalSales: round2(rows.reduce((s, r) => s + r.totalSales, 0)),
          collected: round2(rows.reduce((s, r) => s + r.collected, 0)),
          due: round2(rows.reduce((s, r) => s + r.due, 0)),
        },
      };
    }

    case 'CSC_RPT_06': {
      const receipts = csc
        .listAllReceipts()
        .filter((r) => inDateRangeCsc(r.paymentDate, filters) && r.paymentType !== 'Refund');
      const rows = receipts.map((r) => ({
        receiptNumber: r.receiptNumber,
        orderId: r.orderId,
        orderType: r.orderType,
        customerName: r.customerName,
        mobile: r.mobile,
        paymentType: r.paymentType,
        paymentMethod: r.paymentMethod,
        amount: r.amount,
        paymentDate: r.paymentDate,
        operatorName: r.operatorName,
      }));
      return {
        ...base,
        columns: [
          { key: 'receiptNumber', label: 'Receipt #', type: 'text' },
          { key: 'orderId', label: 'Order #', type: 'text' },
          { key: 'orderType', label: 'Type', type: 'text' },
          { key: 'customerName', label: 'Customer / Shop', type: 'text' },
          { key: 'mobile', label: 'Mobile', type: 'text' },
          { key: 'paymentType', label: 'Payment Type', type: 'status' },
          { key: 'paymentMethod', label: 'Method', type: 'text' },
          { key: 'amount', label: 'Amount (₹)', type: 'currency', align: 'right' },
          { key: 'paymentDate', label: 'Date', type: 'date' },
          { key: 'operatorName', label: 'Operator', type: 'text' },
        ],
        rows,
        totals: { receipts: rows.length, totalCollected: round2(rows.reduce((s, r) => s + r.amount, 0)) },
      };
    }

    case 'CSC_RPT_07': {
      const rows = [
        ...orders
          .filter((o) => o.remainingDue > 0 && o.applicationStatus !== 'Cancelled')
          .map((o) => ({
            orderId: o.orderId,
            category: o.selectedCategoryName,
            customerName: o.customerName,
            mobile: o.mobile,
            totalAmount: o.totalAmount,
            totalPaid: round2(o.totalPaid - o.refundedAmount),
            remainingDue: o.remainingDue,
            paymentStatus: o.paymentStatus,
            orderDate: o.orderDate,
          })),
        ...pvcOrders
          .filter((p) => p.remainingDue > 0 && p.deliveryStatus !== 'Cancelled')
          .map((p) => ({
            orderId: p.orderId,
            category: `PVC (${p.orderMode})`,
            customerName: p.shopName || p.customerName,
            mobile: p.mobile,
            totalAmount: p.grandTotal,
            totalPaid: p.totalPaid,
            remainingDue: p.remainingDue,
            paymentStatus: p.paymentStatus,
            orderDate: p.orderDate,
          })),
        ...grievances
          .filter((g) => g.remainingDue > 0)
          .map((g) => ({
            orderId: g.internalTrackingId,
            category: g.complaintCategory,
            customerName: g.customerName,
            mobile: g.mobile,
            totalAmount: g.totalAmount,
            totalPaid: g.paidAmount,
            remainingDue: g.remainingDue,
            paymentStatus: g.paymentStatus,
            orderDate: g.submissionDate,
          })),
      ];
      return {
        ...base,
        columns: [
          { key: 'orderId', label: 'Order / Tracking ID', type: 'text' },
          { key: 'category', label: 'Module / Category', type: 'text' },
          { key: 'customerName', label: 'Customer / Shop', type: 'text' },
          { key: 'mobile', label: 'Mobile', type: 'text' },
          { key: 'totalAmount', label: 'Total (₹)', type: 'currency', align: 'right' },
          { key: 'totalPaid', label: 'Paid (₹)', type: 'currency', align: 'right' },
          { key: 'remainingDue', label: 'Remaining Due (₹)', type: 'currency', align: 'right' },
          { key: 'paymentStatus', label: 'Pay Status', type: 'status' },
          { key: 'orderDate', label: 'Date', type: 'date' },
        ],
        rows,
        totals: { dueCount: rows.length, totalDue: round2(rows.reduce((s, r) => s + r.remainingDue, 0)) },
      };
    }

    case 'CSC_RPT_08': {
      const rows = orders
        .filter((o) => o.applicationStatus === 'Cancelled' || o.refundedAmount > 0 || o.paymentStatus === 'Refunded')
        .map((o) => ({
          orderId: o.orderId,
          customerName: o.customerName,
          serviceName: o.selectedServiceName,
          totalAmount: o.totalAmount,
          totalPaid: o.totalPaid,
          refundedAmount: o.refundedAmount,
          applicationStatus: o.applicationStatus,
          paymentStatus: o.paymentStatus,
          orderDate: o.orderDate,
          remarks: o.adminRemarks,
        }));
      return {
        ...base,
        columns: [
          { key: 'orderId', label: 'Order ID', type: 'text' },
          { key: 'customerName', label: 'Customer', type: 'text' },
          { key: 'serviceName', label: 'Service', type: 'text' },
          { key: 'totalAmount', label: 'Billed (₹)', type: 'currency', align: 'right' },
          { key: 'totalPaid', label: 'Paid (₹)', type: 'currency', align: 'right' },
          { key: 'refundedAmount', label: 'Refunded (₹)', type: 'currency', align: 'right' },
          { key: 'applicationStatus', label: 'App Status', type: 'status' },
          { key: 'paymentStatus', label: 'Pay Status', type: 'status' },
          { key: 'orderDate', label: 'Date', type: 'date' },
          { key: 'remarks', label: 'Remarks', type: 'text' },
        ],
        rows,
        totals: { cases: rows.length, totalRefunded: round2(rows.reduce((s, r) => s + r.refundedAmount, 0)) },
      };
    }

    case 'CSC_RPT_09': {
      const rows = orders.map((o) => ({
        orderId: o.orderId,
        orderDate: o.orderDate,
        customerName: o.customerName,
        categoryName: o.selectedCategoryName,
        serviceName: o.selectedServiceName,
        serviceCharge: o.serviceCharge,
        govtFee: o.govtFee,
        totalAmount: o.totalAmount,
        centerMarginPct: o.totalAmount > 0 ? round2((o.serviceCharge / o.totalAmount) * 100) : 0,
      }));
      return {
        ...base,
        columns: [
          { key: 'orderId', label: 'Order ID', type: 'text' },
          { key: 'orderDate', label: 'Date', type: 'date' },
          { key: 'customerName', label: 'Customer', type: 'text' },
          { key: 'categoryName', label: 'Category', type: 'text' },
          { key: 'serviceName', label: 'Primary Service', type: 'text' },
          { key: 'serviceCharge', label: 'Service Charge (₹)', type: 'currency', align: 'right' },
          { key: 'govtFee', label: 'Govt Fee (₹)', type: 'currency', align: 'right' },
          { key: 'totalAmount', label: 'Total (₹)', type: 'currency', align: 'right' },
          { key: 'centerMarginPct', label: 'SC Share %', type: 'number', align: 'right' },
        ],
        rows,
        totals: {
          serviceChargeTotal: round2(rows.reduce((s, r) => s + r.serviceCharge, 0)),
          govtFeeTotal: round2(rows.reduce((s, r) => s + r.govtFee, 0)),
          grandTotal: round2(rows.reduce((s, r) => s + r.totalAmount, 0)),
        },
      };
    }

    case 'CSC_RPT_10': {
      const uMap = new Map<string, { unitType: string; lineCount: number; totalQty: number; serviceCharge: number; govtFee: number; totalAmount: number }>();
      for (const o of orders) {
        for (const it of o.items) {
          const cur = uMap.get(it.unitType) ?? {
            unitType: it.unitType,
            lineCount: 0,
            totalQty: 0,
            serviceCharge: 0,
            govtFee: 0,
            totalAmount: 0,
          };
          cur.lineCount += 1;
          cur.totalQty += it.quantity;
          cur.serviceCharge = round2(cur.serviceCharge + it.lineServiceCharge);
          cur.govtFee = round2(cur.govtFee + it.lineGovtFee);
          cur.totalAmount = round2(cur.totalAmount + it.lineTotal);
          uMap.set(it.unitType, cur);
        }
      }
      const rows = Array.from(uMap.values());
      return {
        ...base,
        columns: [
          { key: 'unitType', label: 'Unit Type', type: 'text' },
          { key: 'lineCount', label: 'Order Lines', type: 'number', align: 'right' },
          { key: 'totalQty', label: 'Total Units', type: 'number', align: 'right' },
          { key: 'serviceCharge', label: 'Service Charge (₹)', type: 'currency', align: 'right' },
          { key: 'govtFee', label: 'Govt Fee (₹)', type: 'currency', align: 'right' },
          { key: 'totalAmount', label: 'Total Billed (₹)', type: 'currency', align: 'right' },
        ],
        rows,
        totals: { unitTypes: rows.length, totalBilled: round2(rows.reduce((s, r) => s + r.totalAmount, 0)) },
      };
    }

    case 'CSC_RPT_11': {
      const rows = csc.customers.map((c) => {
        const custOrders = orders.filter((o) => o.customerId === c.customerId || o.mobile === c.mobile);
        const custPvc = pvcOrders.filter((p) => p.customerId === c.customerId || p.mobile === c.mobile);
        const totalBilled = round2(
          custOrders.reduce((s, o) => s + o.totalAmount, 0) +
            custPvc.reduce((s, p) => s + p.grandTotal, 0)
        );
        const totalPaid = round2(
          custOrders.reduce((s, o) => s + Math.max(0, o.totalPaid - o.refundedAmount), 0) +
            custPvc.reduce((s, p) => s + p.totalPaid, 0)
        );
        return {
          customerId: c.customerId,
          fullName: c.fullName,
          mobile: c.mobile,
          district: c.district,
          cscOrders: custOrders.length,
          pvcOrders: custPvc.length,
          totalBilled,
          totalPaid,
          due: round2(Math.max(0, totalBilled - totalPaid)),
          accountStatus: c.accountStatus,
        };
      });
      return {
        ...base,
        columns: [
          { key: 'customerId', label: 'Customer ID', type: 'text' },
          { key: 'fullName', label: 'Name', type: 'text' },
          { key: 'mobile', label: 'Mobile', type: 'text' },
          { key: 'district', label: 'District', type: 'text' },
          { key: 'cscOrders', label: 'CSC Orders', type: 'number', align: 'right' },
          { key: 'pvcOrders', label: 'PVC Orders', type: 'number', align: 'right' },
          { key: 'totalBilled', label: 'Billed (₹)', type: 'currency', align: 'right' },
          { key: 'totalPaid', label: 'Paid (₹)', type: 'currency', align: 'right' },
          { key: 'due', label: 'Due (₹)', type: 'currency', align: 'right' },
          { key: 'accountStatus', label: 'Status', type: 'status' },
        ],
        rows,
        totals: { customers: rows.length, totalBilled: round2(rows.reduce((s, r) => s + r.totalBilled, 0)) },
      };
    }

    case 'CSC_RPT_12': {
      const opMap = new Map<string, { operatorId: string; operatorName: string; cscOrders: number; completed: number; pvcOrders: number; grievances: number; totalCollected: number }>();
      const touchOp = (id: string, name: string) => {
        const cur = opMap.get(id) ?? {
          operatorId: id,
          operatorName: name || securityStore.findUserByUserId(id)?.fullName || id,
          cscOrders: 0,
          completed: 0,
          pvcOrders: 0,
          grievances: 0,
          totalCollected: 0,
        };
        opMap.set(id, cur);
        return cur;
      };
      for (const o of orders) {
        const cur = touchOp(o.operatorId, o.operatorName);
        cur.cscOrders += 1;
        if (o.applicationStatus === 'Completed' || o.applicationStatus === 'Delivered') cur.completed += 1;
      }
      for (const p of pvcOrders) {
        touchOp(p.operatorId, p.operatorName).pvcOrders += 1;
      }
      for (const g of grievances) {
        touchOp(g.operatorId, g.operatorName).grievances += 1;
      }
      for (const r of csc.listAllReceipts().filter((rec) => rec.paymentType !== 'Refund' && inDateRangeCsc(rec.paymentDate, filters))) {
        const cur = touchOp(r.operatorId, r.operatorName);
        cur.totalCollected = round2(cur.totalCollected + r.amount);
      }
      const rows = Array.from(opMap.values());
      return {
        ...base,
        columns: [
          { key: 'operatorId', label: 'Operator ID', type: 'text' },
          { key: 'operatorName', label: 'Operator Name', type: 'text' },
          { key: 'cscOrders', label: 'CSC Orders', type: 'number', align: 'right' },
          { key: 'completed', label: 'Completed', type: 'number', align: 'right' },
          { key: 'pvcOrders', label: 'PVC Orders', type: 'number', align: 'right' },
          { key: 'grievances', label: 'Grievances', type: 'number', align: 'right' },
          { key: 'totalCollected', label: 'Collected (₹)', type: 'currency', align: 'right' },
        ],
        rows,
        totals: { operators: rows.length, totalCollected: round2(rows.reduce((s, r) => s + r.totalCollected, 0)) },
      };
    }

    case 'CSC_RPT_13': {
      const rows = orders.map((o) => ({
        orderId: o.orderId,
        orderDate: o.orderDate,
        customerName: o.customerName,
        categoryName: o.selectedCategoryName,
        serviceName: o.selectedServiceName,
        applicationStatus: o.applicationStatus,
        paymentStatus: o.paymentStatus,
        totalAmount: o.totalAmount,
        remainingDue: o.remainingDue,
        operatorName: o.operatorName,
      }));
      return {
        ...base,
        columns: [
          { key: 'orderId', label: 'Order ID', type: 'text' },
          { key: 'orderDate', label: 'Order Date', type: 'date' },
          { key: 'customerName', label: 'Customer', type: 'text' },
          { key: 'categoryName', label: 'Category', type: 'text' },
          { key: 'serviceName', label: 'Service', type: 'text' },
          { key: 'applicationStatus', label: 'Application Status', type: 'status' },
          { key: 'paymentStatus', label: 'Payment Status', type: 'status' },
          { key: 'totalAmount', label: 'Total (₹)', type: 'currency', align: 'right' },
          { key: 'remainingDue', label: 'Due (₹)', type: 'currency', align: 'right' },
          { key: 'operatorName', label: 'Operator', type: 'text' },
        ],
        rows,
        totals: { orders: rows.length, totalValue: round2(rows.reduce((s, r) => s + r.totalAmount, 0)) },
      };
    }

    case 'CSC_RPT_14': {
      const rows = csc.documents
        .filter((d) => d.verificationStatus !== 'Verified')
        .map((d) => ({
          docId: d.docId,
          customerId: d.customerId,
          orderId: d.orderId || d.grievanceId || 'General',
          category: d.category,
          docName: d.docName,
          verificationStatus: d.verificationStatus,
          uploadedBy: d.uploadedBy,
          uploadedAt: d.uploadedAt.slice(0, 10),
          rejectionReason: d.rejectionReason || '—',
        }));
      return {
        ...base,
        columns: [
          { key: 'docId', label: 'Document ID', type: 'text' },
          { key: 'customerId', label: 'Customer ID', type: 'text' },
          { key: 'orderId', label: 'Order / Ref', type: 'text' },
          { key: 'category', label: 'Doc Category', type: 'text' },
          { key: 'docName', label: 'Document Name', type: 'text' },
          { key: 'verificationStatus', label: 'Verification Status', type: 'status' },
          { key: 'uploadedBy', label: 'Uploaded By', type: 'text' },
          { key: 'uploadedAt', label: 'Uploaded Date', type: 'date' },
          { key: 'rejectionReason', label: 'Notes', type: 'text' },
        ],
        rows,
        totals: { pendingDocuments: rows.length },
      };
    }

    case 'CSC_RPT_15': {
      const rows = csc.rateHistory
        .filter((h) => inDateRangeCsc(h.changedAt, filters))
        .map((h) => ({
          changedAt: h.changedAt.slice(0, 10),
          serviceCode: h.serviceCode,
          serviceName: h.serviceName,
          categoryName: h.categoryName,
          adminId: h.adminId,
          oldTotal: h.oldTotalAmount ?? 0,
          newServiceCharge: h.newServiceCharge,
          newGovtFee: h.newGovtFee,
          newTotalAmount: h.newTotalAmount,
          newUnitType: h.newUnitType,
          effectiveDate: h.effectiveDate,
          changeReason: h.changeReason,
        }));
      return {
        ...base,
        columns: [
          { key: 'changedAt', label: 'Changed Date', type: 'date' },
          { key: 'serviceCode', label: 'Service Code', type: 'text' },
          { key: 'serviceName', label: 'Service Name', type: 'text' },
          { key: 'categoryName', label: 'Category', type: 'text' },
          { key: 'adminId', label: 'Changed By', type: 'text' },
          { key: 'oldTotal', label: 'Prev Total (₹)', type: 'currency', align: 'right' },
          { key: 'newServiceCharge', label: 'New SC (₹)', type: 'currency', align: 'right' },
          { key: 'newGovtFee', label: 'New Govt (₹)', type: 'currency', align: 'right' },
          { key: 'newTotalAmount', label: 'New Total (₹)', type: 'currency', align: 'right' },
          { key: 'newUnitType', label: 'Unit', type: 'text' },
          { key: 'effectiveDate', label: 'Effective From', type: 'date' },
          { key: 'changeReason', label: 'Reason', type: 'text' },
        ],
        rows,
        totals: { revisions: rows.length },
      };
    }

    case 'CSC_RPT_16':
    case 'CSC_RPT_17': {
      const mode = reportKey === 'CSC_RPT_17' ? 'WHOLESALE' : 'INDIVIDUAL';
      const rows = pvcOrders
        .filter((p) => p.orderMode === mode)
        .map((p) => ({
          orderId: p.orderId,
          orderDate: p.orderDate,
          customerOrShop: p.shopName ? `${p.shopName} (${p.shopOwnerName})` : p.customerName,
          mobile: p.mobile,
          cardSummary: p.items.map((i) => `${i.cardTypeName} x${i.quantity} @ ₹${i.ratePerCard}`).join('; '),
          totalCards: p.totalCards,
          grandTotal: p.grandTotal,
          totalPaid: p.totalPaid,
          remainingDue: p.remainingDue,
          paymentStatus: p.paymentStatus,
          deliveryStatus: p.deliveryStatus,
        }));
      return {
        ...base,
        columns: [
          { key: 'orderId', label: 'PVC Order #', type: 'text' },
          { key: 'orderDate', label: 'Order Date', type: 'date' },
          { key: 'customerOrShop', label: mode === 'WHOLESALE' ? 'Wholesale Shop' : 'Customer', type: 'text' },
          { key: 'mobile', label: 'Mobile', type: 'text' },
          { key: 'cardSummary', label: 'Card Breakdown & Slab Rate', type: 'text' },
          { key: 'totalCards', label: 'Total Cards', type: 'number', align: 'right' },
          { key: 'grandTotal', label: 'Grand Total (₹)', type: 'currency', align: 'right' },
          { key: 'totalPaid', label: 'Paid (₹)', type: 'currency', align: 'right' },
          { key: 'remainingDue', label: 'Due (₹)', type: 'currency', align: 'right' },
          { key: 'paymentStatus', label: 'Pay Status', type: 'status' },
          { key: 'deliveryStatus', label: 'Delivery', type: 'status' },
        ],
        rows,
        totals: {
          orders: rows.length,
          totalCards: rows.reduce((s, r) => s + r.totalCards, 0),
          grandTotal: round2(rows.reduce((s, r) => s + r.grandTotal, 0)),
        },
      };
    }

    case 'CSC_RPT_18': {
      const rows = csc.wholesaleShops.map((shop) => {
        const prof = csc.getWholesaleShopProfile(shop.id);
        return {
          shopCode: shop.shopCode,
          shopName: shop.shopName,
          ownerName: shop.ownerName,
          mobile: shop.mobile,
          totalOrders: prof.totalOrders,
          totalCardsPrinted: prof.totalCardsPrinted,
          totalAmount: prof.totalAmount,
          totalPaid: prof.totalPaid,
          pendingDue: prof.pendingDue,
          status: shop.active ? 'Active' : 'Inactive',
        };
      });
      return {
        ...base,
        columns: [
          { key: 'shopCode', label: 'Shop Code', type: 'text' },
          { key: 'shopName', label: 'Shop Name', type: 'text' },
          { key: 'ownerName', label: 'Owner', type: 'text' },
          { key: 'mobile', label: 'Mobile', type: 'text' },
          { key: 'totalOrders', label: 'Orders', type: 'number', align: 'right' },
          { key: 'totalCardsPrinted', label: 'Total Cards', type: 'number', align: 'right' },
          { key: 'totalAmount', label: 'Total Billed (₹)', type: 'currency', align: 'right' },
          { key: 'totalPaid', label: 'Total Paid (₹)', type: 'currency', align: 'right' },
          { key: 'pendingDue', label: 'Pending Due (₹)', type: 'currency', align: 'right' },
          { key: 'status', label: 'Status', type: 'status' },
        ],
        rows,
        totals: {
          shops: rows.length,
          totalAmount: round2(rows.reduce((s, r) => s + r.totalAmount, 0)),
          pendingDue: round2(rows.reduce((s, r) => s + r.pendingDue, 0)),
        },
      };
    }

    case 'CSC_RPT_19': {
      const rows = grievances.map((g) => ({
        internalTrackingId: g.internalTrackingId,
        externalAckNo: g.externalAckNo || 'Pending',
        customerName: g.customerName,
        mobile: g.mobile,
        complaintCategory: g.complaintCategory,
        serviceType: g.serviceType,
        department: g.department,
        isRti: g.isRti ? g.rtiType || 'RTI' : 'Grievance',
        submissionDate: g.submissionDate,
        followUpDate: g.followUpDate,
        complaintStatus: g.complaintStatus,
        totalAmount: g.totalAmount,
      }));
      return {
        ...base,
        columns: [
          { key: 'internalTrackingId', label: 'Tracking ID', type: 'text' },
          { key: 'externalAckNo', label: 'Govt Ack #', type: 'text' },
          { key: 'customerName', label: 'Applicant', type: 'text' },
          { key: 'mobile', label: 'Mobile', type: 'text' },
          { key: 'complaintCategory', label: 'Category', type: 'text' },
          { key: 'serviceType', label: 'Service Type', type: 'text' },
          { key: 'department', label: 'Department', type: 'text' },
          { key: 'isRti', label: 'Mode', type: 'text' },
          { key: 'submissionDate', label: 'Filed Date', type: 'date' },
          { key: 'followUpDate', label: 'Follow-up Date', type: 'date' },
          { key: 'complaintStatus', label: 'Status', type: 'status' },
          { key: 'totalAmount', label: 'Fee (₹)', type: 'currency', align: 'right' },
        ],
        rows,
        totals: { totalCases: rows.length, totalFee: round2(rows.reduce((s, r) => s + r.totalAmount, 0)) },
      };
    }

    case 'CSC_RPT_20':
    case 'CSC_RPT_21':
    case 'CSC_RPT_22':
    case 'CSC_RPT_23':
    case 'CSC_RPT_24': {
      const filtered = orders.filter((o) => {
        if (reportKey === 'CSC_RPT_20') return o.moduleTag === 'PMJAY';
        if (reportKey === 'CSC_RPT_21') return o.moduleTag === 'PMJAY' || o.moduleTag === 'MMSBY' || (o.ekycStatus && o.ekycStatus !== 'Not Applicable');
        if (reportKey === 'CSC_RPT_22') return o.moduleTag === 'MMSBY';
        if (reportKey === 'CSC_RPT_23') return o.moduleTag === 'NPCI';
        return o.moduleTag === 'CYBER_CRIME';
      });
      const rows = filtered.map((o) => ({
        orderId: o.orderId,
        orderDate: o.orderDate,
        customerName: o.customerName,
        mobile: o.mobile,
        moduleTag: o.moduleTag,
        serviceName: o.selectedServiceName,
        ekycMethod: o.ekycMethod || 'Not Applicable',
        ekycStatus: o.ekycStatus || 'Not Applicable',
        externalAckNo:
          o.cyberCrimeDetails?.cyberAcknowledgementNo || o.externalAckNo || '—',
        applicationStatus: o.applicationStatus,
        totalAmount: o.totalAmount,
        remainingDue: o.remainingDue,
      }));
      return {
        ...base,
        columns: [
          { key: 'orderId', label: 'Order ID', type: 'text' },
          { key: 'orderDate', label: 'Order Date', type: 'date' },
          { key: 'customerName', label: 'Customer / Beneficiary', type: 'text' },
          { key: 'mobile', label: 'Mobile', type: 'text' },
          { key: 'moduleTag', label: 'Module', type: 'text' },
          { key: 'serviceName', label: 'Service', type: 'text' },
          { key: 'ekycMethod', label: 'e-KYC Method', type: 'text' },
          { key: 'ekycStatus', label: 'e-KYC Status', type: 'status' },
          { key: 'externalAckNo', label: 'Ack / Ref #', type: 'text' },
          { key: 'applicationStatus', label: 'App Status', type: 'status' },
          { key: 'totalAmount', label: 'Total (₹)', type: 'currency', align: 'right' },
          { key: 'remainingDue', label: 'Due (₹)', type: 'currency', align: 'right' },
        ],
        rows,
        totals: { records: rows.length, totalValue: round2(rows.reduce((s, r) => s + r.totalAmount, 0)) },
      };
    }

    case 'CSC_RPT_25':
    default: {
      const rows = csc.customers.map((c) => {
        const custOrders = orders.filter((o) => o.customerId === c.customerId || o.mobile === c.mobile);
        const custPvc = pvcOrders.filter((p) => p.customerId === c.customerId || p.mobile === c.mobile);
        const custGrv = grievances.filter((g) => g.customerId === c.customerId || g.mobile === c.mobile);
        const totalValue = round2(
          custOrders.reduce((s, o) => s + o.totalAmount, 0) +
            custPvc.reduce((s, p) => s + p.grandTotal, 0) +
            custGrv.reduce((s, g) => s + g.totalAmount, 0)
        );
        const totalDue = round2(
          custOrders.reduce((s, o) => s + o.remainingDue, 0) +
            custPvc.reduce((s, p) => s + p.remainingDue, 0) +
            custGrv.reduce((s, g) => s + g.remainingDue, 0)
        );
        return {
          customerId: c.customerId,
          fullName: c.fullName,
          mobile: c.mobile,
          serviceOrders: custOrders.length,
          pvcOrders: custPvc.length,
          grievanceRtiCases: custGrv.length,
          totalValue,
          totalDue,
          accountStatus: c.accountStatus,
        };
      });
      return {
        ...base,
        columns: [
          { key: 'customerId', label: 'Customer ID', type: 'text' },
          { key: 'fullName', label: 'Customer Name', type: 'text' },
          { key: 'mobile', label: 'Mobile', type: 'text' },
          { key: 'serviceOrders', label: 'Service Orders', type: 'number', align: 'right' },
          { key: 'pvcOrders', label: 'PVC Orders', type: 'number', align: 'right' },
          { key: 'grievanceRtiCases', label: 'Grievance / RTI', type: 'number', align: 'right' },
          { key: 'totalValue', label: 'Combined Billed (₹)', type: 'currency', align: 'right' },
          { key: 'totalDue', label: 'Combined Due (₹)', type: 'currency', align: 'right' },
          { key: 'accountStatus', label: 'Status', type: 'status' },
        ],
        rows,
        totals: { customers: rows.length, combinedValue: round2(rows.reduce((s, r) => s + r.totalValue, 0)) },
      };
    }
  }
}
