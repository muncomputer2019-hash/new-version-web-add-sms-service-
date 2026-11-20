import {
  AccountType,
  ChartOfAccount,
  FixedAssetRecord,
  FiscalPeriodRecord,
  JournalLineInput,
  JournalLineRecord,
  JournalVoucherRecord,
  ProductInventoryItem,
  VoucherStatus,
  VoucherType,
} from './financeTypes';

export interface TrialBalanceRow {
  accountCode: string;
  accountName: string;
  accountType: AccountType;
  subType: string;
  openingDebit: number;
  openingCredit: number;
  periodDebit: number;
  periodCredit: number;
  closingDebit: number;
  closingCredit: number;
  netBalance: number; // + for Debit-normal asset/expense/cogs, + for Credit-normal liability/equity/income
}

export interface FinancialStatementsReport {
  entityCode: string;
  generatedAt: string;
  trialBalance: {
    rows: TrialBalanceRow[];
    totalOpeningDebit: number;
    totalOpeningCredit: number;
    totalPeriodDebit: number;
    totalPeriodCredit: number;
    totalClosingDebit: number;
    totalClosingCredit: number;
    isBalanced: boolean;
    difference: number;
  };
  profitAndLoss: {
    incomeRows: Array<{ accountCode: string; accountName: string; amount: number }>;
    cogsRows: Array<{ accountCode: string; accountName: string; amount: number }>;
    expenseRows: Array<{ accountCode: string; accountName: string; amount: number }>;
    totalIncome: number;
    totalCogs: number;
    grossProfit: number;
    totalExpenses: number;
    netProfit: number;
  };
  balanceSheet: {
    assetRows: Array<{ accountCode: string; accountName: string; subType: string; amount: number }>;
    liabilityRows: Array<{ accountCode: string; accountName: string; subType: string; amount: number }>;
    equityRows: Array<{ accountCode: string; accountName: string; subType: string; amount: number }>;
    totalAssets: number;
    totalLiabilities: number;
    totalEquityIncludingNetProfit: number;
    isBalanced: boolean;
    equationDifference: number;
  };
  cashFlowStatement: {
    operatingCashFlow: number;
    investingCashFlow: number;
    financingCashFlow: number;
    netCashChange: number;
    closingCashAndBank: number;
  };
  costCenterProfitability: Array<{
    costCenter: string;
    income: number;
    directAndOperatingCost: number;
    netContribution: number;
  }>;
}

export function round2(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

export function derivePeriodCode(isoDate: string): string {
  const clean = isoDate.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    return clean.slice(0, 7);
  }
  return '2026-11';
}

export function deriveFyCode(isoDate: string): string {
  const clean = isoDate.slice(0, 10);
  const year = Number(clean.slice(0, 4)) || 2026;
  const month = Number(clean.slice(5, 7)) || 11;
  const startYear = month >= 4 ? year : year - 1;
  const endShort = String((startYear + 1) % 100).padStart(2, '0');
  return `FY ${startYear}-${endShort}`;
}

export function validateAndBuildVoucher(params: {
  voucherNo: string;
  idempotencyKey?: string;
  entityCode: string;
  branchCode: string;
  costCenter: string;
  voucherDate: string;
  voucherType: VoucherType;
  referenceType?: string;
  referenceId?: string;
  narration: string;
  currencyCode?: string;
  exchangeRate?: number;
  status: VoucherStatus;
  createdBy: string;
  approvedBy?: string | null;
  lines: JournalLineInput[];
  accounts: ChartOfAccount[];
  periods: FiscalPeriodRecord[];
  allowClosedPeriodOverride?: boolean;
}): JournalVoucherRecord {
  const currencyCode = (params.currencyCode || 'INR').toUpperCase();
  const exchangeRate = Number(params.exchangeRate ?? 1);
  if (Number.isNaN(exchangeRate) || exchangeRate <= 0) {
    throw new Error('Exchange rate must be greater than zero.');
  }

  if (!params.lines || params.lines.length < 2) {
    throw new Error('Double-entry voucher requires at least 2 balanced journal lines.');
  }

  const periodCode = derivePeriodCode(params.voucherDate);
  const fyCode = deriveFyCode(params.voucherDate);
  const period = params.periods.find((p) => p.periodCode === periodCode);
  if (period && (period.status === 'Closed' || period.status === 'Soft_Locked') && !params.allowClosedPeriodOverride) {
    throw new Error(
      `Fiscal period ${periodCode} is ${period.status}. Posting blocked unless Admin reopens period with an audit reason.`
    );
  }

  const accountMap = new Map(params.accounts.map((a) => [a.accountCode, a]));
  const builtLines: JournalLineRecord[] = [];
  let totalDebit = 0;
  let totalCredit = 0;

  params.lines.forEach((line, idx) => {
    const acc = accountMap.get(line.accountCode);
    if (!acc) {
      throw new Error(`Chart of Accounts code '${line.accountCode}' does not exist.`);
    }
    if (acc.status !== 'active') {
      throw new Error(`Account '${acc.accountCode} - ${acc.accountName}' is archived.`);
    }
    if (acc.isGroup) {
      throw new Error(`Cannot post directly to summary group account '${acc.accountCode} - ${acc.accountName}'.`);
    }

    const dr = round2(Number(line.debitAmount || 0));
    const cr = round2(Number(line.creditAmount || 0));
    if (Number.isNaN(dr) || Number.isNaN(cr) || dr < 0 || cr < 0) {
      throw new Error('Debit and Credit amounts must be non-negative.');
    }
    if ((dr === 0 && cr === 0) || (dr > 0 && cr > 0)) {
      throw new Error(`Line ${idx + 1} (${acc.accountCode}) must carry either Debit OR Credit > 0.`);
    }

    totalDebit = round2(totalDebit + dr);
    totalCredit = round2(totalCredit + cr);

    builtLines.push({
      id: idx + 1,
      lineNo: idx + 1,
      accountCode: acc.accountCode,
      accountName: acc.accountName,
      accountType: acc.accountType,
      partyType: line.partyType ?? 'NONE',
      partyId: line.partyId,
      costCenter: line.costCenter || params.costCenter || 'GENERAL',
      debitAmount: dr,
      creditAmount: cr,
      fxAmount: line.fxAmount,
      description: line.description || params.narration,
    });
  });

  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    throw new Error(
      `Unbalanced double-entry voucher blocked: Total Debit ₹${totalDebit.toFixed(2)} !== Total Credit ₹${totalCredit.toFixed(2)}.`
    );
  }

  const now = new Date().toISOString();
  return {
    voucherNo: params.voucherNo,
    idempotencyKey: params.idempotencyKey,
    entityCode: params.entityCode,
    branchCode: params.branchCode || 'BR-01',
    costCenter: params.costCenter || 'GENERAL',
    fyCode,
    periodCode,
    voucherDate: params.voucherDate.slice(0, 10),
    voucherType: params.voucherType,
    referenceType: params.referenceType,
    referenceId: params.referenceId,
    narration: params.narration,
    currencyCode,
    exchangeRate,
    totalDebit,
    totalCredit,
    status: params.status,
    reversedVoucherNo: null,
    reversalOfVoucherNo: null,
    createdBy: params.createdBy,
    approvedBy: params.approvedBy ?? null,
    postedAt: params.status === 'Posted' ? now : null,
    createdAt: now,
    lines: builtLines,
  };
}

export function computeFinancialStatements(params: {
  accounts: ChartOfAccount[];
  vouchers: JournalVoucherRecord[];
  entityCode?: string; // 'ALL' for consolidated with intercompany elimination, or specific entityCode
  eliminateIntercompany?: boolean;
}): FinancialStatementsReport {
  const entityCode = params.entityCode || 'ENT-MAIN';
  const postableAccounts = params.accounts.filter((a) => !a.isGroup && a.status === 'active');

  const postedVouchers = params.vouchers.filter((v) => {
    if (v.status !== 'Posted' && v.status !== 'Reversed') return false;
    if (entityCode === 'ALL') {
      // Consolidated view excludes isolated PNB CSP trust entity!
      return v.entityCode !== 'ENT-PNB-CSP';
    }
    return v.entityCode === entityCode;
  });

  const periodDrMap = new Map<string, number>();
  const periodCrMap = new Map<string, number>();
  const ccIncome = new Map<string, number>();
  const ccCost = new Map<string, number>();

  for (const v of postedVouchers) {
    for (const l of v.lines) {
      if (
        params.eliminateIntercompany &&
        (l.accountCode === '2190' || l.accountCode === '1190')
      ) {
        // Intercompany Due-To / Due-From elimination in consolidated reporting (Module 68)
        continue;
      }
      periodDrMap.set(l.accountCode, round2((periodDrMap.get(l.accountCode) ?? 0) + l.debitAmount));
      periodCrMap.set(l.accountCode, round2((periodCrMap.get(l.accountCode) ?? 0) + l.creditAmount));

      const cc = l.costCenter || v.costCenter || 'GENERAL';
      if (l.accountType === 'Income') {
        ccIncome.set(cc, round2((ccIncome.get(cc) ?? 0) + (l.creditAmount - l.debitAmount)));
      } else if (l.accountType === 'COGS' || l.accountType === 'Expense') {
        ccCost.set(cc, round2((ccCost.get(cc) ?? 0) + (l.debitAmount - l.creditAmount)));
      }
    }
  }

  const rows: TrialBalanceRow[] = [];
  let totalOpeningDebit = 0;
  let totalOpeningCredit = 0;
  let totalPeriodDebit = 0;
  let totalPeriodCredit = 0;
  let totalClosingDebit = 0;
  let totalClosingCredit = 0;

  for (const acc of postableAccounts) {
    if (entityCode !== 'ALL' && acc.entityScope !== 'ALL' && acc.entityScope !== entityCode) {
      continue;
    }
    if (entityCode === 'ALL' && acc.entityScope === 'ENT-PNB-CSP') {
      continue;
    }

    const includeOpening = entityCode === 'ENT-MAIN' || entityCode === 'ALL' || acc.entityScope === entityCode;
    const opDr = includeOpening && acc.openingSide === 'Debit' ? round2(acc.openingBalance) : 0;
    const opCr = includeOpening && acc.openingSide === 'Credit' ? round2(acc.openingBalance) : 0;
    const pDr = round2(periodDrMap.get(acc.accountCode) ?? 0);
    const pCr = round2(periodCrMap.get(acc.accountCode) ?? 0);

    const netDrMinusCr = round2(opDr + pDr - (opCr + pCr));
    const clDr = netDrMinusCr >= 0 ? netDrMinusCr : 0;
    const clCr = netDrMinusCr < 0 ? round2(-netDrMinusCr) : 0;

    if (opDr === 0 && opCr === 0 && pDr === 0 && pCr === 0) {
      continue;
    }

    totalOpeningDebit = round2(totalOpeningDebit + opDr);
    totalOpeningCredit = round2(totalOpeningCredit + opCr);
    totalPeriodDebit = round2(totalPeriodDebit + pDr);
    totalPeriodCredit = round2(totalPeriodCredit + pCr);
    totalClosingDebit = round2(totalClosingDebit + clDr);
    totalClosingCredit = round2(totalClosingCredit + clCr);

    const netBalance =
      acc.normalBalance === 'Debit' ? round2(clDr - clCr) : round2(clCr - clDr);

    rows.push({
      accountCode: acc.accountCode,
      accountName: acc.accountName,
      accountType: acc.accountType,
      subType: acc.subType,
      openingDebit: opDr,
      openingCredit: opCr,
      periodDebit: pDr,
      periodCredit: pCr,
      closingDebit: clDr,
      closingCredit: clCr,
      netBalance,
    });
  }

  const tbDiff = round2(Math.abs(totalClosingDebit - totalClosingCredit));

  const incomeRows = rows
    .filter((r) => r.accountType === 'Income')
    .map((r) => ({ accountCode: r.accountCode, accountName: r.accountName, amount: r.netBalance }));
  const cogsRows = rows
    .filter((r) => r.accountType === 'COGS')
    .map((r) => ({ accountCode: r.accountCode, accountName: r.accountName, amount: r.netBalance }));
  const expenseRows = rows
    .filter((r) => r.accountType === 'Expense')
    .map((r) => ({ accountCode: r.accountCode, accountName: r.accountName, amount: r.netBalance }));

  const totalIncome = round2(incomeRows.reduce((s, r) => s + r.amount, 0));
  const totalCogs = round2(cogsRows.reduce((s, r) => s + r.amount, 0));
  const grossProfit = round2(totalIncome - totalCogs);
  const totalExpenses = round2(expenseRows.reduce((s, r) => s + r.amount, 0));
  const netProfit = round2(grossProfit - totalExpenses);

  const assetRows = rows
    .filter((r) => r.accountType === 'Asset')
    .map((r) => ({
      accountCode: r.accountCode,
      accountName: r.accountName,
      subType: r.subType,
      amount: r.netBalance,
    }));
  const liabilityRows = rows
    .filter((r) => r.accountType === 'Liability')
    .map((r) => ({
      accountCode: r.accountCode,
      accountName: r.accountName,
      subType: r.subType,
      amount: r.netBalance,
    }));
  const equityRows = rows
    .filter((r) => r.accountType === 'Equity')
    .map((r) => ({
      accountCode: r.accountCode,
      accountName: r.accountName,
      subType: r.subType,
      amount: r.netBalance,
    }));

  const totalAssets = round2(assetRows.reduce((s, r) => s + r.amount, 0));
  const totalLiabilities = round2(liabilityRows.reduce((s, r) => s + r.amount, 0));
  const baseEquity = round2(equityRows.reduce((s, r) => s + r.amount, 0));
  const totalEquityIncludingNetProfit = round2(baseEquity + netProfit);
  const equationDifference = round2(
    Math.abs(totalAssets - (totalLiabilities + totalEquityIncludingNetProfit))
  );

  // Cash Flow Statement (Indirect + Direct operating cash classification)
  const cashAndBankAccounts = new Set(['1001', '1002', '1003', '1010', '1011']);
  const closingCashAndBank = round2(
    assetRows
      .filter((a) => cashAndBankAccounts.has(a.accountCode) || a.subType === 'Cash & Bank')
      .reduce((s, a) => s + a.amount, 0)
  );

  let investingCashFlow = 0;
  let financingCashFlow = 0;
  let operatingCashFlow = 0;

  for (const v of postedVouchers) {
    if (v.voucherType === 'Opening') continue;
    let cashDelta = 0;
    const hasInvesting = v.lines.some((l) => l.accountType === 'Asset' && (l.accountCode.startsWith('15') || l.accountCode.startsWith('16')));
    const hasFinancing = v.lines.some((l) => l.accountCode.startsWith('23') || l.accountCode.startsWith('30'));
    for (const l of v.lines) {
      if (cashAndBankAccounts.has(l.accountCode)) {
        cashDelta += l.debitAmount - l.creditAmount;
      }
    }
    if (Math.abs(cashDelta) > 0) {
      if (hasInvesting) investingCashFlow = round2(investingCashFlow + cashDelta);
      else if (hasFinancing) financingCashFlow = round2(financingCashFlow + cashDelta);
      else operatingCashFlow = round2(operatingCashFlow + cashDelta);
    }
  }

  const ccSet = new Set([...ccIncome.keys(), ...ccCost.keys()]);
  const costCenterProfitability = Array.from(ccSet).map((cc) => {
    const inc = round2(ccIncome.get(cc) ?? 0);
    const cost = round2(ccCost.get(cc) ?? 0);
    return {
      costCenter: cc,
      income: inc,
      directAndOperatingCost: cost,
      netContribution: round2(inc - cost),
    };
  });

  return {
    entityCode,
    generatedAt: new Date().toISOString(),
    trialBalance: {
      rows,
      totalOpeningDebit,
      totalOpeningCredit,
      totalPeriodDebit,
      totalPeriodCredit,
      totalClosingDebit,
      totalClosingCredit,
      isBalanced: tbDiff < 0.05,
      difference: tbDiff,
    },
    profitAndLoss: {
      incomeRows,
      cogsRows,
      expenseRows,
      totalIncome,
      totalCogs,
      grossProfit,
      totalExpenses,
      netProfit,
    },
    balanceSheet: {
      assetRows,
      liabilityRows,
      equityRows,
      totalAssets,
      totalLiabilities,
      totalEquityIncludingNetProfit,
      isBalanced: equationDifference < 0.05,
      equationDifference,
    },
    cashFlowStatement: {
      operatingCashFlow,
      investingCashFlow,
      financingCashFlow,
      netCashChange: round2(operatingCashFlow + investingCashFlow + financingCashFlow),
      closingCashAndBank,
    },
    costCenterProfitability,
  };
}

export function calculateInventorySaleCogs(
  item: ProductInventoryItem,
  saleQty: number,
  mutateBatches = false
): { cogsTotal: number; unitCogsAvg: number; totalQtyAvailable: number } {
  const totalQtyAvailable = item.batches.reduce((s, b) => s + b.qtyRemaining, 0);
  if (saleQty <= 0) {
    throw new Error('Sale quantity must be positive.');
  }
  if (saleQty > totalQtyAvailable) {
    throw new Error(`Insufficient stock for ${item.sku}: available ${totalQtyAvailable}, requested ${saleQty}.`);
  }

  if (item.valuationMethod === 'WAC') {
    const totalValue = item.batches.reduce((s, b) => s + b.qtyRemaining * b.unitCost, 0);
    const wac = totalValue / totalQtyAvailable;
    const cogsTotal = round2(wac * saleQty);
    if (mutateBatches) {
      let rem = saleQty;
      for (const batch of item.batches) {
        if (rem <= 0) break;
        const take = Math.min(batch.qtyRemaining, rem);
        batch.qtyRemaining -= take;
        rem -= take;
      }
      item.batches = item.batches.filter((b) => b.qtyRemaining > 0);
    }
    return { cogsTotal, unitCogsAvg: round2(wac), totalQtyAvailable };
  }

  // FIFO: consume earliest batches first
  let rem = saleQty;
  let cogsTotal = 0;
  for (const batch of item.batches) {
    if (rem <= 0) break;
    const take = Math.min(batch.qtyRemaining, rem);
    cogsTotal += take * batch.unitCost;
    if (mutateBatches) {
      batch.qtyRemaining -= take;
    }
    rem -= take;
  }
  if (mutateBatches) {
    item.batches = item.batches.filter((b) => b.qtyRemaining > 0);
  }
  cogsTotal = round2(cogsTotal);
  return {
    cogsTotal,
    unitCogsAvg: round2(cogsTotal / saleQty),
    totalQtyAvailable,
  };
}

export function calculateAnnualOrMonthlyDepreciation(
  asset: FixedAssetRecord,
  months = 1
): number {
  const nbv = Math.max(0, round2(asset.costAmount - asset.accumulatedDepreciation));
  const depreciableBase = Math.max(0, round2(nbv - asset.salvageValue));
  if (depreciableBase <= 0 || asset.status !== 'Active') return 0;

  let annualDep = 0;
  if (asset.depreciationMethod === 'SLM') {
    const base = Math.max(0, asset.costAmount - asset.salvageValue);
    annualDep = asset.usefulLifeYears > 0 ? base / asset.usefulLifeYears : base * (asset.ratePct / 100);
  } else {
    // WDV on net book value
    annualDep = nbv * (asset.ratePct / 100);
  }
  const periodDep = round2((annualDep * months) / 12);
  return Math.min(periodDep, depreciableBase);
}

export function splitLoanEmi(
  outstandingPrincipal: number,
  annualRatePct: number,
  emiAmount: number
): { interestPart: number; principalPart: number; closingPrincipal: number } {
  const monthlyRate = annualRatePct / 12 / 100;
  const interestPart = round2(outstandingPrincipal * monthlyRate);
  const principalPart = Math.min(outstandingPrincipal, round2(Math.max(0, emiAmount - interestPart)));
  const closingPrincipal = round2(Math.max(0, outstandingPrincipal - principalPart));
  return { interestPart, principalPart, closingPrincipal };
}
