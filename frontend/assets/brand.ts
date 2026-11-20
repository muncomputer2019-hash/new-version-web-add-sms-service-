function readCompileGlobal(getter: () => string, fallback: string): string {
  try {
    const val = getter();
    return val || fallback;
  } catch {
    return fallback;
  }
}

function formatBuildTimestamp(iso: string): string {
  const targetIso = iso || new Date().toISOString();
  const parsed = new Date(targetIso);
  if (Number.isNaN(parsed.getTime())) return targetIso;
  return `${parsed.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  })} IST`;
}

const APP_VERSION = readCompileGlobal(() => __APP_VERSION__, '1.1.0');
const APP_BASE_VERSION = readCompileGlobal(() => __APP_BASE_VERSION__, APP_VERSION);
const APP_BUILD_ID = readCompileGlobal(() => __APP_BUILD_ID__, 'dev');
const APP_BUILT_AT = readCompileGlobal(() => __APP_BUILT_AT__, '');

export const BRAND = {
  name: 'MUN COMPUTER',
  shortName: 'MUN',
  tagline: 'Business Management Suite',
  version: APP_VERSION,
  baseVersion: APP_BASE_VERSION,
  buildId: APP_BUILD_ID,
  builtAt: APP_BUILT_AT,
  builtAtLabel: formatBuildTimestamp(APP_BUILT_AT),
  copyright: '© 2026 MUN COMPUTER.',
  logoPath: '/assets/aistudio/MUN_Computer_Orbit_Logo_11zon_1fce5a24.jpg',
  phase: 'Phase 09 · Enterprise Security, ERP & Cloud Release',
  supportEmail: 'muncomputer2019@gmail.com',
  websiteUrl: 'https://www.muncomputer.org',
  appUrl: 'https://app.muncomputer.org',
} as const;
