import 'dotenv/config';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApp } from '../server/app.js';
import { SecurityStore } from '../server/securityStore.js';

declare global {
  var __munStore: SecurityStore | undefined;
  var __munApp: ReturnType<typeof createApp> | undefined;
}

function getServerlessApp() {
  if (!globalThis.__munStore) {
    globalThis.__munStore = new SecurityStore();
  }
  if (!globalThis.__munApp) {
    globalThis.__munApp = createApp(globalThis.__munStore, {
      enableRateLimit: true,
      enableReportScheduler: false,
      enableBackupScheduler: false,
    });
  }
  return globalThis.__munApp;
}

function normalizeVercelApiUrl(req: IncomingMessage): void {
  const rawUrl = req.url || '/api';
  const [rawPath, rawQuery] = rawUrl.split('?');

  if (rawPath === '/api/index' || rawPath === '/api/index.ts') {
    const fwdHeader =
      (req.headers['x-vercel-forwarded-url'] as string | undefined) ||
      (req.headers['x-forwarded-uri'] as string | undefined) ||
      (req.headers['x-rewrite-url'] as string | undefined) ||
      '';
    if (fwdHeader && !fwdHeader.startsWith('/api/index')) {
      try {
        const parsed = new URL(fwdHeader, 'https://app.muncomputer.org');
        req.url = `${parsed.pathname}${parsed.search}`;
        return;
      } catch {
        // Fall through
      }
    }
  }

  if (rawPath !== '/api' && !rawPath.startsWith('/api/')) {
    const normalizedPath = rawPath.startsWith('/') ? `/api${rawPath}` : `/api/${rawPath}`;
    req.url = rawQuery ? `${normalizedPath}?${rawQuery}` : normalizedPath;
  }
}

export default function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    normalizeVercelApiUrl(req);
    const app = getServerlessApp();
    return app(req as never, res as never);
  } catch (err) {
    console.error('[Vercel API Fatal Error]', err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(
        JSON.stringify({
          success: false,
          message:
            err instanceof Error && err.message
              ? `Server initialization error: ${err.message}`
              : 'Internal authentication API error.',
          data: null,
          meta: { timestamp: new Date().toISOString() },
        })
      );
    }
  }
}
