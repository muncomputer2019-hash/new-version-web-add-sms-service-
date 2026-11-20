import React from 'react';
import { ArrowLeft, Database, Server } from 'lucide-react';
import { NavItemConfig } from '../modules/navigation';
import { PageKey } from '../modules/types';
import { Button } from '../components/Button';

interface ModulePlaceholderPageProps {
  moduleConfig: NavItemConfig;
  onNavigate: (page: PageKey) => void;
}

export const ModulePlaceholderPage: React.FC<ModulePlaceholderPageProps> = ({
  moduleConfig,
  onNavigate,
}) => {
  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
            {moduleConfig.group} · {moduleConfig.phaseStatus}
          </div>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-neutral-950 dark:text-white">
            {moduleConfig.label}
          </h2>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">{moduleConfig.description}</p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => onNavigate('dashboard')}
          icon={<ArrowLeft className="h-3.5 w-3.5" />}
        >
          Back to Dashboard
        </Button>
      </div>

      <div className="bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-6">
        <h3 className="text-sm font-semibold text-neutral-950 dark:text-white">
          Module Blueprint Notice
        </h3>
        <p className="mt-1.5 text-sm text-neutral-600 dark:text-neutral-300 leading-relaxed">
          Per the system architecture blueprint, operational and ledger tables below are mapped for PHP/MySQL integration while Master Settings, Security, and User Access Control run on the live Express API.
        </p>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-md p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-neutral-900 dark:text-white">
              <Database className="h-4 w-4 text-blue-800 dark:text-blue-400" />
              <span>Mapped MySQL Tables</span>
            </div>
            <ul className="mt-3 space-y-1.5">
              {moduleConfig.mysqlTables.map((tbl) => (
                <li
                  key={tbl}
                  className="text-xs font-mono text-neutral-700 dark:text-neutral-300 py-1 border-b border-neutral-100 dark:border-neutral-800 last:border-b-0"
                >
                  {tbl}
                </li>
              ))}
            </ul>
          </div>

          <div className="bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-md p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-neutral-900 dark:text-white">
              <Server className="h-4 w-4 text-neutral-700 dark:text-neutral-300" />
              <span>Mapped PHP REST Endpoints</span>
            </div>
            <ul className="mt-3 space-y-1.5">
              {moduleConfig.apiEndpoints.map((ep) => (
                <li
                  key={ep}
                  className="text-xs font-mono text-neutral-700 dark:text-neutral-300 py-1 border-b border-neutral-100 dark:border-neutral-800 last:border-b-0"
                >
                  {ep}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
