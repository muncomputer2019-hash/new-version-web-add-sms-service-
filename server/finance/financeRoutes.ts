import { Express, Request, Response } from 'express';
import { GoogleGenAI } from '@google/genai';
import { SecurityStore } from '../securityStore';
import { ServerUser } from '../types';
import { sanitizeText } from '../crypto';
import { FinanceStore } from './financeStore';
import {
  calculateAnnualOrMonthlyDepreciation,
  calculateInventorySaleCogs,
  computeFinancialStatements,
  round2,
  splitLoanEmi,
} from './accountingEngine';
import { JournalLineInput, VoucherType } from './financeTypes';

interface AuthedRequest extends Request {
  authUser?: ServerUser;
}

function ok(res: Response, data: unknown, message = 'OK', status = 200) {
  return res.status(status).json({
    success: true,
    message,
    data,
    meta: { timestamp: new Date().toISOString() },
  });
}

function fail(
  res: Response,
  message: string,
  status = 400,
  errors?: Record<string, string[]>
) {
  return res.status(status).json({
    success: false,
    message,
    data: null,
    meta: { timestamp: new Date().toISOString() },
    ...(errors ? { errors } : {}),
  });
}

export function registerFinanceRoutes(
  app: Express,
  securityStore: SecurityStore,
  finance: FinanceStore,
  requireAuth: (req: AuthedRequest, res: Response, next: () => void) => void
) {
  const requireWriteRole = (req: AuthedRequest, res: Response, roles: Array<'ADMIN' | 'MANAGER' | 'STAFF' | 'EMPLOYEE'> = ['ADMIN', 'MANAGER']): ServerUser | null => {
    const actor = req.authUser!;
    if (actor.role === 'AUDITOR' || actor.role === 'CUSTOMER') {
      fail(res, `Forbidden: ${actor.role} role cannot mutate accounting transactions.`, 403);
      return null;
    }
    if (!roles.includes(actor.role)) {
      fail(res, `Forbidden: Requires ${roles.join(' or ')} authorization.`, 403);
      return null;
    }
    return actor;
  };

  // ==========================================================================
  // 1. OVERVIEW, STATEMENTS, KPI SCORECARD & CONSOLIDATION (Mod 13, 19, 20, 24, 29, 46, 52, 54, 68, 85, 86)
  // ==========================================================================
  app.get('/api/finance/overview', requireAuth, (req: AuthedRequest, res) => {
    const entityCode = String(req.query.entityCode || 'ENT-MAIN');
    const eliminateIntercompany = String(req.query.eliminate || 'true') !== 'false';
    const statements = computeFinancialStatements({
      accounts: finance.chartOfAccounts,
      vouchers: finance.vouchers,
      entityCode,
      eliminateIntercompany,
    });

    const cspDeposits = finance.pnbCspLedger
      .filter((e) => e.txnType === 'Customer Deposit')
      .reduce((s, e) => s + e.principalAmount, 0);
    const cspWithdrawals = finance.pnbCspLedger
      .filter((e) => e.txnType === 'Customer Withdrawal' || e.txnType === 'AEPS Cash Out')
      .reduce((s, e) => s + e.principalAmount, 0);
    const cspTotalCommission = finance.pnbCspLedger.reduce((s, e) => s + e.commissionIncome, 0);

    const totalStockValue = round2(
      finance.products.reduce(
        (s, p) => s + p.batches.reduce((bs, b) => bs + b.qtyRemaining * b.unitCost, 0),
        0
      )
    );
    const totalPayable = round2(
      finance.supplierBills.reduce((s, b) => s + Math.max(0, b.netPayable - b.paidAmount), 0)
    );
    const erpConfirmedRevenue = round2(
      finance.erpStore.payments
        .filter((p) => p.verificationStatus === 'Confirmed')
        .reduce((s, p) => s + p.amount, 0)
    );
    const erpPendingDues = round2(
      finance.erpStore.applications
        .filter((a) => a.status !== 'Cancelled' && a.status !== 'Rejected')
        .reduce((s, a) => {
          const paid = finance.erpStore.payments
            .filter((p) => p.applicationNo === a.applicationNo && p.verificationStatus === 'Confirmed')
            .reduce((ps, p) => ps + p.amount, 0);
          return s + Math.max(0, a.serviceSnapshot.customerChargeSnapshot - paid);
        }, 0)
    );

    const netMarginPct =
      statements.profitAndLoss.totalIncome > 0
        ? round2((statements.profitAndLoss.netProfit / statements.profitAndLoss.totalIncome) * 100)
        : 0;

    return ok(res, {
      entities: finance.entities,
      selectedEntity: entityCode,
      statements,
      kpis: {
        totalAssets: statements.balanceSheet.totalAssets,
        totalLiabilities: statements.balanceSheet.totalLiabilities,
        totalEquity: statements.balanceSheet.totalEquityIncludingNetProfit,
        totalIncome: statements.profitAndLoss.totalIncome,
        totalCogs: statements.profitAndLoss.totalCogs,
        grossProfit: statements.profitAndLoss.grossProfit,
        totalExpenses: statements.profitAndLoss.totalExpenses,
        netProfit: statements.profitAndLoss.netProfit,
        netMarginPct,
        closingCashAndBank: statements.cashFlowStatement.closingCashAndBank,
        inventoryValuation: totalStockValue,
        supplierPayables: totalPayable,
        customerReceivablesEstimated: erpPendingDues,
        erpConfirmedRevenue,
        pendingApprovalVouchers: finance.vouchers.filter((v) => v.status === 'Pending_Approval').length,
        openFraudAlerts: finance.fraudAlerts.filter((a) => a.status === 'Open').length,
        pnbCspIsolated: {
          deposits: round2(cspDeposits),
          withdrawals: round2(cspWithdrawals),
          commissionRecognizedToBusiness: round2(cspTotalCommission),
        },
      },
      fiscalYears: finance.fiscalYears,
      fiscalPeriods: finance.fiscalPeriods,
      chartOfAccounts: finance.chartOfAccounts,
      vouchers: finance.vouchers,
      cashCounters: finance.cashCounters,
      cashTransfers: finance.cashTransfers,
      pnbCspLedger: finance.pnbCspLedger,
      paymentModes: finance.paymentModes,
      customerCredits: finance.customerCredits,
      suppliers: finance.suppliers,
      supplierBills: finance.supplierBills,
      bankAccounts: finance.bankAccounts,
      bankStatements: finance.bankStatements,
      cheques: finance.cheques,
      employees: finance.employees,
      payrollRuns: finance.payrollRuns,
      taxEntries: finance.taxEntries,
      fixedAssets: finance.fixedAssets,
      budgets: finance.budgets,
      recurringRules: finance.recurringRules,
      products: finance.products,
      inventoryMovements: finance.inventoryMovements,
      loans: finance.loans,
      investments: finance.investments,
      partners: finance.partners,
      franchises: finance.franchises,
      subscriptions: finance.subscriptions,
      currencyRates: finance.currencyRates,
      approvalMatrix: finance.approvalMatrix,
      fraudAlerts: finance.fraudAlerts,
      compliancePolicies: finance.compliancePolicies,
      tasks: finance.tasks,
      documentVault: finance.documentVault,
      importBatches: finance.importBatches,
      auditObservations: finance.auditObservations,
      whiteLabelSettings: finance.whiteLabelSettings,
      workflowRules: finance.workflowRules,
      notificationRules: finance.notificationRules,
      latestAuditCertificate: finance.latestAuditCertificate,
    });
  });

  // ==========================================================================
  // 2. CHART OF ACCOUNTS & OPENING BALANCES (Mod 02, 03)
  // ==========================================================================
  app.post('/api/finance/coa', requireAuth, (req: AuthedRequest, res) => {
    const actor = requireWriteRole(req, res, ['ADMIN']);
    if (!actor) return;

    const { accountCode, accountName, accountType, subType, parentCode, entityScope, gstApplicable } = req.body ?? {};
    const code = sanitizeText(String(accountCode || '').trim());
    if (!code || !accountName || !['Asset', 'Liability', 'Equity', 'Income', 'COGS', 'Expense'].includes(String(accountType))) {
      return fail(res, 'Valid account code, name, and account type are required.', 422);
    }
    if (finance.chartOfAccounts.some((a) => a.accountCode === code)) {
      return fail(res, `Account code ${code} already exists.`, 409);
    }

    const normalBalance = ['Asset', 'COGS', 'Expense'].includes(accountType) ? 'Debit' : 'Credit';
    const created = {
      accountCode: code,
      accountName: sanitizeText(String(accountName)),
      accountType,
      subType: sanitizeText(String(subType || 'General')),
      parentCode: parentCode ? String(parentCode) : null,
      normalBalance: normalBalance as 'Debit' | 'Credit',
      isGroup: false,
      isSystemLocked: false,
      entityScope: String(entityScope || 'ALL'),
      gstApplicable: Boolean(gstApplicable),
      openingBalance: 0,
      openingSide: normalBalance as 'Debit' | 'Credit',
      status: 'active' as const,
    };
    finance.chartOfAccounts.push(created);
    finance.securityStore.addAuditLog({
      actorUserId: actor.userId,
      action: 'CREATE_COA_ACCOUNT',
      targetType: 'coa',
      targetId: created.accountCode,
      details: `Added ${created.accountCode} - ${created.accountName} (${created.accountType}).`,
      ipAddress: req.socket?.remoteAddress || '127.0.0.1',
    });
    return ok(res, created, `Account ${created.accountCode} created.`, 201);
  });

  app.delete('/api/finance/coa/:code', requireAuth, (req: AuthedRequest, res) => {
    const actor = requireWriteRole(req, res, ['ADMIN']);
    if (!actor) return;

    const acc = finance.chartOfAccounts.find((a) => a.accountCode === req.params.code);
    if (!acc) return fail(res, 'Account not found.', 404);
    if (acc.isSystemLocked) return fail(res, 'System-controlled account cannot be deleted.', 400);

    const usedInVouchers = finance.vouchers.some((v) =>
      v.lines.some((l) => l.accountCode === acc.accountCode)
    );
    if (usedInVouchers || acc.openingBalance > 0) {
      return fail(res, 'Cannot delete Chart of Account that already has posted transactions or opening balance.', 400);
    }

    acc.status = 'archived';
    return ok(res, { archived: true }, `Account ${acc.accountCode} archived.`);
  });

  // ==========================================================================
  // 3. DOUBLE-ENTRY VOUCHER ENGINE, APPROVAL & IMMUTABLE REVERSAL (Mod 01, 14, 42, 43, 83, 84)
  // ==========================================================================
  app.post('/api/finance/vouchers', requireAuth, (req: AuthedRequest, res) => {
    const actor = requireWriteRole(req, res, ['ADMIN', 'MANAGER']);
    if (!actor) return;

    const { entityCode, costCenter, voucherDate, voucherType, narration, currencyCode, exchangeRate, lines } =
      req.body ?? {};
    if (!narration || !Array.isArray(lines)) {
      return fail(res, 'Narration and balanced debit/credit lines are required.', 422);
    }

    const currency = String(currencyCode || 'INR').toUpperCase();
    const rate =
      exchangeRate !== undefined
        ? Number(exchangeRate)
        : finance.currencyRates.find((c) => c.currencyCode === currency)?.spotRateInr ?? 1;

    const normalizedLines: JournalLineInput[] = lines.map((l: any) => ({
      accountCode: String(l.accountCode),
      partyType: l.partyType || 'NONE',
      partyId: l.partyId,
      costCenter: l.costCenter || costCenter || 'GENERAL',
      debitAmount: round2(Number(l.debitAmount || 0) * rate),
      creditAmount: round2(Number(l.creditAmount || 0) * rate),
      fxAmount: currency !== 'INR' ? Number(l.debitAmount || l.creditAmount || 0) : undefined,
      description: l.description ? sanitizeText(String(l.description)) : undefined,
    }));

    const grossAmount = normalizedLines.reduce((s, l) => s + l.debitAmount, 0);
    const requiresAdminApproval =
      actor.role !== 'ADMIN' && grossAmount >= finance.whiteLabelSettings.makerCheckerThresholdInr;

    try {
      const voucher = finance.postSystemVoucher({
        entityCode: String(entityCode || 'ENT-MAIN'),
        costCenter: String(costCenter || 'GENERAL'),
        voucherDate: String(voucherDate || new Date().toISOString().slice(0, 10)),
        voucherType: (voucherType || 'Journal') as VoucherType,
        narration: String(narration),
        currencyCode: currency,
        exchangeRate: rate,
        status: requiresAdminApproval ? 'Pending_Approval' : 'Posted',
        createdBy: actor.userId,
        approvedBy: requiresAdminApproval ? null : actor.userId,
        lines: normalizedLines,
      });
      finance.recomputeCounterBalances();
      finance.saveEncryptedSnapshotToDisk();

      return ok(
        res,
        voucher,
        requiresAdminApproval
          ? `Voucher ${voucher.voucherNo} queued for Admin Maker-Checker approval (threshold >= ₹${finance.whiteLabelSettings.makerCheckerThresholdInr}).`
          : `Voucher ${voucher.voucherNo} posted to General Ledger.`,
        201
      );
    } catch (err) {
      return fail(res, err instanceof Error ? err.message : 'Voucher validation failed.', 422);
    }
  });

  app.post('/api/finance/vouchers/:voucherNo/approve', requireAuth, (req: AuthedRequest, res) => {
    const actor = requireWriteRole(req, res, ['ADMIN', 'MANAGER']);
    if (!actor) return;

    const v = finance.vouchers.find((x) => x.voucherNo === req.params.voucherNo);
    if (!v) return fail(res, 'Voucher not found.', 404);
    if (v.status !== 'Pending_Approval') {
      return fail(res, `Voucher is currently ${v.status}.`, 400);
    }
    if (v.createdBy === actor.userId) {
      return fail(res, 'Maker-Checker Enforcement: Voucher creator cannot self-approve.', 403);
    }
    if (v.totalDebit >= finance.whiteLabelSettings.makerCheckerThresholdInr && actor.role !== 'ADMIN') {
      return fail(res, 'Vouchers >= ₹5,000 require ADMIN approval.', 403);
    }

    v.status = 'Posted';
    v.approvedBy = actor.userId;
    v.postedAt = new Date().toISOString();
    finance.recomputeCounterBalances();
    finance.saveEncryptedSnapshotToDisk();
    return ok(res, v, `Voucher ${v.voucherNo} approved and posted to GL.`);
  });

  app.post('/api/finance/vouchers/:voucherNo/reverse', requireAuth, (req: AuthedRequest, res) => {
    const actor = requireWriteRole(req, res, ['ADMIN']);
    if (!actor) return;

    const orig = finance.vouchers.find((x) => x.voucherNo === req.params.voucherNo);
    if (!orig) return fail(res, 'Voucher not found.', 404);
    if (orig.status !== 'Posted') return fail(res, 'Only Posted vouchers can be reversed.', 400);
    if (orig.reversedVoucherNo) return fail(res, `Voucher already reversed by ${orig.reversedVoucherNo}.`, 400);

    const reason = sanitizeText(String(req.body?.reason || 'Audit correction reversal'));
    try {
      const reversal = finance.postSystemVoucher({
        entityCode: orig.entityCode,
        branchCode: orig.branchCode,
        costCenter: orig.costCenter,
        voucherDate: new Date().toISOString().slice(0, 10),
        voucherType: 'Reversal',
        referenceType: 'VOUCHER_REVERSAL',
        referenceId: orig.voucherNo,
        narration: `REVERSAL of ${orig.voucherNo}: ${reason}`,
        createdBy: actor.userId,
        approvedBy: actor.userId,
        lines: orig.lines.map((l) => ({
          accountCode: l.accountCode,
          partyType: l.partyType,
          partyId: l.partyId,
          costCenter: l.costCenter,
          debitAmount: l.creditAmount,
          creditAmount: l.debitAmount,
          description: `Contra reversal for ${orig.voucherNo}`,
        })),
      });
      reversal.reversalOfVoucherNo = orig.voucherNo;
      orig.status = 'Reversed';
      orig.reversedVoucherNo = reversal.voucherNo;
      finance.recomputeCounterBalances();
      finance.saveEncryptedSnapshotToDisk();
      return ok(res, { original: orig, reversal }, `Reversed ${orig.voucherNo} via ${reversal.voucherNo}.`);
    } catch (err) {
      return fail(res, err instanceof Error ? err.message : 'Reversal failed.', 422);
    }
  });

  // ==========================================================================
  // 4. PERIOD LOCKING & YEAR-END CARRY FORWARD (Mod 03, 17, 38, 72)
  // ==========================================================================
  app.post('/api/finance/periods/:periodCode/status', requireAuth, (req: AuthedRequest, res) => {
    const actor = requireWriteRole(req, res, ['ADMIN']);
    if (!actor) return;

    const period = finance.fiscalPeriods.find((p) => p.periodCode === req.params.periodCode);
    if (!period) return fail(res, 'Fiscal period not found.', 404);
    const { status, reason } = req.body ?? {};
    if (!['Open', 'Soft_Locked', 'Closed', 'Reopened'].includes(String(status))) {
      return fail(res, 'Invalid period status.', 422);
    }
    if ((status === 'Reopened' || status === 'Open') && (!reason || String(reason).trim().length < 5)) {
      return fail(res, 'Audit reason is mandatory to reopen a locked fiscal period.', 422);
    }

    const prev = period.status;
    period.status = status;
    period.lockReason = sanitizeText(String(reason || `Period marked ${status}`));
    period.lockedBy = actor.userId;
    period.lockedAt = new Date().toISOString();

    finance.securityStore.addAuditLog({
      actorUserId: actor.userId,
      action: 'FISCAL_PERIOD_STATUS_CHANGE',
      targetType: 'fiscal_period',
      targetId: period.periodCode,
      details: `Changed ${period.periodCode} from ${prev} -> ${status}. Reason: ${period.lockReason}`,
      ipAddress: req.socket?.remoteAddress || '127.0.0.1',
    });

    return ok(res, period, `Period ${period.periodCode} updated to ${status}.`);
  });

  // ==========================================================================
  // 5. MULTI-CASH COUNTERS, INTER-COUNTER TRANSFERS & PNB CSP ISOLATION (Mod 04, 81)
  // ==========================================================================
  app.post('/api/finance/cash-transfers', requireAuth, (req: AuthedRequest, res) => {
    const actor = requireWriteRole(req, res, ['ADMIN', 'MANAGER']);
    if (!actor) return;

    const { fromCounterCode, toTargetType, toTargetCode, amount, notes } = req.body ?? {};
    const amt = round2(Number(amount || 0));
    const fromCounter = finance.cashCounters.find((c) => c.counterCode === fromCounterCode);
    if (!fromCounter || fromCounter.isCspCounter) {
      return fail(res, 'Source must be an active non-CSP business cash counter.', 422);
    }
    if (amt <= 0 || amt > fromCounter.currentBalance) {
      return fail(res, `Invalid transfer amount. Available in ${fromCounter.counterCode}: ₹${fromCounter.currentBalance.toFixed(2)}.`, 422);
    }

    let creditAcc = fromCounter.coaAccountCode;
    let debitAcc = '1010';
    if (toTargetType === 'COUNTER' || toTargetType === 'PETTY_CASH') {
      const target = finance.cashCounters.find((c) => c.counterCode === toTargetCode);
      if (!target || target.isCspCounter) {
        return fail(res, 'Target business counter not found or blocked (CSP counter is isolated).', 422);
      }
      debitAcc = target.coaAccountCode;
    } else {
      const bank = finance.bankAccounts.find((b) => b.bankId === toTargetCode && !b.isCspSettlement);
      if (!bank) return fail(res, 'Valid non-CSP business bank account required.', 422);
      debitAcc = bank.coaAccountCode;
    }

    const v = finance.postSystemVoucher({
      entityCode: 'ENT-MAIN',
      costCenter: 'TREASURY',
      voucherDate: new Date().toISOString().slice(0, 10),
      voucherType: 'Contra',
      referenceType: 'CASH_TRANSFER',
      referenceId: `${fromCounterCode}->${toTargetCode}`,
      narration: `Cash Handover/Deposit: ${fromCounterCode} to ${toTargetCode} (${notes || 'Counter settlement'})`,
      createdBy: actor.userId,
      approvedBy: actor.userId,
      lines: [
        { accountCode: debitAcc, debitAmount: amt, creditAmount: 0, description: `Transfer in to ${toTargetCode}` },
        { accountCode: creditAcc, debitAmount: 0, creditAmount: amt, description: `Transfer out from ${fromCounterCode}` },
      ],
    });

    const record = {
      transferId: finance.nextCode('XFER'),
      fromCounterCode: fromCounter.counterCode,
      toTargetType: toTargetType as 'COUNTER' | 'BANK' | 'PETTY_CASH',
      toTargetCode: String(toTargetCode),
      amount: amt,
      voucherNo: v.voucherNo,
      transferDate: new Date().toISOString().slice(0, 10),
      initiatedBy: actor.userId,
      approvedBy: actor.userId,
      notes: sanitizeText(String(notes || '')),
    };
    finance.cashTransfers.unshift(record);
    finance.recomputeCounterBalances();
    finance.saveEncryptedSnapshotToDisk();
    return ok(res, record, `Contra transfer ${record.transferId} posted (${v.voucherNo}).`, 201);
  });

  app.post('/api/finance/pnb-csp', requireAuth, (req: AuthedRequest, res) => {
    const actor = requireWriteRole(req, res, ['ADMIN', 'MANAGER', 'STAFF']);
    if (!actor) return;

    const { txnType, customerRef, principalAmount, commissionIncome, remarks } = req.body ?? {};
    if (!customerRef || Number(principalAmount || 0) < 0 || Number(commissionIncome || 0) < 0) {
      return fail(res, 'Valid customer banking reference and non-negative amounts required.', 422);
    }

    const entry = finance.recordPnbCspEntry({
      txnDate: new Date().toISOString().slice(0, 10),
      txnType: txnType || 'Customer Deposit',
      customerRef: String(customerRef),
      principalAmount: Number(principalAmount || 0),
      commissionIncome: Number(commissionIncome || 0),
      recordedBy: actor.userId,
      remarks: String(remarks || 'PNB CSP counter transaction'),
    });
    finance.saveEncryptedSnapshotToDisk();
    return ok(res, entry, `Recorded segregated PNB CSP entry ${entry.cspTxnId}.`, 201);
  });

  // ==========================================================================
  // 6. BANKING, BRS RECONCILIATION & CHEQUES (Mod 08, 41, 76, 82)
  // ==========================================================================
  app.post('/api/finance/banking/statements', requireAuth, (req: AuthedRequest, res) => {
    const actor = requireWriteRole(req, res, ['ADMIN', 'MANAGER']);
    if (!actor) return;

    const { bankId, txnDate, utrOrRef, description, debitAmount, creditAmount } = req.body ?? {};
    const bank = finance.bankAccounts.find((b) => b.bankId === bankId);
    if (!bank) return fail(res, 'Bank account not found.', 404);
    const dr = round2(Number(debitAmount || 0));
    const cr = round2(Number(creditAmount || 0));
    if (dr === 0 && cr === 0) return fail(res, 'Debit or Credit amount must be > 0.', 422);

    const line = {
      lineId: finance.nextCode('STMT'),
      bankId: bank.bankId,
      txnDate: String(txnDate || new Date().toISOString().slice(0, 10)),
      utrOrRef: sanitizeText(String(utrOrRef || `UTR-${Date.now().toString().slice(-6)}`)),
      description: sanitizeText(String(description || 'Bank statement line')),
      debitAmount: dr,
      creditAmount: cr,
      matchStatus: 'Unmatched' as const,
      matchedVoucherNo: null,
    };
    finance.bankStatements.unshift(line);
    return ok(res, line, `Statement line ${line.lineId} added.`, 201);
  });

  app.post('/api/finance/banking/auto-reconcile', requireAuth, (req: AuthedRequest, res) => {
    const actor = requireWriteRole(req, res, ['ADMIN', 'MANAGER']);
    if (!actor) return;

    let matchedCount = 0;
    for (const line of finance.bankStatements) {
      if (line.matchStatus !== 'Unmatched') continue;
      const bank = finance.bankAccounts.find((b) => b.bankId === line.bankId);
      if (!bank || bank.isCspSettlement) continue;

      const candidate = finance.vouchers.find((v) => {
        if (v.status !== 'Posted') return false;
        const alreadyUsed = finance.bankStatements.some((s) => s.matchedVoucherNo === v.voucherNo);
        if (alreadyUsed) return false;
        return v.lines.some((l) => {
          if (l.accountCode !== bank.coaAccountCode) return false;
          if (line.creditAmount > 0 && Math.abs(l.debitAmount - line.creditAmount) < 1) return true;
          if (line.debitAmount > 0 && Math.abs(l.creditAmount - line.debitAmount) < 1) return true;
          return false;
        });
      });

      if (candidate) {
        line.matchStatus = 'Auto-Matched';
        line.matchedVoucherNo = candidate.voucherNo;
        matchedCount += 1;
      }
    }

    return ok(res, { matchedCount, bankStatements: finance.bankStatements }, `Auto-reconciled ${matchedCount} statement line(s).`);
  });

  app.post('/api/finance/banking/statements/:lineId/reconcile', requireAuth, (req: AuthedRequest, res) => {
    const actor = requireWriteRole(req, res, ['ADMIN', 'MANAGER']);
    if (!actor) return;

    const line = finance.bankStatements.find((l) => l.lineId === req.params.lineId);
    if (!line) return fail(res, 'Statement line not found.', 404);
    const { voucherNo } = req.body ?? {};
    if (voucherNo) {
      const v = finance.vouchers.find((x) => x.voucherNo === voucherNo);
      if (!v) return fail(res, 'Voucher not found.', 404);
      line.matchStatus = 'Manually Reconciled';
      line.matchedVoucherNo = v.voucherNo;
    } else {
      // Create balancing voucher for bank expense/fee if unmatched debit
      const bank = finance.bankAccounts.find((b) => b.bankId === line.bankId);
      if (!bank || bank.isCspSettlement) return fail(res, 'Cannot auto-post for isolated CSP bank.', 400);
      const amt = line.debitAmount > 0 ? line.debitAmount : line.creditAmount;
      const v = finance.postSystemVoucher({
        entityCode: 'ENT-MAIN',
        costCenter: 'GENERAL',
        voucherDate: line.txnDate,
        voucherType: line.debitAmount > 0 ? 'Expense' : 'Receipt',
        referenceType: 'BRS_ADJUSTMENT',
        referenceId: line.lineId,
        narration: `BRS Adjustment (${line.utrOrRef}): ${line.description}`,
        createdBy: actor.userId,
        approvedBy: actor.userId,
        lines:
          line.debitAmount > 0
            ? [
                { accountCode: '6020', debitAmount: amt, creditAmount: 0 },
                { accountCode: bank.coaAccountCode, debitAmount: 0, creditAmount: amt },
              ]
            : [
                { accountCode: bank.coaAccountCode, debitAmount: amt, creditAmount: 0 },
                { accountCode: '4130', debitAmount: 0, creditAmount: amt },
              ],
      });
      line.matchStatus = 'Manually Reconciled';
      line.matchedVoucherNo = v.voucherNo;
    }
    return ok(res, line, `Statement line ${line.lineId} reconciled.`);
  });

  // ==========================================================================
  // 7. AR CREDIT CONTROL & AP SUPPLIER BILLS (Mod 06, 07, 47, 48, 77)
  // ==========================================================================
  app.post('/api/finance/suppliers', requireAuth, (req: AuthedRequest, res) => {
    const actor = requireWriteRole(req, res, ['ADMIN', 'MANAGER']);
    if (!actor) return;
    const { name, gstin, pan, mobile, category, creditLimit, creditDays } = req.body ?? {};
    if (!name || !mobile) return fail(res, 'Supplier name and mobile are required.', 422);

    const sup = {
      supplierId: finance.nextCode('SUP'),
      name: sanitizeText(String(name)),
      gstin: sanitizeText(String(gstin || '')),
      pan: sanitizeText(String(pan || '')),
      mobile: sanitizeText(String(mobile)),
      category: sanitizeText(String(category || 'General Vendor')),
      creditLimit: Number(creditLimit || 50000),
      creditDays: Number(creditDays || 30),
      riskRating: 'Low' as const,
      status: 'active' as const,
    };
    finance.suppliers.unshift(sup);
    return ok(res, sup, `Supplier ${sup.name} registered.`, 201);
  });

  app.post('/api/finance/supplier-bills', requireAuth, (req: AuthedRequest, res) => {
    const actor = requireWriteRole(req, res, ['ADMIN', 'MANAGER']);
    if (!actor) return;
    const { supplierId, billDate, dueDate, expenseAccountCode, subtotal, gstAmount, tdsRatePct } = req.body ?? {};
    const sup = finance.suppliers.find((s) => s.supplierId === supplierId);
    if (!sup) return fail(res, 'Supplier not found.', 404);

    const sub = round2(Number(subtotal || 0));
    const gst = round2(Number(gstAmount || 0));
    const tds = round2(sub * (Number(tdsRatePct || 0) / 100));
    const netPayable = round2(sub + gst - tds);
    if (netPayable <= 0) return fail(res, 'Bill net payable must be positive.', 422);

    const expAcc = String(expenseAccountCode || '6030');
    const lines: JournalLineInput[] = [
      { accountCode: expAcc, partyType: 'SUPPLIER', partyId: sup.supplierId, debitAmount: sub, creditAmount: 0, description: `Purchase/Expense from ${sup.name}` },
    ];
    if (gst > 0) {
      lines.push({ accountCode: '1150', debitAmount: gst, creditAmount: 0, description: 'Input GST Credit' });
    }
    lines.push({ accountCode: '2001', partyType: 'SUPPLIER', partyId: sup.supplierId, debitAmount: 0, creditAmount: netPayable, description: `Payable to ${sup.name}` });
    if (tds > 0) {
      lines.push({ accountCode: '2120', debitAmount: 0, creditAmount: tds, description: 'TDS Deducted at Source' });
    }

    const v = finance.postSystemVoucher({
      entityCode: 'ENT-MAIN',
      costCenter: 'PROCUREMENT',
      voucherDate: String(billDate || new Date().toISOString().slice(0, 10)),
      voucherType: 'Purchase',
      referenceType: 'SUPPLIER_BILL',
      referenceId: sup.supplierId,
      narration: `Vendor Bill from ${sup.name} (Sub ₹${sub}, GST ₹${gst}, TDS ₹${tds})`,
      createdBy: actor.userId,
      approvedBy: actor.userId,
      lines,
    });

    const bill = {
      billNo: finance.nextCode('BILL'),
      supplierId: sup.supplierId,
      supplierName: sup.name,
      billDate: String(billDate || new Date().toISOString().slice(0, 10)),
      dueDate: String(dueDate || new Date().toISOString().slice(0, 10)),
      expenseOrAssetAccountCode: expAcc,
      subtotal: sub,
      gstAmount: gst,
      tdsSection: tds > 0 ? '194C/194J' : 'None',
      tdsDeducted: tds,
      netPayable,
      paidAmount: 0,
      voucherNo: v.voucherNo,
      status: 'Approved' as const,
    };
    finance.supplierBills.unshift(bill);
    if (gst > 0) {
      finance.taxEntries.unshift({
        taxEntryId: finance.nextCode('TAX'),
        entryDate: bill.billDate,
        returnType: 'GSTR-2B Input',
        partyName: sup.name,
        gstinOrPan: sup.gstin || sup.pan || 'UNREGISTERED',
        hsnOrSection: '9987',
        taxableValue: sub,
        cgst: round2(gst / 2),
        sgst: round2(gst / 2),
        igst: 0,
        tdsOrTcs: tds,
        voucherNo: v.voucherNo,
        filingStatus: 'Ready for Return',
      });
    }
    return ok(res, bill, `Supplier bill ${bill.billNo} recorded & posted (${v.voucherNo}).`, 201);
  });

  app.post('/api/finance/supplier-bills/:billNo/pay', requireAuth, (req: AuthedRequest, res) => {
    const actor = requireWriteRole(req, res, ['ADMIN', 'MANAGER']);
    if (!actor) return;
    const bill = finance.supplierBills.find((b) => b.billNo === req.params.billNo);
    if (!bill) return fail(res, 'Supplier bill not found.', 404);
    const remaining = round2(bill.netPayable - bill.paidAmount);
    const amt = round2(Number(req.body?.amount ?? remaining));
    if (amt <= 0 || amt > remaining) return fail(res, `Payment must be between ₹0.01 and ₹${remaining}.`, 422);

    const sourceAcc = req.body?.paymentMode === 'Cash' ? '1001' : '1010';
    const v = finance.postSystemVoucher({
      entityCode: 'ENT-MAIN',
      costCenter: 'PROCUREMENT',
      voucherDate: new Date().toISOString().slice(0, 10),
      voucherType: 'Payment',
      referenceType: 'SUPPLIER_PAYMENT',
      referenceId: bill.billNo,
      narration: `Vendor Payment for ${bill.billNo} (${bill.supplierName})`,
      createdBy: actor.userId,
      approvedBy: actor.userId,
      lines: [
        { accountCode: '2001', partyType: 'SUPPLIER', partyId: bill.supplierId, debitAmount: amt, creditAmount: 0 },
        { accountCode: sourceAcc, debitAmount: 0, creditAmount: amt },
      ],
    });
    bill.paidAmount = round2(bill.paidAmount + amt);
    bill.status = bill.paidAmount >= bill.netPayable - 0.01 ? 'Paid' : 'Partially Paid';
    finance.recomputeCounterBalances();
    return ok(res, { bill, voucher: v }, `Paid ₹${amt} against ${bill.billNo}.`);
  });

  // ==========================================================================
  // 8. EMPLOYEES & PAYROLL ENGINE (Replaces Placeholder + Mod 09)
  // ==========================================================================
  app.get('/api/v1/employees', requireAuth, (_req, res) => {
    return ok(res, { employees: finance.employees, payrollRuns: finance.payrollRuns });
  });

  app.post('/api/v1/employees', requireAuth, (req: AuthedRequest, res) => {
    const actor = requireWriteRole(req, res, ['ADMIN']);
    if (!actor) return;
    const { fullName, designation, department, mobile, basicSalary, hra, allowances, pfDeduction, tdsDeduction } = req.body ?? {};
    if (!fullName || !designation || Number(basicSalary || 0) <= 0) {
      return fail(res, 'Employee name, designation, and positive basic salary required.', 422);
    }
    const emp = {
      empId: finance.nextCode('EMP'),
      userId: null,
      fullName: sanitizeText(String(fullName)),
      designation: sanitizeText(String(designation)),
      department: sanitizeText(String(department || 'Operations')),
      mobile: sanitizeText(String(mobile || '')),
      joinedDate: new Date().toISOString().slice(0, 10),
      basicSalary: round2(Number(basicSalary)),
      hra: round2(Number(hra || 0)),
      allowances: round2(Number(allowances || 0)),
      pfDeduction: round2(Number(pfDeduction || 0)),
      tdsDeduction: round2(Number(tdsDeduction || 0)),
      advanceBalance: 0,
      status: 'Active' as const,
    };
    finance.employees.push(emp);
    return ok(res, emp, `Employee ${emp.fullName} added to Payroll Master.`, 201);
  });

  app.post('/api/finance/payroll/run', requireAuth, (req: AuthedRequest, res) => {
    const actor = requireWriteRole(req, res, ['ADMIN']);
    if (!actor) return;
    const monthCode = String(req.body?.monthCode || '2026-11');
    if (finance.payrollRuns.some((r) => r.monthCode === monthCode)) {
      return fail(res, `Payroll run for ${monthCode} already posted (duplicate payroll blocked).`, 400);
    }

    const activeEmps = finance.employees.filter((e) => e.status === 'Active');
    if (activeEmps.length === 0) return fail(res, 'No active employees.', 400);

    let grossTotal = 0;
    let totalDeductions = 0;
    let netPayableTotal = 0;
    const slips = activeEmps.map((e) => {
      const gross = round2(e.basicSalary + e.hra + e.allowances);
      const deductions = round2(e.pfDeduction + e.tdsDeduction);
      const netPay = round2(Math.max(0, gross - deductions));
      grossTotal = round2(grossTotal + gross);
      totalDeductions = round2(totalDeductions + deductions);
      netPayableTotal = round2(netPayableTotal + netPay);
      return { empId: e.empId, fullName: e.fullName, gross, deductions, netPay };
    });

    const lines: JournalLineInput[] = [
      { accountCode: '6010', debitAmount: grossTotal, creditAmount: 0, description: `Monthly Payroll Gross (${monthCode})` },
      { accountCode: '1010', debitAmount: 0, creditAmount: netPayableTotal, description: `Net Salary Bank Disbursement (${monthCode})` },
    ];
    if (totalDeductions > 0) {
      lines.push({ accountCode: '2120', debitAmount: 0, creditAmount: totalDeductions, description: `PF & TDS Statutory Payroll Deductions (${monthCode})` });
    }

    const v = finance.postSystemVoucher({
      idempotencyKey: `payroll-run:${monthCode}`,
      entityCode: 'ENT-MAIN',
      costCenter: 'HR_PAYROLL',
      voucherDate: new Date().toISOString().slice(0, 10),
      voucherType: 'Payroll',
      referenceType: 'PAYROLL_RUN',
      referenceId: monthCode,
      narration: `Payroll Run ${monthCode} for ${activeEmps.length} staff`,
      createdBy: actor.userId,
      approvedBy: actor.userId,
      lines,
    });

    const run = {
      runId: finance.nextCode('PAY'),
      monthCode,
      runDate: new Date().toISOString().slice(0, 10),
      employeeCount: activeEmps.length,
      grossTotal,
      totalDeductions,
      netPayableTotal,
      voucherNo: v.voucherNo,
      status: 'Paid' as const,
      processedBy: actor.userId,
      slips,
    };
    finance.payrollRuns.unshift(run);
    finance.saveEncryptedSnapshotToDisk();
    return ok(res, run, `Payroll ${run.runId} posted (${v.voucherNo}).`, 201);
  });

  // ==========================================================================
  // 9. PRODUCTS & FIFO/WAC INVENTORY COGS ENGINE (Replaces Placeholders + Mod 65, 78)
  // ==========================================================================
  app.get('/api/v1/products', requireAuth, (_req, res) => {
    const items = finance.products.map((p) => {
      const qtyOnHand = p.batches.reduce((s, b) => s + b.qtyRemaining, 0);
      const stockValue = round2(p.batches.reduce((s, b) => s + b.qtyRemaining * b.unitCost, 0));
      return {
        ...p,
        qtyOnHand,
        stockValue,
        avgUnitCost: qtyOnHand > 0 ? round2(stockValue / qtyOnHand) : 0,
        stockStatus: qtyOnHand === 0 ? 'out_of_stock' : qtyOnHand <= p.reorderLevel ? 'low_stock' : 'in_stock',
      };
    });
    return ok(res, { products: items, movements: finance.inventoryMovements });
  });

  app.get('/api/v1/inventory', requireAuth, (_req, res) => {
    const items = finance.products.map((p) => {
      const qtyOnHand = p.batches.reduce((s, b) => s + b.qtyRemaining, 0);
      const stockValue = round2(p.batches.reduce((s, b) => s + b.qtyRemaining * b.unitCost, 0));
      return {
        ...p,
        qtyOnHand,
        stockValue,
        avgUnitCost: qtyOnHand > 0 ? round2(stockValue / qtyOnHand) : 0,
        stockStatus: qtyOnHand === 0 ? 'out_of_stock' : qtyOnHand <= p.reorderLevel ? 'low_stock' : 'in_stock',
      };
    });
    return ok(res, { inventory: items, movements: finance.inventoryMovements });
  });

  app.post('/api/v1/products', requireAuth, (req: AuthedRequest, res) => {
    const actor = requireWriteRole(req, res, ['ADMIN', 'MANAGER']);
    if (!actor) return;

    const { sku, name, category, hsnSac, gstRatePct, valuationMethod, sellingPrice, initialQty, initialUnitCost } = req.body ?? {};
    const cleanSku = sanitizeText(String(sku || '').trim().toUpperCase());
    if (!cleanSku || !name || Number(sellingPrice || 0) <= 0) {
      return fail(res, 'SKU, product name, and positive selling price are required.', 422);
    }
    if (finance.products.some((p) => p.sku === cleanSku)) {
      return fail(res, `SKU ${cleanSku} already exists.`, 409);
    }

    const qty = Math.max(0, Math.floor(Number(initialQty || 0)));
    const cost = round2(Math.max(0, Number(initialUnitCost || 0)));
    const prod = {
      sku: cleanSku,
      name: sanitizeText(String(name)),
      category: sanitizeText(String(category || 'Hardware & Accessories')),
      hsnSac: sanitizeText(String(hsnSac || '8471')),
      gstRatePct: Number(gstRatePct ?? 18),
      valuationMethod: (valuationMethod === 'WAC' ? 'WAC' : 'FIFO') as 'FIFO' | 'WAC',
      sellingPrice: round2(Number(sellingPrice)),
      reorderLevel: 5,
      warehouseLocation: 'Main Store',
      batches: qty > 0 ? [{ batchId: finance.nextCode('BAT'), receivedDate: new Date().toISOString().slice(0, 10), qtyRemaining: qty, unitCost: cost }] : [],
      status: 'active' as const,
    };
    finance.products.unshift(prod);

    if (qty > 0 && cost > 0) {
      const invTotal = round2(qty * cost);
      const v = finance.postSystemVoucher({
        entityCode: 'ENT-MAIN',
        costCenter: 'POS_INVENTORY',
        voucherDate: new Date().toISOString().slice(0, 10),
        voucherType: 'Purchase',
        referenceType: 'INVENTORY_PURCHASE',
        referenceId: prod.sku,
        narration: `Initial Stock Receipt: ${qty} x ${prod.name} @ ₹${cost}`,
        createdBy: actor.userId,
        approvedBy: actor.userId,
        lines: [
          { accountCode: '1200', debitAmount: invTotal, creditAmount: 0, description: `Stock added (${prod.sku})` },
          { accountCode: '1010', debitAmount: 0, creditAmount: invTotal, description: `Paid for stock (${prod.sku})` },
        ],
      });
      finance.inventoryMovements.unshift({
        movementId: finance.nextCode('MOV'),
        sku: prod.sku,
        productName: prod.name,
        movementType: 'PURCHASE_IN',
        quantity: qty,
        unitCost: cost,
        cogsTotal: invTotal,
        saleTotal: 0,
        gstAmount: 0,
        voucherNo: v.voucherNo,
        actorUserId: actor.userId,
        recordedAt: new Date().toISOString(),
        notes: 'Initial catalog stock layer',
      });
    }

    return ok(res, prod, `Product ${prod.sku} created.`, 201);
  });

  app.post('/api/v1/inventory/purchase', requireAuth, (req: AuthedRequest, res) => {
    const actor = requireWriteRole(req, res, ['ADMIN', 'MANAGER']);
    if (!actor) return;
    const { sku, quantity, unitCost, paymentAccount } = req.body ?? {};
    const prod = finance.products.find((p) => p.sku === sku);
    if (!prod) return fail(res, 'Product SKU not found.', 404);
    const qty = Math.floor(Number(quantity || 0));
    const cost = round2(Number(unitCost || 0));
    if (qty <= 0 || cost <= 0) return fail(res, 'Quantity and unit cost must be positive.', 422);

    const totalCost = round2(qty * cost);
    const creditAcc = paymentAccount === '2001' ? '2001' : paymentAccount === '1001' ? '1001' : '1010';
    const v = finance.postSystemVoucher({
      entityCode: 'ENT-MAIN',
      costCenter: 'POS_INVENTORY',
      voucherDate: new Date().toISOString().slice(0, 10),
      voucherType: 'Purchase',
      referenceType: 'INVENTORY_PURCHASE',
      referenceId: prod.sku,
      narration: `Stock Purchase In: ${qty} x ${prod.name} @ ₹${cost} (${prod.valuationMethod})`,
      createdBy: actor.userId,
      approvedBy: actor.userId,
      lines: [
        { accountCode: '1200', debitAmount: totalCost, creditAmount: 0 },
        { accountCode: creditAcc, debitAmount: 0, creditAmount: totalCost },
      ],
    });
    prod.batches.push({
      batchId: finance.nextCode('BAT'),
      receivedDate: new Date().toISOString().slice(0, 10),
      qtyRemaining: qty,
      unitCost: cost,
    });
    const mov = {
      movementId: finance.nextCode('MOV'),
      sku: prod.sku,
      productName: prod.name,
      movementType: 'PURCHASE_IN' as const,
      quantity: qty,
      unitCost: cost,
      cogsTotal: totalCost,
      saleTotal: 0,
      gstAmount: 0,
      voucherNo: v.voucherNo,
      actorUserId: actor.userId,
      recordedAt: new Date().toISOString(),
      notes: 'Restock purchase batch',
    };
    finance.inventoryMovements.unshift(mov);
    return ok(res, mov, `Added ${qty} units to ${prod.sku}.`, 201);
  });

  app.post('/api/v1/inventory/pos-sale', requireAuth, (req: AuthedRequest, res) => {
    const actor = requireWriteRole(req, res, ['ADMIN', 'MANAGER', 'STAFF']);
    if (!actor) return;

    const { sku, quantity, customerName, paymentMethod } = req.body ?? {};
    const prod = finance.products.find((p) => p.sku === sku);
    if (!prod) return fail(res, 'Product SKU not found.', 404);
    const qty = Math.floor(Number(quantity || 0));

    try {
      const { cogsTotal, unitCogsAvg } = calculateInventorySaleCogs(prod, qty, true);
      const baseRevenue = round2(prod.sellingPrice * qty);
      const gstAmount = round2(baseRevenue * (prod.gstRatePct / 100));
      const grandTotal = round2(baseRevenue + gstAmount);
      const cashOrBankAcc = paymentMethod === 'Cash' ? '1001' : '1010';

      const lines: JournalLineInput[] = [
        { accountCode: cashOrBankAcc, debitAmount: grandTotal, creditAmount: 0, description: `POS Sale received (${paymentMethod || 'Cash'})` },
        { accountCode: '4010', debitAmount: 0, creditAmount: baseRevenue, description: `POS Hardware Sale: ${qty} x ${prod.name}` },
        { accountCode: '5001', debitAmount: cogsTotal, creditAmount: 0, description: `COGS (${prod.valuationMethod})` },
        { accountCode: '1200', debitAmount: 0, creditAmount: cogsTotal, description: `Inventory reduction (${prod.sku})` },
      ];
      if (gstAmount > 0) {
        lines.push({ accountCode: '2110', debitAmount: 0, creditAmount: gstAmount, description: `Output GST @ ${prod.gstRatePct}%` });
      }

      const v = finance.postSystemVoucher({
        entityCode: 'ENT-MAIN',
        costCenter: 'POS_INVENTORY',
        voucherDate: new Date().toISOString().slice(0, 10),
        voucherType: 'Sales',
        referenceType: 'POS_SALE',
        referenceId: prod.sku,
        narration: `POS Sale: ${qty} x ${prod.name} to ${customerName || 'Walk-in'} (COGS ${prod.valuationMethod} ₹${cogsTotal})`,
        createdBy: actor.userId,
        approvedBy: actor.userId,
        lines,
      });

      const mov = {
        movementId: finance.nextCode('MOV'),
        sku: prod.sku,
        productName: prod.name,
        movementType: 'POS_SALE_OUT' as const,
        quantity: qty,
        unitCost: unitCogsAvg,
        cogsTotal,
        saleTotal: baseRevenue,
        gstAmount,
        voucherNo: v.voucherNo,
        actorUserId: actor.userId,
        recordedAt: new Date().toISOString(),
        notes: `Sold via ${paymentMethod || 'Cash'} to ${customerName || 'Walk-in Customer'}`,
      };
      finance.inventoryMovements.unshift(mov);
      if (gstAmount > 0) {
        finance.taxEntries.unshift({
          taxEntryId: finance.nextCode('TAX'),
          entryDate: new Date().toISOString().slice(0, 10),
          returnType: 'GSTR-1 Outward',
          partyName: sanitizeText(String(customerName || 'Walk-in POS Customer')),
          gstinOrPan: 'UNREGISTERED-B2C',
          hsnOrSection: prod.hsnSac,
          taxableValue: baseRevenue,
          cgst: round2(gstAmount / 2),
          sgst: round2(gstAmount / 2),
          igst: 0,
          tdsOrTcs: 0,
          voucherNo: v.voucherNo,
          filingStatus: 'Ready for Return',
        });
      }
      finance.recomputeCounterBalances();
      finance.saveEncryptedSnapshotToDisk();
      return ok(res, { movement: mov, voucher: v }, `POS Sale completed (${v.voucherNo}).`, 201);
    } catch (err) {
      return fail(res, err instanceof Error ? err.message : 'POS Sale failed.', 422);
    }
  });

  // ==========================================================================
  // 10. FIXED ASSETS DEPRECIATION, LOANS/EMI, INVESTMENTS, EQUITY & FX (Mod 11, 26, 49, 50, 51, 79, 80, 88, 89)
  // ==========================================================================
  app.post('/api/finance/assets/run-depreciation', requireAuth, (req: AuthedRequest, res) => {
    const actor = requireWriteRole(req, res, ['ADMIN']);
    if (!actor) return;
    const months = Math.max(1, Math.min(12, Number(req.body?.months || 1)));
    let totalDep = 0;
    const details: string[] = [];

    for (const asset of finance.fixedAssets) {
      const dep = calculateAnnualOrMonthlyDepreciation(asset, months);
      if (dep > 0) {
        asset.accumulatedDepreciation = round2(asset.accumulatedDepreciation + dep);
        asset.lastDepreciatedDate = new Date().toISOString().slice(0, 10);
        totalDep = round2(totalDep + dep);
        details.push(`${asset.assetCode}: ₹${dep}`);
      }
    }
    if (totalDep <= 0) return fail(res, 'No depreciable asset balance remaining.', 400);

    const v = finance.postSystemVoucher({
      entityCode: 'ENT-MAIN',
      costCenter: 'GENERAL',
      voucherDate: new Date().toISOString().slice(0, 10),
      voucherType: 'Depreciation',
      referenceType: 'DEPRECIATION_BATCH',
      referenceId: `${months}M`,
      narration: `Depreciation Batch (${months} mo): ${details.join(', ')}`,
      createdBy: actor.userId,
      approvedBy: actor.userId,
      lines: [
        { accountCode: '6040', debitAmount: totalDep, creditAmount: 0 },
        { accountCode: '1590', debitAmount: 0, creditAmount: totalDep },
      ],
    });
    return ok(res, { totalDep, voucher: v, fixedAssets: finance.fixedAssets }, `Posted ₹${totalDep} depreciation (${v.voucherNo}).`, 201);
  });

  app.post('/api/finance/loans/:loanId/pay-emi', requireAuth, (req: AuthedRequest, res) => {
    const actor = requireWriteRole(req, res, ['ADMIN']);
    if (!actor) return;
    const loan = finance.loans.find((l) => l.loanId === req.params.loanId);
    if (!loan || loan.status !== 'Active') return fail(res, 'Active loan not found.', 404);

    const { interestPart, principalPart, closingPrincipal } = splitLoanEmi(
      loan.outstandingPrincipal,
      loan.annualRatePct,
      loan.emiAmount
    );
    const totalPaid = round2(principalPart + interestPart);

    const lines: JournalLineInput[] = [
      { accountCode: loan.coaLoanAccount, debitAmount: principalPart, creditAmount: 0, description: 'Loan Principal Repayment' },
      { accountCode: '1010', debitAmount: 0, creditAmount: totalPaid, description: `EMI Payment #${loan.emisPaid + 1}` },
    ];
    if (interestPart > 0) {
      lines.push({ accountCode: '6050', debitAmount: interestPart, creditAmount: 0, description: 'Loan Interest Expense' });
    }

    const v = finance.postSystemVoucher({
      entityCode: 'ENT-MAIN',
      costCenter: 'TREASURY',
      voucherDate: new Date().toISOString().slice(0, 10),
      voucherType: 'Payment',
      referenceType: 'LOAN_EMI',
      referenceId: `${loan.loanId}-EMI-${loan.emisPaid + 1}`,
      narration: `${loan.lenderName} EMI #${loan.emisPaid + 1}: Principal ₹${principalPart} + Interest ₹${interestPart}`,
      createdBy: actor.userId,
      approvedBy: actor.userId,
      lines,
    });

    loan.outstandingPrincipal = closingPrincipal;
    loan.emisPaid += 1;
    if (closingPrincipal <= 0.01) loan.status = 'Closed';
    return ok(res, { loan, principalPart, interestPart, voucher: v }, `EMI #${loan.emisPaid} posted (${v.voucherNo}).`, 201);
  });

  app.post('/api/finance/equity/transaction', requireAuth, (req: AuthedRequest, res) => {
    const actor = requireWriteRole(req, res, ['ADMIN']);
    if (!actor) return;
    const { partnerId, actionType, amount, notes } = req.body ?? {};
    const partner = finance.partners.find((p) => p.partnerId === partnerId);
    const amt = round2(Number(amount || 0));
    if (!partner || amt <= 0) return fail(res, 'Valid partner and positive amount required.', 422);

    const isInfusion = actionType === 'CAPITAL_INFUSION';
    const v = finance.postSystemVoucher({
      entityCode: 'ENT-MAIN',
      costCenter: 'EQUITY',
      voucherDate: new Date().toISOString().slice(0, 10),
      voucherType: 'Journal',
      referenceType: 'PARTNER_EQUITY',
      referenceId: partner.partnerId,
      narration: `${isInfusion ? 'Capital Infusion' : 'Owner Drawings'} by ${partner.partnerName}: ${notes || ''}`,
      createdBy: actor.userId,
      approvedBy: actor.userId,
      lines: isInfusion
        ? [
            { accountCode: '1010', debitAmount: amt, creditAmount: 0 },
            { accountCode: '3001', partyType: 'PARTNER', partyId: partner.partnerId, debitAmount: 0, creditAmount: amt },
          ]
        : [
            { accountCode: '3010', partyType: 'PARTNER', partyId: partner.partnerId, debitAmount: amt, creditAmount: 0 },
            { accountCode: '1010', debitAmount: 0, creditAmount: amt },
          ],
    });

    if (isInfusion) partner.capitalBalance = round2(partner.capitalBalance + amt);
    else partner.drawingsYtd = round2(partner.drawingsYtd + amt);
    return ok(res, { partner, voucher: v }, `Equity transaction posted (${v.voucherNo}).`, 201);
  });

  app.post('/api/finance/franchises/:franchiseCode/settle', requireAuth, (req: AuthedRequest, res) => {
    const actor = requireWriteRole(req, res, ['ADMIN']);
    if (!actor) return;
    const fr = finance.franchises.find((f) => f.franchiseCode === req.params.franchiseCode);
    if (!fr) return fail(res, 'Franchise not found.', 404);
    const amt = round2(Number(req.body?.amount ?? fr.royaltyPayableOrReceivable));
    if (amt <= 0) return fail(res, 'No royalty due to settle.', 400);

    const v = finance.postSystemVoucher({
      entityCode: 'ENT-MAIN',
      costCenter: 'FRANCHISE',
      voucherDate: new Date().toISOString().slice(0, 10),
      voucherType: 'Receipt',
      referenceType: 'FRANCHISE_ROYALTY',
      referenceId: fr.franchiseCode,
      narration: `Franchise Royalty Settlement from ${fr.partnerName} (${fr.royaltyPct}%)`,
      createdBy: actor.userId,
      approvedBy: actor.userId,
      lines: [
        { accountCode: '1010', partyType: 'FRANCHISE', partyId: fr.franchiseCode, debitAmount: amt, creditAmount: 0 },
        { accountCode: '4140', partyType: 'FRANCHISE', partyId: fr.franchiseCode, debitAmount: 0, creditAmount: amt },
      ],
    });
    fr.settledYtd = round2(fr.settledYtd + amt);
    fr.royaltyPayableOrReceivable = round2(Math.max(0, fr.royaltyPayableOrReceivable - amt));
    return ok(res, { franchise: fr, voucher: v }, `Franchise royalty ₹${amt} settled (${v.voucherNo}).`);
  });

  // ==========================================================================
  // 11. RECURRING ENGINE, IMPORT MIGRATION, VAULT/OCR, GOVERNANCE & TASKS
  // ==========================================================================
  app.post('/api/finance/recurring/:ruleId/execute', requireAuth, (req: AuthedRequest, res) => {
    const actor = requireWriteRole(req, res, ['ADMIN', 'MANAGER']);
    if (!actor) return;
    const rule = finance.recurringRules.find((r) => r.ruleId === req.params.ruleId);
    if (!rule) return fail(res, 'Recurring rule not found.', 404);

    const v = finance.postSystemVoucher({
      entityCode: 'ENT-MAIN',
      costCenter: rule.costCenter,
      voucherDate: new Date().toISOString().slice(0, 10),
      voucherType: rule.voucherType,
      referenceType: 'RECURRING_RULE',
      referenceId: rule.ruleId,
      narration: `Recurring Execution: ${rule.title}`,
      createdBy: actor.userId,
      approvedBy: actor.userId,
      lines: [
        { accountCode: rule.debitAccountCode, debitAmount: rule.amount, creditAmount: 0 },
        { accountCode: rule.creditAccountCode, debitAmount: 0, creditAmount: rule.amount },
      ],
    });
    rule.runCount += 1;
    rule.lastRunAt = new Date().toISOString();
    return ok(res, { rule, voucher: v }, `Executed recurring rule ${rule.ruleId} (${v.voucherNo}).`, 201);
  });

  app.post('/api/finance/import/dry-run-and-commit', requireAuth, (req: AuthedRequest, res) => {
    const actor = requireWriteRole(req, res, ['ADMIN']);
    if (!actor) return;
    const { importType, commit, rows } = req.body ?? {};
    if (!Array.isArray(rows) || rows.length === 0) {
      return fail(res, 'At least one row is required for migration validation.', 422);
    }

    let validRows = 0;
    let failedRows = 0;
    const importedVoucherNos: string[] = [];
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const drCode = String(r.debitAccountCode || '1001');
      const crCode = String(r.creditAccountCode || '4001');
      const amt = round2(Number(r.amount || 0));
      const hasDr = finance.chartOfAccounts.some((a) => a.accountCode === drCode && !a.isGroup);
      const hasCr = finance.chartOfAccounts.some((a) => a.accountCode === crCode && !a.isGroup);
      if (!hasDr || !hasCr || amt <= 0) {
        failedRows += 1;
        errors.push(`Row ${i + 1}: Invalid accounts (${drCode}/${crCode}) or non-positive amount.`);
      } else {
        validRows += 1;
        if (commit && failedRows === 0) {
          const v = finance.postSystemVoucher({
            entityCode: 'ENT-MAIN',
            costCenter: 'MIGRATION',
            voucherDate: String(r.date || new Date().toISOString().slice(0, 10)),
            voucherType: 'Journal',
            referenceType: 'IMPORT_MIGRATION',
            referenceId: String(importType || 'Opening Balances'),
            narration: sanitizeText(String(r.narration || 'Imported Migration Row')),
            createdBy: actor.userId,
            approvedBy: actor.userId,
            lines: [
              { accountCode: drCode, debitAmount: amt, creditAmount: 0 },
              { accountCode: crCode, debitAmount: 0, creditAmount: amt },
            ],
          });
          importedVoucherNos.push(v.voucherNo);
        }
      }
    }

    const batch = {
      batchId: finance.nextCode('IMP'),
      importType: importType || 'Opening Balances',
      totalRows: rows.length,
      validRows,
      failedRows,
      status: (commit && failedRows === 0 ? 'Committed' : 'Dry-Run Validated') as 'Dry-Run Validated' | 'Committed',
      importedVoucherNos,
      createdBy: actor.userId,
      createdAt: new Date().toISOString(),
    };
    finance.importBatches.unshift(batch);
    return ok(res, { batch, errors }, commit ? `Migration batch ${batch.batchId} committed.` : `Dry-run validated ${validRows}/${rows.length} rows.`);
  });

  app.post('/api/finance/import/:batchId/rollback', requireAuth, (req: AuthedRequest, res) => {
    const actor = requireWriteRole(req, res, ['ADMIN']);
    if (!actor) return;
    const batch = finance.importBatches.find((b) => b.batchId === req.params.batchId);
    if (!batch || batch.status !== 'Committed') {
      return fail(res, 'Committed migration batch not found.', 404);
    }
    for (const vNo of batch.importedVoucherNos) {
      const orig = finance.vouchers.find((v) => v.voucherNo === vNo);
      if (orig && orig.status === 'Posted') {
        const rev = finance.postSystemVoucher({
          entityCode: orig.entityCode,
          voucherDate: new Date().toISOString().slice(0, 10),
          voucherType: 'Reversal',
          narration: `Migration Batch ${batch.batchId} Rollback of ${orig.voucherNo}`,
          createdBy: actor.userId,
          approvedBy: actor.userId,
          lines: orig.lines.map((l) => ({ accountCode: l.accountCode, debitAmount: l.creditAmount, creditAmount: l.debitAmount })),
        });
        orig.status = 'Reversed';
        orig.reversedVoucherNo = rev.voucherNo;
      }
    }
    batch.status = 'Rolled Back';
    return ok(res, batch, `Migration batch ${batch.batchId} rolled back via contra reversals.`);
  });

  app.post('/api/finance/vault/ocr-intake', requireAuth, (req: AuthedRequest, res) => {
    const actor = requireWriteRole(req, res, ['ADMIN', 'MANAGER', 'STAFF']);
    if (!actor) return;
    const { title, extractedVendor, extractedAmount, legalHold } = req.body ?? {};
    if (!title) return fail(res, 'Document title is required.', 422);

    const item = {
      vaultId: finance.nextCode('VLT'),
      title: sanitizeText(String(title)),
      docCategory: 'OCR Scan' as const,
      linkedVoucherNo: null,
      ocrExtractedVendor: sanitizeText(String(extractedVendor || 'Manual Verification Required')),
      ocrExtractedAmount: round2(Number(extractedAmount || 0)),
      ocrConfidencePct: extractedVendor && Number(extractedAmount) > 0 ? 92 : 0,
      humanVerified: false, // Mandatory human review per truthfulness rules!
      legalHold: Boolean(legalHold),
      retentionUntil: '2034-03-31',
      uploadedBy: actor.userId,
      createdAt: new Date().toISOString(),
    };
    finance.documentVault.unshift(item);
    return ok(res, item, `Document ${item.vaultId} stored in Archive (awaiting human verification before posting).`, 201);
  });

  app.post('/api/finance/vault/:vaultId/verify-and-post', requireAuth, (req: AuthedRequest, res) => {
    const actor = requireWriteRole(req, res, ['ADMIN', 'MANAGER']);
    if (!actor) return;
    const doc = finance.documentVault.find((d) => d.vaultId === req.params.vaultId);
    if (!doc) return fail(res, 'Vault document not found.', 404);
    const amt = round2(Number(req.body?.amount ?? doc.ocrExtractedAmount ?? 0));
    if (amt <= 0) return fail(res, 'Verified amount must be positive.', 422);

    const v = finance.postSystemVoucher({
      entityCode: 'ENT-MAIN',
      costCenter: 'GENERAL',
      voucherDate: new Date().toISOString().slice(0, 10),
      voucherType: 'Expense',
      referenceType: 'OCR_VERIFIED_DOC',
      referenceId: doc.vaultId,
      narration: `Human-Verified OCR Voucher (${doc.ocrExtractedVendor || doc.title})`,
      createdBy: actor.userId,
      approvedBy: actor.userId,
      lines: [
        { accountCode: String(req.body?.expenseAccountCode || '6030'), debitAmount: amt, creditAmount: 0 },
        { accountCode: '1010', debitAmount: 0, creditAmount: amt },
      ],
    });
    doc.humanVerified = true;
    doc.linkedVoucherNo = v.voucherNo;
    return ok(res, { doc, voucher: v }, `Document ${doc.vaultId} verified & posted (${v.voucherNo}).`);
  });

  app.post('/api/finance/tasks', requireAuth, (req: AuthedRequest, res) => {
    const actor = requireWriteRole(req, res, ['ADMIN', 'MANAGER', 'STAFF']);
    if (!actor) return;
    const { title, category, dueDate, priority } = req.body ?? {};
    if (!title) return fail(res, 'Task title is required.', 422);
    const task = {
      taskId: finance.nextCode('TSK'),
      title: sanitizeText(String(title)),
      category: category || 'Audit',
      dueDate: String(dueDate || new Date().toISOString().slice(0, 10)),
      assignedTo: actor.userId,
      priority: priority || 'Normal',
      status: 'Pending' as const,
    };
    finance.tasks.unshift(task);
    return ok(res, task, `Task ${task.taskId} created.`, 201);
  });

  app.patch('/api/finance/tasks/:taskId', requireAuth, (req: AuthedRequest, res) => {
    const actor = requireWriteRole(req, res, ['ADMIN', 'MANAGER', 'STAFF']);
    if (!actor) return;
    const task = finance.tasks.find((t) => t.taskId === req.params.taskId);
    if (!task) return fail(res, 'Task not found.', 404);
    if (req.body?.status) task.status = req.body.status;
    return ok(res, task, `Task ${task.taskId} updated.`);
  });

  app.post('/api/finance/fraud-alerts/:alertId/resolve', requireAuth, (req: AuthedRequest, res) => {
    const actor = requireWriteRole(req, res, ['ADMIN']);
    if (!actor) return;
    const alert = finance.fraudAlerts.find((a) => a.alertId === req.params.alertId);
    if (!alert) return fail(res, 'Alert not found.', 404);
    alert.status = req.body?.status === 'False Positive' ? 'False Positive' : 'Resolved';
    alert.resolvedBy = actor.userId;
    return ok(res, alert, `Alert ${alert.alertId} marked ${alert.status}.`);
  });

  // ==========================================================================
  // 12. CUSTOMER SELF-SERVICE SCOPED PORTAL (Mod 58 - Strict Own-Record Isolation)
  // ==========================================================================
  app.post('/api/finance/customer-portal/lookup', requireAuth, (req: AuthedRequest, res) => {
    const { customerId, mobileLast4 } = req.body ?? {};
    const cust = finance.erpStore.customers.find(
      (c) =>
        c.customerId.toUpperCase() === String(customerId || '').trim().toUpperCase() &&
        c.mobile.endsWith(String(mobileLast4 || '').trim())
    );
    if (!cust) {
      return fail(res, 'Customer ID and mobile last-4 verification did not match.', 404);
    }

    const apps = finance.erpStore.applications
      .filter((a) => a.customerId === cust.customerId && !a.archivedAt)
      .map((a) => {
        const payments = finance.erpStore.payments.filter((p) => p.applicationNo === a.applicationNo);
        const paid = payments
          .filter((p) => p.verificationStatus === 'Confirmed')
          .reduce((s, p) => s + p.amount, 0);
        return {
          applicationNo: a.applicationNo,
          serviceName: a.serviceSnapshot.name,
          status: a.status,
          fee: a.serviceSnapshot.customerChargeSnapshot,
          paid,
          balanceDue: Math.max(0, a.serviceSnapshot.customerChargeSnapshot - paid),
          receipts: payments.map((p) => ({
            receiptNo: p.receiptNo,
            amount: p.amount,
            method: p.paymentMethod,
            status: p.verificationStatus,
            recordedAt: p.recordedAt,
          })),
        };
      });

    return ok(res, {
      customerId: cust.customerId,
      fullName: cust.fullName,
      maskedMobile: `******${cust.mobile.slice(-4)}`,
      applications: apps,
      totalBalanceDue: round2(apps.reduce((s, a) => s + a.balanceDue, 0)),
      gatewayReady: false,
      gatewayNote: 'Online payment gateway keys are not configured; settlements are collected at counter cash/UPI QR.',
    });
  });

  // ==========================================================================
  // 13. AI FINANCIAL ASSISTANT (Mod 63 - Read-Only Server-Side @google/genai)
  // ==========================================================================
  app.post('/api/finance/ai-assistant', requireAuth, async (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    const question = sanitizeText(String(req.body?.question || '').trim());
    if (!question) return fail(res, 'Enter a financial question.', 422);

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      return ok(res, {
        configured: false,
        readOnly: true,
        provider: 'Not Configured',
        answer:
          'Read-Only AI Assistant is disabled because GEMINI_API_KEY is not configured in server environment variables. Live Financial Statements and KPIs remain fully functional without AI.',
      });
    }

    const statements = computeFinancialStatements({
      accounts: finance.chartOfAccounts,
      vouchers: finance.vouchers,
      entityCode: 'ENT-MAIN',
    });
    const context = {
      company: finance.phase03Store.companyProfile.companyName,
      totalIncome: statements.profitAndLoss.totalIncome,
      totalCogs: statements.profitAndLoss.totalCogs,
      totalExpenses: statements.profitAndLoss.totalExpenses,
      netProfit: statements.profitAndLoss.netProfit,
      totalAssets: statements.balanceSheet.totalAssets,
      totalLiabilities: statements.balanceSheet.totalLiabilities,
      closingCashAndBank: statements.cashFlowStatement.closingCashAndBank,
      pnbCspCommissionRecognized: finance.pnbCspLedger.reduce((s, e) => s + e.commissionIncome, 0),
    };

    try {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `You are a read-only financial analyst for MUN COMPUTER. Answer strictly from this verified ledger snapshot (never invent figures or alter data): ${JSON.stringify(context)}. Question: ${question}`,
        config: {
          httpOptions: {
            headers: { 'User-Agent': 'aistudio-build' },
          },
        },
      });
      const answer = response.text || 'No response generated.';
      finance.aiQueryHistory.unshift({
        id: finance.nextCode('AIQ'),
        query: question,
        provider: 'Gemini Read-Only Analyst',
        answer,
        askedBy: actor.userId,
        at: new Date().toISOString(),
      });
      return ok(res, { configured: true, readOnly: true, provider: 'Gemini (@google/genai)', answer });
    } catch (err) {
      return ok(res, {
        configured: true,
        readOnly: true,
        provider: 'Provider Call Failed',
        answer: `AI provider request failed safely without altering ledger data: ${err instanceof Error ? err.message : 'Unknown error'}`,
      });
    }
  });

  // ==========================================================================
  // 14. SYSTEM TESTING, QA & PRODUCTION AUDIT CERTIFICATE (Mod 33, 34, 94)
  // ==========================================================================
  app.post('/api/finance/audit/run-verification', requireAuth, (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    const cert = finance.runSelfAuditVerification(actor.userId);
    finance.securityStore.addAuditLog({
      actorUserId: actor.userId,
      action: 'RUN_FINANCIAL_AUDIT_VERIFICATION',
      targetType: 'audit_certificate',
      targetId: cert.certificateNo,
      details: `Executed ${cert.totalChecks} live integrity checks (${cert.checksPassed}/${cert.totalChecks} passed) -> ${cert.overallVerdict}.`,
      ipAddress: req.socket?.remoteAddress || '127.0.0.1',
    });
    return ok(res, cert, `Audit Verification ${cert.certificateNo}: ${cert.overallVerdict}`);
  });
}
