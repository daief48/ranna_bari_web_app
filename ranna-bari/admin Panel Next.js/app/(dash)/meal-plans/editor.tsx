'use client';

import { useMemo, useState } from 'react';

import { saveMealPlan } from '@/actions/meals';
import { ActionButton } from '@/components/ui/client';

export type PlanDay = {
  date: string;
  breakfast: string;
  lunch: string;
  dinner: string;
};

export type PlanDish = { id: string; name: string; type: string };

const SLOTS = ['breakfast', 'lunch', 'dinner'] as const;
type Slot = (typeof SLOTS)[number];

const INPUT =
  'w-full rounded-[8px] border border-line bg-raised px-2 py-1.5 text-[12.5px] text-ink ' +
  'outline-none focus:border-primary-200 placeholder:text-ink3';

/** 'Mon 1' — the weekday matters here, because menus repeat by it. */
function dayLabel(date: string): { weekday: string; day: string; weekend: boolean } {
  /* Parsed as UTC on purpose: these are calendar labels, not instants, and
     `new Date('2026-09-01')` in a browser west of Greenwich is August 31st. */
  const at = new Date(`${date}T00:00:00Z`);
  const weekday = at.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' });
  return {
    weekday,
    day: String(at.getUTCDate()),
    /* Friday and Saturday — the Bangladeshi weekend, when a mess cooks
       differently and an operator filling a month wants to see the break. */
    weekend: at.getUTCDay() === 5 || at.getUTCDay() === 6,
  };
}

/**
 * One month of the platform's calendar, for one category.
 *
 * Thirty-one rows of three fields is a lot of typing, so the two things that
 * make it bearable are here rather than in a later pass: a dish typed once is
 * offered on every later row through the datalist, and a row can be copied
 * down the rest of the month. Neither is cleverness — a month of meals is
 * mostly a weekly rotation, and typing it out thirty-one times is how a screen
 * like this ends up half-filled.
 *
 * Publishing is separate from saving. A half-written month must not be
 * bookable, and the operator filling it in should not have to finish in one
 * sitting to avoid that.
 */
export function MealPlanEditor({
  categoryKey,
  month,
  days: initial,
  dishes,
  status,
  disabled,
}: {
  categoryKey: string;
  month: string;
  days: PlanDay[];
  dishes: PlanDish[];
  status: string;
  disabled: boolean;
}) {
  const [days, setDays] = useState<PlanDay[]>(initial);
  const [dirty, setDirty] = useState(false);

  const set = (date: string, slot: Slot, value: string) => {
    setDays((rows) =>
      rows.map((row) => (row.date === date ? { ...row, [slot]: value } : row)),
    );
    setDirty(true);
  };

  /** Copy one day's three meals onto every later date in the month. */
  const fillDown = (from: string) => {
    setDays((rows) => {
      const source = rows.find((r) => r.date === from);
      if (!source) return rows;
      let reached = false;
      return rows.map((row) => {
        if (row.date === from) {
          reached = true;
          return row;
        }
        if (!reached) return row;
        return {
          ...row,
          breakfast: source.breakfast,
          lunch: source.lunch,
          dinner: source.dinner,
        };
      });
    });
    setDirty(true);
  };

  /* Everything already named on this calendar, plus the platform library —
     the second month of a category is mostly the first one's dishes. */
  const suggestions = useMemo(() => {
    const byType = new Map<string, Set<string>>(SLOTS.map((s) => [s, new Set<string>()]));
    for (const dish of dishes) byType.get(dish.type)?.add(dish.name);
    for (const row of days) {
      for (const slot of SLOTS) {
        if (row[slot].trim()) byType.get(slot)?.add(row[slot].trim());
      }
    }
    return byType;
  }, [dishes, days]);

  const filled = days.filter((d) => d.breakfast || d.lunch || d.dinner).length;
  const meals = days.reduce(
    (sum, d) => sum + SLOTS.filter((s) => d[s].trim()).length,
    0,
  );

  return (
    <div>
      {SLOTS.map((slot) => (
        <datalist key={slot} id={`dishes-${slot}`}>
          {[...(suggestions.get(slot) ?? [])].sort().map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      ))}

      <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-2.5">
        <span className="text-[12.5px] text-ink2">
          <strong className="tnum text-ink">{filled}</strong> of {days.length} days
          written · <strong className="tnum text-ink">{meals}</strong> meals
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold tracking-[0.06em] uppercase ${
            status === 'published'
              ? 'bg-sage-50 text-sage'
              : 'bg-sunken text-ink3'
          }`}
        >
          {status === 'published' ? 'Published' : 'Draft'}
        </span>
        {dirty ? (
          <span className="text-[11.5px] text-saffron">Unsaved changes</span>
        ) : null}

        {!disabled ? (
          <span className="ml-auto flex items-center gap-2">
            <ActionButton
              action={async () => {
                const out = await saveMealPlan(categoryKey, month, days, false);
                if (out.ok) setDirty(false);
                return out;
              }}
              variant="ghost"
            >
              Save draft
            </ActionButton>
            <ActionButton
              action={async () => {
                const out = await saveMealPlan(categoryKey, month, days, true);
                if (out.ok) setDirty(false);
                return out;
              }}
              confirm={`Publish ${month}? Cooks on this category can book against it from that moment.`}
            >
              Publish
            </ActionButton>
          </span>
        ) : null}
      </div>

      <div className="scroll-x">
        <table className="tbl">
          <thead>
            <tr>
              <th style={{ width: 92 }}>Date</th>
              <th>Breakfast</th>
              <th>Lunch</th>
              <th>Dinner</th>
              {!disabled ? <th style={{ width: 44 }} /> : null}
            </tr>
          </thead>
          <tbody>
            {days.map((row) => {
              const label = dayLabel(row.date);
              return (
                <tr key={row.date}>
                  <td className={label.weekend ? 'text-primary' : 'text-ink2'}>
                    <span className="tnum text-[13px] font-semibold">{label.day}</span>{' '}
                    <span className="text-[11.5px]">{label.weekday}</span>
                  </td>
                  {SLOTS.map((slot) => (
                    <td key={slot}>
                      <input
                        value={row[slot]}
                        onChange={(e) => set(row.date, slot, e.target.value)}
                        list={`dishes-${slot}`}
                        disabled={disabled}
                        placeholder="—"
                        aria-label={`${slot} on ${row.date}`}
                        className={INPUT}
                      />
                    </td>
                  ))}
                  {!disabled ? (
                    <td>
                      <button
                        type="button"
                        onClick={() => fillDown(row.date)}
                        title="Copy this day onto every date below it"
                        aria-label={`Copy ${row.date} down`}
                        className="px-1.5 text-[13px] text-ink3 hover:text-primary"
                      >
                        ↓
                      </button>
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
