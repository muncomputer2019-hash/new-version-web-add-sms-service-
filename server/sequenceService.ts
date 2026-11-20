import { RoleName } from './types';

export interface SequenceConfig {
  companyPrefix: string;
  serialPadding: number;
}

const DEFAULT_CONFIG: SequenceConfig = {
  companyPrefix: 'MC',
  serialPadding: 4,
};

export interface IdGenerationRecord {
  id: number;
  userId: string;
  role: RoleName;
  fyCode: string;
  monthCode: string;
  serial: number;
  generatedBy: string;
  departmentCode?: string;
  immutable: true;
  generatedAt: string;
}

export interface SequenceAllocateOptions {
  actorUserId?: string;
  departmentCode?: string;
}

/**
 * Resolve Indian Financial Year (April - March) 4-digit code YYFF.
 * Examples:
 *   Nov 2026 (month 11) -> FY 2026-27 -> "2627"
 *   Feb 2027 (month 2)  -> FY 2026-27 -> "2627"
 *   Apr 2027 (month 4)  -> FY 2027-28 -> "2728"
 */
export function resolveFinancialYearCode(year: number, month: number): string {
  const startYear = month >= 4 ? year : year - 1;
  const yy1 = String(startYear).slice(-2);
  const yy2 = String(startYear + 1).slice(-2);
  return `${yy1}${yy2}`;
}

function getIstYearMonth(date = new Date()): { year: number; month: number } {
  const ist = new Date(date.getTime() + 330 * 60_000);
  return {
    year: ist.getUTCFullYear(),
    month: ist.getUTCMonth() + 1,
  };
}

/**
 * Transaction-Safe Automatic User ID Sequence Generator (Phase 02 Final Master)
 *
 * Canonical Format:
 *   MC + YYFF + MM + SSSS
 *   NO hyphen, NO space, NO separator.
 *
 * Examples (Nov 2026, FY 2026-27):
 *   MC2627110001
 *   MC2627110002
 *   MC2627110003
 */
export class UserIdSequenceService {
  private sequences = new Map<string, number>();
  private issuedIds = new Set<string>();
  public readonly idGenerationHistory: IdGenerationRecord[] = [];
  private lockQueue: Promise<void> = Promise.resolve();
  private nextHistId = 1;

  constructor(private readonly config: SequenceConfig = DEFAULT_CONFIG) {}

  public getPrefixPreview(
    _role?: RoleName,
    year?: number,
    month?: number
  ): string {
    const ist = getIstYearMonth();
    const targetYear = year ?? ist.year;
    const targetMonth = month ?? ist.month;
    const fyCode = resolveFinancialYearCode(targetYear, targetMonth);
    const mm = String(targetMonth).padStart(2, '0');
    return `${this.config.companyPrefix}${fyCode}${mm}`;
  }

  public seedExisting(
    userId: string,
    _role: RoleName,
    _year: number,
    _serial: number,
    _month?: number
  ): void {
    const normalized = userId.trim().toUpperCase();
    this.issuedIds.add(normalized);

    const match = /^MC(\d{4})(\d{2})(\d{4})$/.exec(normalized);
    if (match) {
      const [, fyCode, mm, serialStr] = match;
      const key = `${fyCode}:${mm}`;
      const serial = Number(serialStr);
      const current = this.sequences.get(key) ?? 0;
      if (serial > current) {
        this.sequences.set(key, serial);
      }
    }
  }

  public hasIssued(userId: string): boolean {
    return this.issuedIds.has(userId.trim().toUpperCase());
  }

  public getGenerationHistory(): IdGenerationRecord[] {
    return this.idGenerationHistory;
  }

  /**
   * Serializes allocation inside an atomic mutex lock to prevent duplicate IDs under concurrency.
   * Supports automatic Indian Financial Year (Apr-Mar) rollover.
   */
  public async allocateNext(
    role: RoleName,
    year?: number,
    month?: number,
    options?: SequenceAllocateOptions
  ): Promise<string> {
    let release!: () => void;
    const prev = this.lockQueue;
    this.lockQueue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await prev;

    try {
      const ist = getIstYearMonth();
      const targetYear = year ?? ist.year;
      const targetMonth = month ?? ist.month;
      const fyCode = resolveFinancialYearCode(targetYear, targetMonth);
      const monthCode = String(targetMonth).padStart(2, '0');
      const key = `${fyCode}:${monthCode}`;

      let nextSerial = (this.sequences.get(key) ?? 0) + 1;
      let candidate = this.formatId(fyCode, monthCode, nextSerial);

      // Unique guarantee: never reuse an already-issued User ID
      while (this.issuedIds.has(candidate)) {
        nextSerial += 1;
        candidate = this.formatId(fyCode, monthCode, nextSerial);
      }

      this.sequences.set(key, nextSerial);
      this.issuedIds.add(candidate);

      this.idGenerationHistory.unshift({
        id: this.nextHistId++,
        userId: candidate,
        role,
        fyCode,
        monthCode,
        serial: nextSerial,
        generatedBy: options?.actorUserId ?? 'SYSTEM',
        departmentCode: options?.departmentCode,
        immutable: true,
        generatedAt: new Date().toISOString(),
      });

      return candidate;
    } finally {
      release();
    }
  }

  private formatId(fyCode: string, monthCode: string, serial: number): string {
    const padded = String(serial).padStart(this.config.serialPadding, '0');
    return `${this.config.companyPrefix}${fyCode}${monthCode}${padded}`;
  }
}
