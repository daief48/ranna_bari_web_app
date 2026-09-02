import Link from 'next/link';

import { BackendError, get } from '@/lib/backend';
import { BackendDown } from '@/components/backend-down';
import { currentUser } from '@/lib/auth';
import { can } from '@/lib/domain';
import { fmtDate, timeAgo, daysSince } from '@/lib/format';
import { Avatar, Card, Empty, GapNote, PageHeader, StatusBadge, Badge } from '@/components/ui';
import { KycDecision } from './decision';
import { requirePage } from '@/lib/guard';

export const metadata = { title: 'KYC queue · RannaBari Admin' };
export const dynamic = 'force-dynamic';

type Applicant = {
  id: string;
  name: string;
  ownerName: string;
  area: string | null;
  avatar: string | null;
  description: string | null;
  specialty: string | null;
  deliveryRadiusKm: number | null;
  lat: number | null;
  lng: number | null;
  kycStatus: string;
  kycDecidedAt: string | null;
  kycDecidedBy: string | null;
  createdAt: string;
  /** Only on the waiting half — a decided row does not reopen the documents. */
  account?: { name: string; phone: string | null; email: string | null; nid: string | null } | null;
};

export default async function KycPage() {
  await requirePage('kitchen.read');
  const user = await currentUser();
  const canDecide = can(user?.role ?? '', 'kyc.decide');

  /* Its own route rather than a query on `GET /kitchens`, which cannot
     express this queue: no kycStatus filter, newest-first only, and no linked
     account — so the National ID, the one field an operator opens this screen
     to read, was not in that response at all.

     Oldest first, because a queue that serves the newest application first is
     one somebody can be stuck at the back of forever. */
  let pending: Applicant[];
  let decided: Applicant[];
  try {
    const data = await get<{ pending: Applicant[]; decided: Applicant[] }>('/kyc');
    pending = data.pending;
    decided = data.decided;
  } catch (error) {
    if (error instanceof BackendError && error.status === 0) {
      return <BackendDown title="KYC queue" subtitle="Cooks waiting on a decision" />;
    }
    throw error;
  }

  return (
    <>
      <PageHeader
        title="KYC queue"
        subtitle={`${pending.length} ${pending.length === 1 ? 'cook' : 'cooks'} waiting on a decision`}
      />

      <GapNote>
        <strong>Why this screen exists.</strong> The app writes{' '}
        <code>isVerified: false</code> on every kitchen it creates and there is no
        code path anywhere in it that ever flips that back. The National ID is
        collected at signup, stored, and never looked at by anybody. Until a
        decision is made here, a real cook and an unchecked one are
        indistinguishable to a customer.
      </GapNote>

      {pending.length === 0 ? (
        <Card>
          <Empty>The queue is clear. Every cook has been reviewed.</Empty>
        </Card>
      ) : (
        <div className="space-y-3">
          {pending.map((kitchen) => {
            const waiting = daysSince(kitchen.createdAt);
            return (
              <Card key={kitchen.id} pad={false}>
                <div className="grid grid-cols-1 gap-0 lg:grid-cols-[1.2fr_1fr_1fr]">
                  <div className="border-line p-4 lg:border-r">
                    <div className="mb-3 flex items-center gap-3">
                      <Avatar src={kitchen.avatar} name={kitchen.name} size={40} />
                      <div className="min-w-0">
                        <Link
                          href={`/kitchens/${kitchen.id}`}
                          className="block truncate font-display text-[15px] font-bold hover:text-primary"
                        >
                          {kitchen.name}
                        </Link>
                        <div className="truncate text-[12px] text-ink2">
                          {kitchen.ownerName} · {kitchen.specialty}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone={waiting > 14 ? 'bad' : waiting > 7 ? 'warn' : 'neutral'}>
                        waiting {waiting} {waiting === 1 ? 'day' : 'days'}
                      </Badge>
                      <Badge>{kitchen.area}</Badge>
                      <Badge>{kitchen.deliveryRadiusKm} km</Badge>
                    </div>

                    <p className="mt-3 text-[12px] leading-relaxed text-ink2">
                      {kitchen.description}
                    </p>
                  </div>

                  <div className="border-line p-4 lg:border-r">
                    <div className="label mb-2">Submitted details</div>
                    <dl className="space-y-1.5 text-[12.5px]">
                      <Row label="Owner" value={kitchen.account?.name ?? kitchen.ownerName} />
                      <Row label="Phone" value={kitchen.account?.phone ?? '—'} />
                      <Row label="Email" value={kitchen.account?.email ?? '—'} />
                      <Row
                        label="National ID"
                        value={kitchen.account?.nid ?? '—'}
                        mono
                      />
                      {/* An application can arrive without a pin — the cook
                          skipped the map, or the browser refused the location.
                          Saying so is the point: an unplaced kitchen cannot be
                          matched to a delivery radius, which is part of what
                          this decision is about. */}
                      <Row
                        label="Pinned at"
                        value={
                          kitchen.lat != null && kitchen.lng != null
                            ? `${kitchen.lat.toFixed(4)}, ${kitchen.lng.toFixed(4)}`
                            : 'not pinned'
                        }
                        mono
                      />
                      <Row label="Applied" value={fmtDate(kitchen.createdAt)} />
                    </dl>
                  </div>

                  <div className="p-4">
                    {canDecide ? (
                      <KycDecision kitchenId={kitchen.id} name={kitchen.name} />
                    ) : (
                      <p className="text-[12.5px] leading-relaxed text-ink3">
                        Deciding a KYC case needs the operations role. Sign in as
                        ops@rannabari.app or admin@rannabari.app.
                      </p>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Card title="Recent decisions" className="mt-5" pad={false}>
        <ul className="divide-y divide-line2">
          {decided.map((kitchen) => (
            <li key={kitchen.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
              <Link
                href={`/kitchens/${kitchen.id}`}
                className="min-w-0 flex-1 truncate text-[13px] font-medium hover:text-primary"
              >
                {kitchen.name}
              </Link>
              <StatusBadge status={kitchen.kycStatus} />
              <span className="text-[12px] text-ink3">
                {kitchen.kycDecidedBy} · {timeAgo(kitchen.kycDecidedAt)}
              </span>
            </li>
          ))}
          {decided.length === 0 ? (
            <li className="px-4 py-8 text-center text-[13px] text-ink3">
              No decisions on record yet.
            </li>
          ) : null}
        </ul>
      </Card>
    </>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="shrink-0 text-ink3">{label}</dt>
      <dd className={`truncate text-right text-ink ${mono ? 'tnum' : ''}`}>{value}</dd>
    </div>
  );
}
