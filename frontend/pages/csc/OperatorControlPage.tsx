import React, { useCallback, useEffect, useState } from 'react';
import { KeyRound, RefreshCw, ShieldCheck, UserPlus } from 'lucide-react';
import { OPERATOR_PERMISSION_DEFS } from '../../../shared/cscTypes';
import { Button } from '../../components/Button';
import { UserProfile } from '../../modules/types';
import { CscOperatorSummary, cscApi } from '../../services/cscApi';

interface OperatorControlPageProps {
  currentUser: UserProfile;
  onShowToast: (type: 'success' | 'error' | 'info', title: string, description?: string) => void;
}

export const OperatorControlPage: React.FC<OperatorControlPageProps> = ({
  currentUser,
  onShowToast,
}) => {
  const [operators, setOperators] = useState<CscOperatorSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  // Quick Customer Portal Account Provisioning
  const [portalCustomerId, setPortalCustomerId] = useState('');
  const [portalPassword, setPortalPassword] = useState('Customer@2026!');

  const isAdmin = currentUser.role === 'ADMIN';

  const loadOperators = useCallback(async () => {
    setLoading(true);
    try {
      const res = await cscApi.getOperators();
      setOperators(res.data);
    } catch (err) {
      onShowToast('error', 'Failed to load operators', err instanceof Error ? err.message : undefined);
    } finally {
      setLoading(false);
    }
  }, [onShowToast]);

  useEffect(() => {
    loadOperators();
  }, [loadOperators]);

  const handleTogglePerm = async (op: CscOperatorSummary, permKey: string) => {
    if (!isAdmin) {
      onShowToast('error', 'Admin Only', 'Only ADMIN can grant or revoke CSC operator permissions.');
      return;
    }
    const nextVal = !Boolean(op.permissions[permKey]);
    setSavingId(`${op.userId}:${permKey}`);
    try {
      await cscApi.updateOperatorPermissions(op.userId, { [permKey]: nextVal });
      setOperators((prev) =>
        prev.map((item) =>
          item.userId === op.userId
            ? { ...item, permissions: { ...item.permissions, [permKey]: nextVal } }
            : item
        )
      );
      onShowToast('success', 'Permission Updated', `${op.userId}: ${permKey} = ${nextVal}`);
    } catch (err) {
      onShowToast('error', 'Update Failed', err instanceof Error ? err.message : undefined);
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-neutral-950 dark:text-white">
            Operator Control &amp; Granular CSC Permissions
          </h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
            Control all 11 CSC Operator privileges per Staff/Manager account. Service Rate Edit defaults OFF until explicitly granted by Admin.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadOperators} loading={loading} icon={<RefreshCw className="h-3.5 w-3.5" />}>
          Refresh
        </Button>
      </div>

      {/* Granular 11-Permission Matrix */}
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between text-xs">
          <span className="font-semibold flex items-center gap-1.5">
            <KeyRound className="h-4 w-4 text-blue-800 dark:text-blue-400" />
            Operator Permission Matrix ({operators.length} Operators)
          </span>
          {!isAdmin && <span className="text-amber-700">Read-Only (Admin required to toggle)</span>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-neutral-50 dark:bg-neutral-950 border-b border-neutral-200 dark:border-neutral-800 text-neutral-500">
              <tr>
                <th className="px-3.5 py-2.5 sticky left-0 bg-neutral-50 dark:bg-neutral-950">Operator</th>
                {OPERATOR_PERMISSION_DEFS.map((p) => (
                  <th key={p.key} className="px-2.5 py-2.5 text-center whitespace-nowrap" title={p.description}>
                    {p.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {operators.map((op) => (
                <tr key={op.userId}>
                  <td className="px-3.5 py-2.5 sticky left-0 bg-white dark:bg-neutral-900 border-r border-neutral-100 dark:border-neutral-800 whitespace-nowrap">
                    <div className="font-semibold text-neutral-950 dark:text-white">{op.fullName}</div>
                    <div className="font-mono text-[11px] text-neutral-500">
                      {op.userId} · {op.role}
                    </div>
                  </td>
                  {OPERATOR_PERMISSION_DEFS.map((def) => {
                    const checked = Boolean(op.permissions[def.key]);
                    const isBusy = savingId === `${op.userId}:${def.key}`;
                    return (
                      <td key={def.key} className="px-2.5 py-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={!isAdmin || isBusy}
                          onChange={() => handleTogglePerm(op, def.key)}
                          className="h-4 w-4 cursor-pointer accent-neutral-950 dark:accent-white"
                          aria-label={`${op.fullName} ${def.label}`}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
              {operators.length === 0 && (
                <tr>
                  <td colSpan={12} className="px-4 py-8 text-center text-neutral-500">
                    No active Staff/Manager operators found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Provision Customer Portal Login */}
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-4 space-y-3 text-xs">
        <div className="font-semibold flex items-center gap-1.5 text-neutral-950 dark:text-white">
          <UserPlus className="h-4 w-4 text-emerald-700 dark:text-emerald-400" />
          Provision Customer Portal Credentials (Self-Service Tracking)
        </div>
        <p className="text-neutral-500">
          Generate a citizen Customer Portal login (<code className="font-mono">MCYYFFMMSSSS</code>, e.g. <code className="font-mono">MC2627110005</code>) for any registered CSC customer ID.
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              const res = await cscApi.provisionCustomerPortal(portalCustomerId.trim(), portalPassword);
              onShowToast(
                'success',
                'Customer Portal Active',
                `User ID: ${res.data.userId} (strictly isolated to own records)`
              );
              setPortalCustomerId('');
            } catch (err) {
              onShowToast('error', 'Provisioning Failed', err instanceof Error ? err.message : undefined);
            }
          }}
          className="flex flex-col sm:flex-row gap-2.5"
        >
          <input
            type="text"
            required
            value={portalCustomerId}
            onChange={(e) => setPortalCustomerId(e.target.value)}
            placeholder="CSC Customer ID (e.g. CSCC-0001)"
            className="flex-1 h-9 px-3 font-mono bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
          />
          <input
            type="text"
            required
            value={portalPassword}
            onChange={(e) => setPortalPassword(e.target.value)}
            placeholder="Initial Portal Password"
            className="sm:w-56 h-9 px-3 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
          />
          <Button type="submit" variant="primary" size="sm" icon={<ShieldCheck className="h-3.5 w-3.5" />}>
            Provision Portal Access
          </Button>
        </form>
      </div>
    </div>
  );
};
