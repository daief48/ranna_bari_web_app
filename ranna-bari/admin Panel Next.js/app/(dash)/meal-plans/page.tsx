import Link from 'next/link';

import { BackendError, get } from '@/lib/backend';
import { BackendDown } from '@/components/backend-down';
import { currentUser } from '@/lib/auth';
import { can } from '@/lib/domain';
import { Card, GapNote, PageHeader } from '@/components/ui';
import { requirePage } from '@/lib/guard';

import { MealPlanEditor, type PlanDay, type PlanDish } from './editor';

export const metadata = { title: 'Meal calendar · RannaBari Admin' };
export const dynamic = 'force-dynamic';

type Category = { id: string; key: string; label: string; rate: number; retired: boolean };

/**
 * Months to offer, from the one before now to five ahead.
 *
 * Dhaka rather than the server's clock: a calendar is a local thing, and an
 * operator in Dhaka opening this at 1am must not be shown last month.
 */
function monthOptions(): string[] {
  const now = new Date(
    new Date().toLocaleString('en-US', { timeZone: 'Asia/Dhaka' }),
  );
  const out: string[] = [];
  for (let delta = -1; delta <= 5; delta += 1) {
    const at = new Date(Date.UTC(now.getFullYear(), now.getMonth() + delta, 1));
    out.push(`${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

const monthLabel = (month: string) =>
  new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

/**
 * The platform's monthly meal calendar.
 *
 * This is the plan every cook on a category starts from. A cook who wants
 * their own publishes a copy — a separate document, which is why editing here
 * can never overwrite what somebody is cooking from tomorrow, and also why a
 * cook who has already overridden a month will not see a change made here.
 *
 * The category and the month are in the URL rather than in client state, so
 * the calendar is fetched on the server and a half-written month survives a
 * reload as whatever was last saved.
 */
export default async function MealPlansPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; month?: string }>;
}) {
  await requirePage('meal.read');
  const user = await currentUser();
  const canWrite = can(user?.role ?? '', 'meal.write');

  const params = await searchParams;
  const months = monthOptions();

  let categories: Category[];
  try {
    const data = await get<{ categories: Category[] }>('/meal-categories');
    categories = data.categories.filter((c) => !c.retired);
  } catch (error) {
    if (error instanceof BackendError && error.status === 0) {
      return (
        <BackendDown title="Meal calendar" subtitle="What the platform serves, day by day" />
      );
    }
    throw error;
  }

  if (categories.length === 0) {
    return (
      <>
        <PageHeader title="Meal calendar" subtitle="What the platform serves, day by day" />
        <Card className="mt-3">
          <p className="text-[13.5px] leading-relaxed text-ink">
            There are no meal categories, so there is nothing to write a calendar for.
          </p>
          <p className="mt-2 text-[13px] leading-relaxed text-ink2">
            A calendar belongs to a category — it is what a cook serving that category
            starts from.{' '}
            <Link
              href="/meal-categories"
              className="font-semibold text-primary hover:underline"
            >
              Add one first
            </Link>
            .
          </p>
        </Card>
      </>
    );
  }

  /* Default to the first category and the current month, which is what an
     operator opening this from the sidebar means. */
  const categoryKey =
    categories.find((c) => c.key === params.category)?.key ?? categories[0].key;
  const month = months.includes(params.month ?? '') ? (params.month as string) : months[1];

  let plan: {
    status: string;
    updatedBy: string;
    days: PlanDay[];
    dishes: PlanDish[];
  };
  try {
    plan = await get<typeof plan>(
      `/meal-plans?categoryKey=${encodeURIComponent(categoryKey)}&month=${encodeURIComponent(month)}`,
    );
  } catch (error) {
    if (error instanceof BackendError && error.status === 0) {
      return (
        <BackendDown title="Meal calendar" subtitle="What the platform serves, day by day" />
      );
    }
    throw error;
  }

  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1 text-[12.5px] whitespace-nowrap transition-colors ${
      active
        ? 'border-primary bg-primary-50 font-semibold text-primary'
        : 'border-line text-ink2 hover:border-primary-200 hover:text-ink'
    }`;

  return (
    <>
      <PageHeader
        title="Meal calendar"
        subtitle="What the platform serves each day — the plan every cook on a category starts from"
      />

      <div className="mb-3 space-y-2">
        <div className="scroll-x flex gap-1.5">
          {categories.map((category) => (
            <Link
              key={category.key}
              href={`/meal-plans?category=${encodeURIComponent(category.key)}&month=${month}`}
              className={chip(category.key === categoryKey)}
            >
              {category.label}
            </Link>
          ))}
        </div>
        <div className="scroll-x flex gap-1.5">
          {months.map((option) => (
            <Link
              key={option}
              href={`/meal-plans?category=${encodeURIComponent(categoryKey)}&month=${option}`}
              className={chip(option === month)}
            >
              {monthLabel(option)}
            </Link>
          ))}
        </div>
      </div>

      <GapNote>
        <strong>Editing here never touches a cook&rsquo;s own menu.</strong> A cook who
        publishes their own version of a month gets a separate document, and this is
        the default they started from — so a change made now reaches every cook who
        has not overridden that month, and none of the ones who have. Publishing is
        what makes a month bookable; a draft is safe to leave half-written.
      </GapNote>

      <Card
        className="mt-3"
        pad={false}
        title={monthLabel(month)}
        subtitle={
          plan.updatedBy
            ? `Last saved by ${plan.updatedBy}`
            : 'Nothing written for this month yet'
        }
      >
        <MealPlanEditor
          key={`${categoryKey}-${month}`}
          categoryKey={categoryKey}
          month={month}
          days={plan.days}
          dishes={plan.dishes}
          status={plan.status}
          disabled={!canWrite}
        />
      </Card>
    </>
  );
}
