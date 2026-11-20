import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApp } from '../server/app';
import { SecurityStore } from '../server/securityStore';

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

export default function handler(req: IncomingMessage, res: ServerResponse) {
  const app = getServerlessApp();
  return app(req as never, res as never);
}
