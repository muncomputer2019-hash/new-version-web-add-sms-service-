import { ApiResponseEnvelope, PaginationMeta } from '../modules/types';

export const API_CONFIG = {
  baseUrl: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1',
  timeoutMs: Number(import.meta.env.VITE_API_TIMEOUT_MS || 15000),
  mode: 'DEMO_MODE' as const,
};

export interface PaginatedResult<T> {
  items: T[];
  pagination: PaginationMeta;
}

export function paginateArray<T>(items: T[], page: number, perPage: number): PaginatedResult<T> {
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / perPage));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const startIndex = (safePage - 1) * perPage;
  return {
    items: items.slice(startIndex, startIndex + perPage),
    pagination: {
      page: safePage,
      perPage,
      totalItems,
      totalPages,
    },
  };
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
}

/**
 * PHP/MySQL API client skeleton ready for Phase 02 integration.
 * Currently operates in frontend Demo Mode; does not persist to a remote database.
 */
export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponseEnvelope<T>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_CONFIG.timeoutMs);

  try {
    const token = sessionStorage.getItem('mun_auth_token');
    const response = await fetch(`${API_CONFIG.baseUrl}${endpoint}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });

    const payload = (await response.json()) as ApiResponseEnvelope<T>;
    if (!response.ok) {
      throw new Error(payload.message || `API Error (${response.status})`);
    }
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}
