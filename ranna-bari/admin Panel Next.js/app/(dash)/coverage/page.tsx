import { BackendError, get } from '@/lib/backend';
import { BackendDown } from '@/components/backend-down';
import {
  Badge,
  Card,
  EmptyRow,
  Grid,
  PageHeader,
  Stat,
  Table,
} from '@/components/ui';
import { requirePage } from '@/lib/guard';

import { CoverageMap, type Kitchen, type Point } from './CoverageMap';

export const metadata = { title: 'Coverage · RannaBari Admin' };
export const dynamic = 'force-dynamic';

type Miss = { area: string; searches: number; terms: string[]; hasKitchen: boolean };

type Coverage = {
  kitchens: Kitchen[];
  customers: Point[];
  misses: Miss[];
  summary: { kitchens: number; pinned: number; stranded: number; emptySearches: number };
};

/**
 * Where the kitchens are, and where the customers are.
 *
 * Everything in this marketplace is gated on geography — a kitchen has a
 * delivery radius, a customer only ever sees what reaches them, every list is
 * ranked by distance — and the console had no map at all. So the question the
 * geography exists to answer, "where should the next cook be", was the one
 * question the operator could not ask.
 *
 * The interesting thing on this page is the absence: a customer sitting
 * outside every circle, or an area people search from and never order in.
 */
export default async function CoveragePage() {
  await requirePage('kitchen.read');

  let data: Coverage;
  try {
    data = await get<Coverage>('/coverage');
  } catch (error) {
    if (error instanceof BackendError && error.status === 0) {
      return (
        <BackendDown
          title="Coverage"
          subtitle="Kitchens, their delivery radius, and the customers inside it"
        />
      );
    }
    throw error;
  }

  const { kitchens, customers, misses, summary } = data;
  const uncovered = misses.filter((m) => !m.hasKitchen);

  return (
    <>
      <PageHeader
        title="Coverage"
        subtitle="Kitchens, the circle each will deliver inside, and who falls outside all of them"
      />

      <Grid cols={4}>
        <Stat label="Kitchens on the map" value={summary.kitchens.toLocaleString('en-US')} />
        <Stat label="Customers with a pin" value={summary.pinned.toLocaleString('en-US')} />
        <Stat
          label="Nobody delivers to them"
          value={summary.stranded.toLocaleString('en-US')}
          sub="outside every radius"
          tone={summary.stranded ? 'bad' : 'good'}
        />
        <Stat
          label="Searches that found nothing"
          value={summary.emptySearches.toLocaleString('en-US')}
          tone={summary.emptySearches ? 'warn' : 'neutral'}
        />
      </Grid>

      <Card
        title="The map"
        subtitle="Vermilion is a kitchen, its ring is what it will deliver inside · sage is a customer who can order · amber is one who cannot"
      >
        <CoverageMap kitchens={kitchens} customers={customers} />
      </Card>

      <Card
        pad={false}
        title="Asked for, and not found"
        subtitle="Where people searched and the catalogue had nothing — the supply gap, by area"
      >
        <Table head={['Area', 'Empty searches', 'What they wanted', 'Has a kitchen']}>
          {misses.map((miss) => (
            <tr key={miss.area || 'unknown'}>
              <td className="max-w-[240px] truncate font-medium">
                {miss.area || <span className="text-ink3">Not given</span>}
              </td>
              <td className="tnum">{miss.searches}</td>
              <td className="max-w-[320px] truncate text-ink2">{miss.terms.join(', ')}</td>
              <td>
                {miss.hasKitchen ? (
                  <Badge tone="neutral">Yes</Badge>
                ) : (
                  <Badge tone="warn">None</Badge>
                )}
              </td>
            </tr>
          ))}
          {misses.length === 0 ? (
            <EmptyRow span={4}>Every search has found something.</EmptyRow>
          ) : null}
        </Table>
      </Card>

      {uncovered.length ? (
        <Card title="Where to look for the next cook">
          <p className="text-[13px] text-ink2">
            {uncovered.length === 1 ? 'One area has' : `${uncovered.length} areas have`} people
            searching and no kitchen of their own:{' '}
            <strong>{uncovered.map((m) => m.area || 'an unnamed area').join(', ')}</strong>.
          </p>
        </Card>
      ) : null}
    </>
  );
}
