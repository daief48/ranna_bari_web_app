import { BackendError, get } from '@/lib/backend';
import { BackendDown } from '@/components/backend-down';
import { currentUser } from '@/lib/auth';
import { can, CAPABILITIES, ROLE_LABEL, ROLES, type Role } from '@/lib/domain';
import { fmtDateTime, timeAgo } from '@/lib/format';
import {
  Badge,
  Card,
  GapNote,
  PageHeader,
  Table,
  EmptyRow,
} from '@/components/ui';
import { AdminRow, NewAdmin } from './rows';
import { SearchBox, FilterSelect } from '@/components/ui/client';
import { matches, queryOf } from '@/lib/queries';
import { requirePage } from '@/lib/guard';

export const metadata = { title: 'Admin users · RannaBari Admin' };
export const dynamic = 'force-dynamic';

type AdminRowData = {
  id: string;
  email: string;
  name: string;
  role: string;
  active: boolean;
  totpEnabled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  /** How many trail rows this operator has written. */
  actions: number;
};

/**
 * Who may operate the panel.
 *
 * Read from the backend, which is where sign-in already checks them. It kept
 * the collection all along and published no route to list or amend one, so the
 * board read the panel's own database instead — and once the detail page moved,
 * every row here linked to a 404, because the two stores hold different
 * operators under different ids.
 *
 * The writes moved with it. Splitting them would be worse either way round:
 * operators nobody can edit, or new ones nobody can see.
 */
export default async function AdminsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requirePage('kitchen.read');
  const params = await searchParams;
  const user = await currentUser();
  const isSuper = can(user?.role ?? '', '*');

  const q = queryOf(params);

  let admins: AdminRowData[];
  try {
    admins = (await get<{ admins: AdminRowData[] }>('/admins')).admins;
  } catch (error) {
    if (error instanceof BackendError && error.status === 0) {
      return (
        <BackendDown
          title="Admin users"
          subtitle="Who can operate this panel, and what each of them may do"
        />
      );
    }
    throw error;
  }

  /* Narrowed here rather than by the endpoint: /admins returns every
     operator on the platform, which is a list of a dozen. */
  const shown = admins.filter(
    (a) =>
      matches(q, a.name, a.email, a.role) &&
      (!params.role || a.role === params.role) &&
      (!params.state || (params.state === 'active') === a.active),
  );

  return (
    <>
      <PageHeader
        title="Admin users"
        subtitle="Who can operate this panel, and what each of them may do"
      />

      <GapNote>
        <strong>Roles are narrow on purpose.</strong> A support agent can read an order
        and open a case but cannot move a taka. Operations can verify a cook and force
        an order along but cannot release escrow. Finance can move money but cannot
        change a kitchen. Only a superadmin can mint another operator — otherwise
        operations could grant itself the finance role and the separation would be
        decorative.
      </GapNote>

      <Card
        pad={false}
        title="Operators"
        subtitle={
          shown.length === admins.length
            ? undefined
            : `${shown.length} of ${admins.length}`
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <SearchBox placeholder="Name or email…" />
            <FilterSelect
              name="role"
              allLabel="Any role"
              options={ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] ?? r }))}
            />
            <FilterSelect
              name="state"
              allLabel="Any state"
              options={[
                { value: 'active', label: 'Active' },
                { value: 'disabled', label: 'Disabled' },
              ]}
            />
          </div>
        }
      >
        <Table head={['Operator', 'Role', 'State', 'Last signed in', 'Audit rows', 'Actions']}>
          {shown.map((admin) => (
            <AdminRow
              key={admin.id}
              id={admin.id}
              email={admin.email}
              name={admin.name}
              role={admin.role}
              active={admin.active}
              lastLogin={admin.lastLoginAt ? timeAgo(admin.lastLoginAt) : 'never'}
              auditCount={admin.actions}
              isSelf={admin.id === user?.sub}
              canManage={isSuper}
            />
          ))}
          {shown.length === 0 ? (
            <EmptyRow span={6}>
              {admins.length ? 'No operator matches that.' : 'No operators.'}
            </EmptyRow>
          ) : null}
        </Table>
      </Card>

      {isSuper ? (
        <Card title="Add an operator" className="mt-3">
          <NewAdmin />
        </Card>
      ) : null}

      <Card title="What each role may do" className="mt-3" pad={false}>
        <Table head={['Role', 'Capabilities']}>
          {ROLES.map((role) => (
            <tr key={role}>
              <td className="whitespace-nowrap font-medium">{ROLE_LABEL[role]}</td>
              <td>
                <div className="flex flex-wrap gap-1">
                  {(CAPABILITIES[role as Role] as readonly string[]).map((cap) => (
                    <Badge key={cap} tone={cap === '*' ? 'bad' : 'neutral'}>
                      {cap === '*' ? 'everything' : cap}
                    </Badge>
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </Table>
      </Card>

      <p className="mt-6 text-[11.5px] leading-relaxed text-ink3">
        Every capability is checked on the server, inside the action, next to the data.
        The panel also hides links a role cannot use, but that is a courtesy — an
        action POSTed directly is refused just the same.
      </p>
    </>
  );
}
