export function formatINR(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safe);
}

export function formatDateIST(input: string | Date | null | undefined): string {
  if (!input) return '—';
  // If already DD/MM/YYYY
  if (typeof input === 'string' && /^\d{2}\/\d{2}\/\d{4}$/.test(input.trim())) {
    return input.trim();
  }
  const date = typeof input === 'string' ? new Date(input) : input;
  if (Number.isNaN(date.getTime())) return String(input);

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(date);

  const d = parts.find((p) => p.type === 'day')?.value ?? '01';
  const m = parts.find((p) => p.type === 'month')?.value ?? '01';
  const y = parts.find((p) => p.type === 'year')?.value ?? '2026';
  return `${d}/${m}/${y}`;
}

export function formatDateTimeIST(input: string | Date | null | undefined): string {
  if (!input) return '—';
  const date = typeof input === 'string' ? new Date(input) : input;
  if (Number.isNaN(date.getTime())) return String(input);

  const dateStr = formatDateIST(date);
  const timeStr = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);

  return `${dateStr} ${timeStr} IST`;
}
