import Link from 'next/link';

import { BackendError, get } from '@/lib/backend';
import { BackendDown, down } from '@/components/backend-down';
import { paging, pageCount } from '@/lib/queries';
import {
  Avatar,
  Badge,
  Card,
  PageHeader,
  Table,
  EmptyRow,
} from '@/components/ui';
import { RowLink } from '@/components/ui/row-link';
import { SearchBox, FilterSelect, Pager } from '@/components/ui/client';
import { requirePage } from '@/lib/guard';

export const metadata = { title: 'Kitchens · RannaBari Admin' };
export const dynamic = 'force-dynamic';

/**
 * One row of `GET /kitchens` — the Mongo document with `_id` restated as a
 * string `id`. No counts and no aggregates: the endpoint returns the kitchen
 * and nothing joined to it.
 */
type KitchenRow = {
  id: string;
  name: string;
  ownerName: string;
  avatar: string;
  /** The shopfront picture — what a customer sees on the card. */
  coverImage: string;
  area: string;
  isVerified: boolean;
  isOpen: boolean;
  suspended: boolean;
  rating: number;
  reviewCount: number;
};

export default async function KitchensPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requirePage('kitchen.read');
  const params = await searchParams;
  const { page, skip, take } = paging(params);

  const query = new URLSearchParams({ skip: String(skip), take: String(take) });
  if (params.q) query.set('q', params.q);
  if (params.area) query.set('area', params.area);
  /* Passed through verbatim. The endpoint understands verified / unverified /
     suspended and ignores anything else, so the `open` option below is inert
     until it learns an `isOpen` clause. */
  if (params.status) query.set('status', params.status);

  let rows: KitchenRow[] = [];
  let total = 0;
  let unreachable = false;

  /* The area list rides along with the rows now rather than coming out of the
     panel's own database, so the filter and the table cannot disagree about
     which areas exist. */
  let areas: string[] = [];

  try {
    const data = await get<{ kitchens: KitchenRow[]; total: number; areas?: string[] }>(
      `/kitchens?${query}`,
    );
    rows = data.kitchens;
    total = data.total;
    areas = data.areas ?? [];
  } catch (error) {
    if (error instanceof BackendError && error.status === 0) unreachable = true;
    else throw error;
  }

  /* Dishes, orders, GMV and the cancellation rate came from two grouped
     Prisma queries keyed on the kitchen id. They cannot be joined any more:
     these ids are Mongo ObjectIds and the SQLite rows are cuids, so every
     lookup would miss and every cell would read a confident zero. An unknown
     number is shown as unknown until `GET /kitchens` carries the counts. */
  const unknown = <span className="text-ink3">—</span>;

  return (
    <>
      <PageHeader
        title="Kitchens & cooks"
        subtitle={`${total.toLocaleString('en-US')} kitchens on the platform`}
      />

      {unreachable ? (
        <div className="mb-5 rounded-[10px] border border-primary-100 bg-primary-50 px-3.5 py-2.5 text-[13px] text-primary">
          <strong>The backend is not answering.</strong> This screen reads every kitchen
          from it, so there is nothing to show until it is up. Start it with{' '}
          <code>cd backend-node &amp;&amp; npm run dev</code>.
        </div>
      ) : null}

      <Card
        pad={false}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <SearchBox placeholder="Name, owner or area…" />
            <FilterSelect
              name="area"
              allLabel="All areas"
              options={areas.map((a) => ({ value: a, label: a }))}
            />
            <FilterSelect
              name="status"
              allLabel="Any status"
              options={[
                { value: 'verified', label: 'Verified' },
                { value: 'unverified', label: 'Not verified' },
                { value: 'open', label: 'Open now' },
                { value: 'suspended', label: 'Suspended' },
              ]}
            />
          </div>
        }
        title="All kitchens"
      >
        <Table
          head={[
            'Kitchen',
            'Area',
            'Status',
            'Dishes',
            'Orders',
            'Lifetime GMV',
            'Cancelled',
            'Rating',
          ]}
        >
          {rows.map((kitchen) => (
            <RowLink key={kitchen.id} href={`/kitchens/${kitchen.id}`}>
              <td>
                <Link
                  href={`/kitchens/${kitchen.id}`}
                  className="flex items-center gap-2.5 hover:text-primary"
                >
                  {/* The cover, falling back to the avatar. A list of
                      kitchens whose only picture is a 28px circle is a list
                      an operator has to click through to recognise. */}
                  <Avatar
                    src={kitchen.coverImage || kitchen.avatar}
                    name={kitchen.name}
                    size={34}
                  />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{kitchen.name}</span>
                    <span className="block truncate text-[11.5px] text-ink3">
                      {kitchen.ownerName}
                    </span>
                  </span>
                </Link>
              </td>
              <td className="text-ink2">{kitchen.area}</td>
              <td>
                <div className="flex flex-wrap gap-1">
                  {kitchen.suspended ? (
                    <Badge tone="bad">Suspended</Badge>
                  ) : kitchen.isVerified ? (
                    <Badge tone="good">Verified</Badge>
                  ) : (
                    <Badge tone="warn">Unverified</Badge>
                  )}
                  {kitchen.isOpen && !kitchen.suspended ? (
                    <Badge tone="info">Open</Badge>
                  ) : null}
                </div>
              </td>
              <td className="tnum">{unknown}</td>
              <td className="tnum">{unknown}</td>
              <td className="tnum font-medium">{unknown}</td>
              <td className="tnum">{unknown}</td>
              <td className="tnum">
                {kitchen.reviewCount === 0 ? (
                  <span className="text-ink3">New</span>
                ) : (
                  <>
                    {kitchen.rating.toFixed(1)}
                    <span className="ml-1 text-[11px] text-ink3">({kitchen.reviewCount})</span>
                  </>
                )}
              </td>
            </RowLink>
          ))}
          {rows.length === 0 ? (
            <EmptyRow span={8}>No kitchen matches that.</EmptyRow>
          ) : null}
        </Table>

        <Pager page={page} pages={pageCount(total)} total={total} />
      </Card>
    </>
  );
}
