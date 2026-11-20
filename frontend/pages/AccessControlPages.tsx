import React, { useCallback, useEffect, useState } from 'react';
import { Shield, KeyRound, Save, Clock, Users, Check, X, Layers } from 'lucide-react';
import {
  PermissionHistoryItem,
  RoleName,
  ServicePermissionsOverviewPayload,
  UserProfile,
} from '../modules/types';
import { securityRequest } from '../services/securityApi';
import {
  CustomRoleItem,
  PermissionChangeRequestItem,
  PermissionGroupItem,
  phase08Api,
  TemporaryPermissionItem,
} from '../services/phase08Api';
import { Button } from '../components/Button';
import { StatusText } from '../components/StatusText';
import { extractFriendlyErrorMessage } from '../services/firebase';

/* ============================================================================
 * 1. ROLE MANAGEMENT PAGE
 * ========================================================================== */
interface RoleSummary {
  role: RoleName;
  userCount: number;
  defaultMatrix: Record<string, string[]>;
}

const ROLE_DESCRIPTIONS: Record<
  RoleName,
  { prefix: string; scope: string; capabilities: string[] }
> = {
  ADMIN: {
    prefix: 'MCYYFFMMSSSS · Protected Master Admin',
    scope: 'Full System Control',
    capabilities: [
      'Full Dashboard Access & Global Settings',
      'Create Manager & Staff accounts',
      'Assign services to Managers & Approve Staff service requests',
      'Assign roles, permissions, suspend or deactivate accounts',
      'View all security and audit logs',
    ],
  },
  MANAGER: {
    prefix: 'MCYYFFMMSSSS · Department Scope',
    scope: 'Assigned Departments & Staff Supervision',
    capabilities: [
      'Operate strictly within Admin-assigned departments & services',
      'Request Staff service permissions ONLY from assigned services',
      'Cannot self-approve Staff permissions or modify Admin permissions',
      'Manage Staff onboarding submissions for Admin approval',
    ],
  },
  STAFF: {
    prefix: 'MCYYFFMMSSSS · Restricted Operational Execution',
    scope: 'Restricted Operational Execution',
    capabilities: [
      'Access Dashboard, Customers, and Applications modules',
      'Perform assigned tasks & update permitted application statuses',
      'Cannot create Admin/Manager accounts or modify permissions',
      'Cannot access Security Logs or financial administration',
    ],
  },
  EMPLOYEE: {
    prefix: 'MCYYFFMMSSSS · Operational Execution (No User Creation)',
    scope: 'Operational Execution (No User Creation)',
    capabilities: [
      'Access Dashboard and assigned operational tasks',
      'No user creation or management access',
      'Cannot create or modify other accounts',
    ],
  },
  AUDITOR: {
    prefix: 'MCYYFFMMSSSS · Strict Read-Only Audit & Compliance',
    scope: 'Strict Read-Only Audit & Compliance',
    capabilities: [
      'Read-only access to Financial Engine, GL, Banking, PNB CSP & Reports',
      'Verify Trial Balance, Balance Sheet, Consolidation & Tax GSTR registers',
      'Run Self-Audit Verification & inspect Security/Audit logs',
      'Blocked (HTTP 403) from creating, modifying, approving, or reversing vouchers',
    ],
  },
  CUSTOMER: {
    prefix: 'MCYYFFMMSSSS · Citizen Self-Service Portal (Isolated)',
    scope: 'Citizen Self-Service Portal (Isolated)',
    capabilities: [
      'View ONLY own CSC orders, PVC card orders, billing & receipts',
      'Reprint own A4 Payment Receipts and upload/re-upload own documents',
      'Submit and track own Grievances / RTI & browse Official Schemes reference',
      'Strictly blocked (HTTP 403) from Admin/Operator panels, reports & other citizens',
    ],
  },
};

export const RolesPage: React.FC = () => {
  const [roles, setRoles] = useState<RoleSummary[]>([]);
  const [customRoles, setCustomRoles] = useState<CustomRoleItem[]>([]);

  useEffect(() => {
    securityRequest<RoleSummary[]>('/api/roles')
      .then((res) => setRoles(res.data))
      .catch(() => {});
    phase08Api
      .getCustomRoles()
      .then((res) => setCustomRoles(res.data))
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-neutral-950 dark:text-white">Role Management &amp; Custom Roles</h2>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
          Four-tier hierarchy + Phase 08 Custom Role templates enforced at backend API boundaries
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {(['ADMIN', 'MANAGER', 'STAFF', 'AUDITOR'] as RoleName[]).map((roleKey) => {
          const info = ROLE_DESCRIPTIONS[roleKey];
          const live = roles.find((r) => r.role === roleKey);
          return (
            <section
              key={roleKey}
              className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-2 text-sm font-bold text-neutral-950 dark:text-white">
                    <Shield className="h-4 w-4 text-blue-800 dark:text-blue-400" />
                    {roleKey}
                  </span>
                  <span className="font-mono text-xs text-neutral-500 dark:text-neutral-400 tabular-nums">
                    {live?.userCount ?? 0} user(s)
                  </span>
                </div>
                <div className="mt-1 text-xs font-mono text-neutral-500 dark:text-neutral-400">{info.prefix}</div>
                <div className="mt-2 text-xs font-medium text-neutral-800 dark:text-neutral-200">{info.scope}</div>

                <ul className="mt-4 space-y-2 border-t border-neutral-100 dark:border-neutral-800 pt-3 text-xs text-neutral-600 dark:text-neutral-300">
                  {info.capabilities.map((cap) => (
                    <li key={cap} className="leading-relaxed">
                      • {cap}
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          );
        })}
      </div>

      {customRoles.length > 0 && (
        <section className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5">
          <h3 className="text-sm font-semibold text-neutral-950 dark:text-white mb-3">
            Phase 08 Custom Role Definitions ({customRoles.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            {customRoles.map((cr) => (
              <div key={cr.roleCode} className="p-3 border border-neutral-200 dark:border-neutral-800 rounded-md">
                <div className="flex items-center justify-between font-semibold text-neutral-950 dark:text-white">
                  <span>{cr.roleName}</span>
                  <span className="font-mono text-[11px] text-neutral-500">{cr.roleCode} · Base: {cr.baseRole}</span>
                </div>
                <p className="mt-1 text-neutral-600 dark:text-neutral-300">{cr.description}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

/* ============================================================================
 * 2. PERMISSION MATRIX & INDIVIDUAL OVERRIDE MANAGEMENT
 * ========================================================================== */
interface PermissionsPageProps {
  currentUser: UserProfile;
  onShowToast: (type: 'success' | 'error' | 'info', title: string, description?: string) => void;
}

interface PermissionsPayload {
  modules: string[];
  permissionTypes: string[];
  reportPermissions?: string[];
  matrix: Record<RoleName, Record<string, string[]>>;
  history: PermissionHistoryItem[];
}

export const PermissionsPage: React.FC<PermissionsPageProps> = ({
  currentUser,
  onShowToast,
}) => {
  const [data, setData] = useState<PermissionsPayload | null>(null);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [draftPerms, setDraftPerms] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  // Phase 02 Final Master: 3-Tier Service RBAC State
  const [svcOverview, setSvcOverview] = useState<ServicePermissionsOverviewPayload | null>(null);
  const [assignMgrId, setAssignMgrId] = useState('MC2627110002');
  const [assignSvcId, setAssignSvcId] = useState('MCS-2026-27-000001');
  const [assignDept, setAssignDept] = useState('DEPT-CSC');
  const [assignExpiry, setAssignExpiry] = useState('');
  const [reqStaffId, setReqStaffId] = useState('MC2627110003');
  const [reqSvcId, setReqSvcId] = useState('');
  const [reqReason, setReqReason] = useState('Operational counter intake assignment');

  // Phase 08 Advanced Governance States
  const [groups, setGroups] = useState<PermissionGroupItem[]>([]);
  const [tempGrants, setTempGrants] = useState<TemporaryPermissionItem[]>([]);
  const [permRequests, setPermRequests] = useState<PermissionChangeRequestItem[]>([]);
  const [tempPermKey, setTempPermKey] = useState('reports.EXPORT');
  const [tempHours, setTempHours] = useState(24);
  const [tempReason, setTempReason] = useState('Month-end closing verification');

  const loadData = useCallback(async () => {
    try {
      const [permRes, usersRes, svcRes, grpRes, tmpRes, reqRes] = await Promise.all([
        securityRequest<PermissionsPayload>('/api/permissions'),
        securityRequest<UserProfile[]>('/api/users'),
        securityRequest<ServicePermissionsOverviewPayload>('/api/service-permissions/overview').catch(
          () => ({ data: null as ServicePermissionsOverviewPayload | null })
        ),
        phase08Api.getPermissionGroups().catch(() => ({ data: [] as PermissionGroupItem[] })),
        phase08Api.getTemporaryPermissions().catch(() => ({ data: [] as TemporaryPermissionItem[] })),
        phase08Api.getPermissionRequests().catch(() => ({ data: [] as PermissionChangeRequestItem[] })),
      ]);
      setData(permRes.data);
      if (svcRes.data) {
        setSvcOverview(svcRes.data);
        const firstActiveMgr = svcRes.data.managerAssignments.find((a) => a.status === 'ACTIVE');
        if (firstActiveMgr && !reqSvcId) {
          setReqSvcId(firstActiveMgr.serviceId);
        }
      }
      setGroups(grpRes.data);
      setTempGrants(tmpRes.data);
      setPermRequests(reqRes.data);
      const editableUsers = usersRes.data.filter((u) => u.role !== 'ADMIN');
      setUsers(editableUsers);
      if (editableUsers.length > 0 && !selectedUserId) {
        setSelectedUserId(editableUsers[0].userId);
        setDraftPerms(editableUsers[0].permissions ?? {});
      }
    } catch (err) {
      onShowToast('error', 'Failed to load permissions', err instanceof Error ? err.message : undefined);
    }
  }, [onShowToast, selectedUserId, reqSvcId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSelectUser = (uid: string) => {
    setSelectedUserId(uid);
    const found = users.find((u) => u.userId === uid);
    setDraftPerms(found?.permissions ?? {});
  };

  const togglePermission = (mod: string, perm: string) => {
    if (currentUser.role !== 'ADMIN') return;
    const key = `${mod}.${perm}`;
    setDraftPerms((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSavePermissions = async () => {
    if (!selectedUserId) return;
    setSaving(true);
    try {
      await securityRequest(`/api/users/${selectedUserId}/permissions`, {
        method: 'PUT',
        body: JSON.stringify({ permissions: draftPerms }),
      });
      onShowToast('success', 'Permissions Updated', `Saved overrides for ${selectedUserId}.`);
      loadData();
    } catch (err) {
      onShowToast('error', 'Permission Update Blocked', err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  const selectedUser = users.find((u) => u.userId === selectedUserId);
  const managerUsers = users.filter((u) => u.role === 'MANAGER');
  const staffUsers = users.filter((u) => u.role === 'STAFF');
  const activeManagerServices = (svcOverview?.managerAssignments ?? []).filter(
    (a) => a.status === 'ACTIVE' && (currentUser.role !== 'MANAGER' || a.managerUserId === currentUser.userId)
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-neutral-950 dark:text-white">Permission &amp; Service RBAC</h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
            Default-Deny Matrix across {data?.modules.length ?? 26} modules and {data?.permissionTypes.length ?? 12} permission types (Admin → Manager → Staff)
          </p>
        </div>

        {currentUser.role === 'ADMIN' && selectedUser && (
          <Button
            variant="primary"
            size="sm"
            loading={saving}
            onClick={handleSavePermissions}
            icon={<Save className="h-3.5 w-3.5" />}
          >
            Save User Permissions
          </Button>
        )}
      </div>

      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-medium text-neutral-700 dark:text-neutral-200">
          <KeyRound className="h-4 w-4 text-blue-800 dark:text-blue-400" />
          <span>Target User Account:</span>
        </div>

        <select
          value={selectedUserId}
          onChange={(e) => handleSelectUser(e.target.value)}
          className="h-9 px-3 text-xs font-mono bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded-md min-w-[260px]"
        >
          {users.map((u) => (
            <option key={u.userId} value={u.userId}>
              {u.userId} — {u.fullName} ({u.role})
            </option>
          ))}
        </select>
      </div>

      {data && selectedUser && (
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="bg-neutral-50 dark:bg-neutral-950 border-b border-neutral-200 dark:border-neutral-800">
                <th className="px-4 py-3 font-semibold text-neutral-700 dark:text-neutral-300">Module</th>
                {data.permissionTypes.map((p) => (
                  <th key={p} className="px-3 py-3 font-semibold text-neutral-700 dark:text-neutral-300 text-center">
                    {p}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {data.modules.map((mod) => (
                <tr key={mod} className="hover:bg-neutral-50/50 dark:hover:bg-neutral-800/40">
                  <td className="px-4 py-2.5 font-mono font-medium text-neutral-900 dark:text-neutral-100">{mod}</td>
                  {data.permissionTypes.map((perm) => {
                    const key = `${mod}.${perm}`;
                    const checked = Boolean(draftPerms[key]);
                    return (
                      <td key={key} className="px-3 py-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={currentUser.role !== 'ADMIN'}
                          onChange={() => togglePermission(mod, perm)}
                          aria-label={`${mod} ${perm}`}
                          className="h-4 w-4 rounded border-neutral-300 dark:border-neutral-700 text-neutral-950 cursor-pointer disabled:cursor-not-allowed"
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data?.reportPermissions && selectedUser && (
        <section className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5">
          <div className="mb-3">
            <h3 className="text-sm font-semibold text-neutral-950 dark:text-white">
              Phase 07 Reporting, Export, Print &amp; BI Permissions
            </h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
              Enforced on every backend /api/v1/reports/* endpoint and audit trail.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {data.reportPermissions.map((rPerm) => {
              const checked = Boolean(draftPerms[rPerm]);
              return (
                <label
                  key={rPerm}
                  className="flex items-center gap-2.5 p-2.5 rounded-md border border-neutral-200 dark:border-neutral-800 bg-neutral-50/70 dark:bg-neutral-950/50 text-xs cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={currentUser.role !== 'ADMIN'}
                    onChange={() =>
                      currentUser.role === 'ADMIN' &&
                      setDraftPerms((prev) => ({ ...prev, [rPerm]: !prev[rPerm] }))
                    }
                    className="h-4 w-4 rounded border-neutral-300 dark:border-neutral-700 text-neutral-950 cursor-pointer disabled:cursor-not-allowed"
                  />
                  <span className="font-mono font-medium text-neutral-900 dark:text-neutral-100">
                    {rPerm}
                  </span>
                </label>
              );
            })}
          </div>
        </section>
      )}

      {data && data.history.length > 0 && (
        <section className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5">
          <h3 className="text-sm font-semibold text-neutral-950 dark:text-white mb-3">
            Permission Change History
          </h3>
          <div className="divide-y divide-neutral-100 dark:divide-neutral-800 text-xs">
            {data.history.slice(0, 8).map((h) => (
              <div key={h.id} className="py-2 flex items-center justify-between gap-4">
                <div>
                  <span className="font-mono font-medium text-neutral-950 dark:text-white">{h.actorUserId}</span>{' '}
                  changed <span className="font-mono">{h.permissionKey}</span> on{' '}
                  <span className="font-mono">{h.targetUserId}</span> from{' '}
                  <span className="font-mono">{String(h.previousValue)}</span> to{' '}
                  <span className="font-mono font-semibold">{String(h.newValue)}</span>
                </div>
                <span className="font-mono text-neutral-400 shrink-0">
                  {h.createdAt.slice(0, 19).replace('T', ' ')}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Phase 08: Permission Groups, Temporary Time-Bound Grants & Approval Queue */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-blue-800 dark:text-blue-400" />
            <h3 className="text-sm font-semibold text-neutral-950 dark:text-white">
              Permission Groups (1-Click Bundle for {selectedUserId || 'User'})
            </h3>
          </div>
          <div className="space-y-2 text-xs">
            {groups.map((grp) => (
              <div key={grp.groupCode} className="p-3 border border-neutral-200 dark:border-neutral-800 rounded-md flex items-center justify-between gap-3">
                <div>
                  <div className="font-semibold text-neutral-950 dark:text-white">{grp.groupName}</div>
                  <div className="text-[11px] text-neutral-500">{grp.description}</div>
                </div>
                {currentUser.role === 'ADMIN' && selectedUserId && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      try {
                        await phase08Api.applyPermissionGroup(grp.groupCode, selectedUserId);
                        onShowToast('success', 'Permission Group Applied', `${grp.groupName} -> ${selectedUserId}`);
                        loadData();
                      } catch (err) {
                        onShowToast('error', 'Failed to Apply Group', extractFriendlyErrorMessage(err));
                      }
                    }}
                  >
                    Apply Bundle
                  </Button>
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-600" />
            <h3 className="text-sm font-semibold text-neutral-950 dark:text-white">
              Temporary Time-Bound Permissions ({tempGrants.length})
            </h3>
          </div>
          {currentUser.role === 'ADMIN' && selectedUserId && (
            <div className="flex flex-wrap gap-2 items-center pb-2 border-b border-neutral-100 dark:border-neutral-800">
              <input
                type="text"
                value={tempPermKey}
                onChange={(e) => setTempPermKey(e.target.value)}
                placeholder="Permission key"
                className="h-8 px-2 text-xs font-mono border border-neutral-200 dark:border-neutral-700 rounded bg-white dark:bg-neutral-950 w-36"
              />
              <input
                type="number"
                min={1}
                max={168}
                value={tempHours}
                onChange={(e) => setTempHours(Number(e.target.value))}
                className="h-8 px-2 text-xs font-mono border border-neutral-200 dark:border-neutral-700 rounded bg-white dark:bg-neutral-950 w-16"
              />
              <input
                type="text"
                value={tempReason}
                onChange={(e) => setTempReason(e.target.value)}
                placeholder="Justification"
                className="h-8 px-2 text-xs border border-neutral-200 dark:border-neutral-700 rounded bg-white dark:bg-neutral-950 flex-1 min-w-[120px]"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  try {
                    await phase08Api.grantTemporaryPermission({
                      userId: selectedUserId,
                      permissionKey: tempPermKey,
                      durationHours: tempHours,
                      reason: tempReason,
                    });
                    onShowToast('success', 'Temporary Access Granted', `${tempPermKey} for ${tempHours}h`);
                    loadData();
                  } catch (err) {
                    onShowToast('error', 'Grant Failed', extractFriendlyErrorMessage(err));
                  }
                }}
              >
                Grant Temp
              </Button>
            </div>
          )}
          <div className="divide-y divide-neutral-100 dark:divide-neutral-800 text-xs">
            {tempGrants.length === 0 && <div className="py-3 text-neutral-500">No temporary grants issued.</div>}
            {tempGrants.map((g) => (
              <div key={g.grantCode} className="py-2 flex items-center justify-between gap-2">
                <div>
                  <div className="font-mono font-semibold">{g.userId} · {g.permissionKey}</div>
                  <div className="text-[11px] text-neutral-500">Expires: {g.expiresAt.slice(0, 16).replace('T', ' ')} · {g.reason}</div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusText status={g.status} />
                  {currentUser.role === 'ADMIN' && g.status === 'ACTIVE' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        await phase08Api.revokeTemporaryPermission(g.grantCode);
                        loadData();
                      }}
                    >
                      Revoke
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {permRequests.length > 0 && (
        <section className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5">
          <h3 className="text-sm font-semibold text-neutral-950 dark:text-white mb-3">
            Permission Change Approval Queue ({permRequests.length})
          </h3>
          <div className="divide-y divide-neutral-100 dark:divide-neutral-800 text-xs">
            {permRequests.map((reqItem) => (
              <div key={reqItem.requestCode} className="py-2.5 flex items-center justify-between gap-4">
                <div>
                  <div className="font-mono font-semibold">{reqItem.requestCode} · {reqItem.targetUserId} (by {reqItem.proposedBy})</div>
                  <div className="text-neutral-500">{reqItem.reason}</div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusText status={reqItem.status} />
                  {currentUser.role === 'ADMIN' && reqItem.status === 'PENDING' && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          try {
                            await phase08Api.reviewPermissionRequest(reqItem.requestCode, true, 'Approved by Admin');
                            onShowToast('success', 'Request Approved', reqItem.requestCode);
                            loadData();
                          } catch (err) {
                            onShowToast('error', 'Approval Failed', extractFriendlyErrorMessage(err));
                          }
                        }}
                        icon={<Check className="h-3.5 w-3.5 text-emerald-600" />}
                      >
                        Approve
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          try {
                            await phase08Api.reviewPermissionRequest(reqItem.requestCode, false, 'Rejected by Admin');
                            onShowToast('info', 'Request Rejected', reqItem.requestCode);
                            loadData();
                          } catch (err) {
                            onShowToast('error', 'Rejection Failed', extractFriendlyErrorMessage(err));
                          }
                        }}
                        icon={<X className="h-3.5 w-3.5 text-red-600" />}
                      >
                        Reject
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Phase 02 Final Master: Admin -> Manager -> Staff Service Assignment & Cascading Control */}
      {svcOverview && (
        <section className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5 space-y-5">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-blue-800 dark:text-blue-400" />
            <div>
              <h3 className="text-sm font-semibold text-neutral-950 dark:text-white">
                3-Tier Service Permissions (Admin → Manager → Staff)
              </h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Admin assigns services to Managers; Managers request Staff access strictly from their active services; only Admin approves. Suspending a Manager assignment automatically cascades to dependent Staff.
              </p>
            </div>
          </div>

          {currentUser.role === 'ADMIN' && (
            <div className="p-4 border border-neutral-200 dark:border-neutral-800 rounded-md bg-neutral-50/70 dark:bg-neutral-950/60 space-y-3">
              <div className="text-xs font-semibold text-neutral-900 dark:text-white">
                Admin: Assign Service to Manager
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
                <select
                  value={assignMgrId}
                  onChange={(e) => setAssignMgrId(e.target.value)}
                  className="h-9 px-2 text-xs font-mono bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded"
                >
                  {managerUsers.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.userId} ({m.fullName})
                    </option>
                  ))}
                </select>
                <select
                  value={assignSvcId}
                  onChange={(e) => setAssignSvcId(e.target.value)}
                  className="h-9 px-2 text-xs bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded sm:col-span-2"
                >
                  {svcOverview.availableServices.slice(0, 30).map((s) => (
                    <option key={s.serviceId} value={s.serviceId}>
                      {s.serviceId} — {s.name}
                    </option>
                  ))}
                </select>
                <select
                  value={assignDept}
                  onChange={(e) => setAssignDept(e.target.value)}
                  className="h-9 px-2 text-xs font-mono bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded"
                >
                  {svcOverview.departments.map((d) => (
                    <option key={d.code} value={d.code}>
                      {d.code}
                    </option>
                  ))}
                </select>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={async () => {
                    try {
                      await securityRequest('/api/service-permissions/manager-assignments', {
                        method: 'POST',
                        body: JSON.stringify({
                          managerUserId: assignMgrId,
                          serviceId: assignSvcId,
                          departmentCode: assignDept,
                          expiryDate: assignExpiry || null,
                          permissions: ['VIEW', 'ADD', 'EDIT', 'PRINT', 'APPROVE', 'ASSIGN', 'EXECUTE'],
                        }),
                      });
                      onShowToast('success', 'Service Assigned to Manager', `${assignSvcId} -> ${assignMgrId}`);
                      loadData();
                    } catch (err) {
                      onShowToast('error', 'Assignment Failed', err instanceof Error ? err.message : undefined);
                    }
                  }}
                >
                  Assign Service
                </Button>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-neutral-500">
                <span>Optional Expiry Date:</span>
                <input
                  type="date"
                  value={assignExpiry}
                  onChange={(e) => setAssignExpiry(e.target.value)}
                  className="h-7 px-2 text-xs font-mono bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded"
                />
              </div>
            </div>
          )}

          {currentUser.role === 'MANAGER' && (
            <div className="p-4 border border-neutral-200 dark:border-neutral-800 rounded-md bg-neutral-50/70 dark:bg-neutral-950/60 space-y-3">
              <div className="text-xs font-semibold text-neutral-900 dark:text-white">
                Manager: Request Staff Service Permission (Admin Approval Required)
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                <select
                  value={reqStaffId}
                  onChange={(e) => setReqStaffId(e.target.value)}
                  className="h-9 px-2 text-xs font-mono bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded"
                >
                  {staffUsers.map((st) => (
                    <option key={st.userId} value={st.userId}>
                      {st.userId} ({st.fullName})
                    </option>
                  ))}
                </select>
                <select
                  value={reqSvcId}
                  onChange={(e) => setReqSvcId(e.target.value)}
                  className="h-9 px-2 text-xs bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded sm:col-span-2"
                >
                  {activeManagerServices.length === 0 && <option value="">No active assigned services</option>}
                  {activeManagerServices.map((a) => (
                    <option key={a.assignmentCode} value={a.serviceId}>
                      {a.serviceId} — {a.serviceName}
                    </option>
                  ))}
                </select>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={!reqSvcId}
                  onClick={async () => {
                    try {
                      await securityRequest('/api/service-permissions/staff-requests', {
                        method: 'POST',
                        body: JSON.stringify({
                          staffUserId: reqStaffId,
                          serviceId: reqSvcId,
                          requestedPermissions: ['VIEW', 'ADD', 'EDIT', 'EXECUTE'],
                          reason: reqReason,
                        }),
                      });
                      onShowToast('info', 'Request Sent to Admin', 'Queued as PENDING_ADMIN_APPROVAL.');
                      loadData();
                    } catch (err) {
                      onShowToast('error', 'Request Blocked', err instanceof Error ? err.message : undefined);
                    }
                  }}
                >
                  Submit to Admin
                </Button>
              </div>
              <input
                type="text"
                value={reqReason}
                onChange={(e) => setReqReason(e.target.value)}
                placeholder="Operational justification"
                className="w-full h-8 px-2.5 text-xs bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded"
              />
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
            <div className="border border-neutral-200 dark:border-neutral-800 rounded-md p-3 space-y-2">
              <div className="font-semibold text-neutral-950 dark:text-white">
                Manager Service Assignments ({svcOverview.managerAssignments.length})
              </div>
              <div className="divide-y divide-neutral-100 dark:divide-neutral-800 max-h-64 overflow-y-auto">
                {svcOverview.managerAssignments.map((msa) => (
                  <div key={msa.assignmentCode} className="py-2 flex items-center justify-between gap-2">
                    <div>
                      <div className="font-mono font-semibold text-neutral-950 dark:text-white">
                        {msa.assignmentCode} · {msa.managerUserId}
                      </div>
                      <div className="text-[11px] text-neutral-500">
                        {msa.serviceId} — {msa.serviceName} ({msa.departmentCode})
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <StatusText status={msa.status} />
                      {currentUser.role === 'ADMIN' && msa.status === 'ACTIVE' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            try {
                              await securityRequest(
                                `/api/service-permissions/manager-assignments/${msa.assignmentCode}/status`,
                                { method: 'PATCH', body: JSON.stringify({ status: 'SUSPENDED' }) }
                              );
                              onShowToast('info', 'Assignment Suspended', 'Dependent Staff permissions cascaded.');
                              loadData();
                            } catch (err) {
                              onShowToast('error', 'Suspend Failed', extractFriendlyErrorMessage(err));
                            }
                          }}
                        >
                          Suspend
                        </Button>
                      )}
                      {currentUser.role === 'ADMIN' && msa.status !== 'ACTIVE' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            try {
                              await securityRequest(
                                `/api/service-permissions/manager-assignments/${msa.assignmentCode}/status`,
                                { method: 'PATCH', body: JSON.stringify({ status: 'ACTIVE' }) }
                              );
                              loadData();
                            } catch (err) {
                              onShowToast('error', 'Activation Failed', extractFriendlyErrorMessage(err));
                            }
                          }}
                        >
                          Activate
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="border border-neutral-200 dark:border-neutral-800 rounded-md p-3 space-y-2">
              <div className="font-semibold text-neutral-950 dark:text-white">
                Active &amp; Suspended Staff Service Permissions ({svcOverview.staffPermissions.length})
              </div>
              <div className="divide-y divide-neutral-100 dark:divide-neutral-800 max-h-64 overflow-y-auto">
                {svcOverview.staffPermissions.map((ssp) => (
                  <div key={ssp.permissionCode} className="py-2 flex items-center justify-between gap-2">
                    <div>
                      <div className="font-mono font-semibold text-neutral-950 dark:text-white">
                        {ssp.permissionCode} · {ssp.staffUserId}
                      </div>
                      <div className="text-[11px] text-neutral-500">
                        {ssp.serviceId} ({ssp.permissions.join(', ')})
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <StatusText status={ssp.status} />
                      {currentUser.role === 'ADMIN' && ssp.status === 'ACTIVE' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            try {
                              await securityRequest(
                                `/api/service-permissions/staff-permissions/${ssp.permissionCode}/status`,
                                { method: 'PATCH', body: JSON.stringify({ status: 'REVOKED' }) }
                              );
                              loadData();
                            } catch (err) {
                              onShowToast('error', 'Revoke Failed', extractFriendlyErrorMessage(err));
                            }
                          }}
                        >
                          Revoke
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
};
