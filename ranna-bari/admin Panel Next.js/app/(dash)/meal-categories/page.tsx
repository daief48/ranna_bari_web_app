import Link from 'next/link';

import { BackendError, get } from '@/lib/backend';
import { BackendDown } from '@/components/backend-down';
import { currentUser } from '@/lib/auth';
import { can } from '@/lib/domain';
import { taka } from '@/lib/format';
import { Badge, Card, EmptyRow, GapNote, Grid, PageHeader, Stat, Table } from '@/components/ui';
import { requirePage } from '@/lib/guard';

import { MealCategoryEditor, type MealCategory } from './editor';

type Service = {
  id: string;
  kitchenId: string;
  kitchenName: string;
  categoryKey: string;
  categoryLabel: string;
  rate: number;
  /** False means this cook is charging whatever the category says today. */
  ownRate: boolean;
  minMeals: number;
  maxMeals: number;
  active: boolean;
};

export const metadata = { title: 'Meal categories · RannaBari Admin' };
export const dynamic = 'force-dynamic';

/**
 * What a meal is sold as, and what it is worth.
 *
 * The top of the meal system: a cook picks one of these categories, inherits
 * its rate unless they set their own, and cooks from the calendar the platform
 * publishes for it. Everything downstream — a cook's monthly plan, a
 * customer's basket, the price on a booking — starts from a row on this page.
 */
export default async function MealCategoriesPage() {
  await requirePage('config.read');
  const user = await currentUser();
  const canWrite = can(user?.role ?? '', 'config.write');

  let categories: MealCategory[];
  let services: Service[];
  try {
    /* Together: the rate on the left is only meaningful beside the cooks it
       actually reaches, and a page that showed one without the other would
       invite re-pricing blind. */
    const [list, offering] = await Promise.all([
      get<{ categories: MealCategory[] }>('/meal-categories'),
      get<{ services: Service[] }>('/meal-services?take=200'),
    ]);
    categories = list.categories;
    services = offering.services;
  } catch (error) {
    if (error instanceof BackendError && error.status === 0) {
      return (
        <BackendDown
          title="Meal categories"
          subtitle="What a meal is sold as, and what it is worth"
        />
      );
    }
    throw error;
  }

  const offered = categories.filter((c) => !c.retired);
  const taken = categories.filter((c) => c.services > 0);
  const cooks = categories.reduce((sum, c) => sum + c.services, 0);

  return (
    <>
      <PageHeader
        title="Meal categories"
        subtitle="The categories a cook may serve under, and the default rate on each"
      />

      <Grid cols={3}>
        <Stat label="Offered to cooks" value={offered.length} />
        <Stat
          label="Actually taken"
          value={taken.length}
          sub="at least one cook serving"
          tone={taken.length ? 'good' : 'neutral'}
        />
        <Stat
          label="Cooks serving meals"
          value={cooks}
          sub={cooks ? 'across every category' : 'nobody has started a service'}
          tone={cooks ? 'good' : 'warn'}
        />
      </Grid>

      <GapNote>
        <strong>The rate here is a default, not a price.</strong> A cook who sets
        their own keeps it; a cook who never did charges this, and changing it moves
        what those cooks charge from the next booking onward. It moves nothing
        already sold — a booking stores the rate it was made at, so an old receipt
        stays the number the customer actually paid. The count beside each row is how
        many cooks a change would land on.{' '}
        <Link href="/meal-plans" className="font-semibold text-primary hover:underline">
          The monthly calendar
        </Link>{' '}
        is the other half of what a category means.
      </GapNote>

      <Card
        className="mt-3"
        pad={false}
        title="The categories"
        subtitle="In the order a cook is shown them"
      >
        <MealCategoryEditor categories={categories} disabled={!canWrite} />
      </Card>

      {offered.length === 0 ? (
        <p className="mt-3 text-[12.5px] leading-relaxed text-ink3">
          Nothing is offered. A cook cannot start a meal service without a category to
          start it under, so the meal system is closed until at least one is here.
        </p>
      ) : (
        <p className="mt-3 text-[12px] leading-relaxed text-ink3">
          Cheapest {taka(Math.min(...offered.map((c) => c.rate)))}, dearest{' '}
          {taka(Math.max(...offered.map((c) => c.rate)))} — before any cook sets a rate
          of their own.
        </p>
      )}

      <Card
        className="mt-3"
        pad={false}
        title="Cooks serving meals"
        subtitle="Who a rate change here would reach, and who prices themselves"
      >
        <Table head={['Cook', 'Category', 'Rate', 'Meals allowed', 'Offering']}>
          {services.map((service) => (
            <tr key={service.id}>
              <td className="max-w-[220px] truncate font-medium">
                <Link href={`/kitchens/${service.kitchenId}`} className="hover:text-primary">
                  {service.kitchenName || service.kitchenId}
                </Link>
              </td>
              <td className="text-ink2">{service.categoryLabel}</td>
              <td className="whitespace-nowrap">
                <span className="tnum">{taka(service.rate)}</span>{' '}
                {/* The distinction the rate editor above turns on: only the
                    cooks taking the default move when it changes. */}
                <span className="text-[11px] text-ink3">
                  {service.ownRate ? 'own price' : 'category default'}
                </span>
              </td>
              <td className="tnum whitespace-nowrap text-ink2">
                {service.minMeals === service.maxMeals
                  ? `exactly ${service.minMeals}`
                  : `${service.minMeals} – ${service.maxMeals}`}
              </td>
              <td>
                <Badge tone={service.active ? 'good' : 'neutral'}>
                  {service.active ? 'live' : 'paused'}
                </Badge>
              </td>
            </tr>
          ))}
          {services.length === 0 ? (
            <EmptyRow span={5}>
              No cook has started a meal service yet. A cook does this from their own
              app — picks a category, sets a rate and a meal range, and switches it on.
            </EmptyRow>
          ) : null}
        </Table>
      </Card>
    </>
  );
}
