'use client';

import { useState } from 'react';

import { createAdmin, setAdminActive, setAdminRole } from '@/actions/platform';
import { ActionButton } from '@/components/ui/client';
import { Badge } from '@/components/ui';
import { ROLES, ROLE_LABEL } from '@/lib/domain';

const INPUT =
  'rounded-[10px] border border-line bg-canvas px-2.5 py-1.5 text-[13px] outline-none placeholder:text-ink3 focus:border-primary-200';

export function AdminRow({
  id,
  email,
  name,
  role,
  active,
  lastLogin,
  auditCount,
  isSelf,
  canManage,
}: {
  id: string;
  email: string;
  name: string;
  role: string;
  active: boolean;
  lastLogin: string;
  auditCount: number;
  isSelf: boolean;
  canManage: boolean;
}) {
  const [nextRole, setNextRole] = useState(role);

  return (
    <tr className={active ? '' : 'opacity-55'}>
      <td>
        <span className="block font-medium">
          {name}
          {isSelf ? (
            <span className="ml-1.5">
              <Badge tone="info">you</Badge>
            </span>
          ) : null}
        </span>
        <span className="block text-[11.5px] text-ink3">{email}</span>
      </td>
      <td>
        {/* Changing your own role is refused server-side too — locking yourself
            out of the panel you administer is not a recoverable mistake. */}
        {canManage && !isSelf ? (
          <select
            value={nextRole}
            onChange={(e) => {
              setNextRole(e.target.value);
              setAdminRole(id, e.target.value);
            }}
            className={INPUT}
            aria-label={`Role for ${email}`}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        ) : (
          <Badge tone={role === 'superadmin' ? 'bad' : 'neutral'}>{ROLE_LABEL[role] ?? role}</Badge>
        )}
      </td>
      <td>{active ? <Badge tone="good">active</Badge> : <Badge tone="bad">disabled</Badge>}</td>
      <td className="whitespace-nowrap text-ink2">{lastLogin}</td>
      <td className="tnum text-ink2">{auditCount}</td>
      <td>
        {canManage && !isSelf ? (
          <ActionButton
            action={() => setAdminActive(id, !active)}
            variant="quiet"
            confirm={active ? `Disable ${email}? They cannot sign in.` : undefined}
          >
            {active ? 'Disable' : 'Enable'}
          </ActionButton>
        ) : (
          <span className="text-[11.5px] text-ink3">—</span>
        )}
      </td>
    </tr>
  );
}

export function NewAdmin() {
  const [email, setEmail] = useState('shirin.akter@rannabari.app');
  const [name, setName] = useState('Shirin Akter');
  const [role, setRole] = useState<string>('support');
  /* The one field here that stays empty. A default password is the password
     the account keeps, and this form mints operators who can move money. */
  const [password, setPassword] = useState('');

  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="min-w-[180px] flex-1">
        <span className="label mb-1 block">Email</span>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          placeholder="name@rannabari.app"
          className={`${INPUT} w-full`}
        />
      </label>

      <label className="min-w-[150px] flex-1">
        <span className="label mb-1 block">Name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Full name"
          className={`${INPUT} w-full`}
        />
      </label>

      <label>
        <span className="label mb-1 block">Role</span>
        <select value={role} onChange={(e) => setRole(e.target.value)} className={INPUT}>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </select>
      </label>

      <label className="min-w-[150px]">
        <span className="label mb-1 block">Password</span>
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          placeholder="8+ characters"
          className={`${INPUT} w-full`}
        />
      </label>

      <ActionButton
        action={() => createAdmin(email, name, role, password)}
        variant="primary"
        disabled={!email.trim() || !name.trim() || password.length < 8}
      >
        Create
      </ActionButton>
    </div>
  );
}
