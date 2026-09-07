'use client';

import { useState } from 'react';

import { retireMealCategory, saveMealCategory } from '@/actions/meals';
import { ActionButton } from '@/components/ui/client';
import { taka } from '@/lib/format';

export type MealCategory = {
  id: string;
  key: string;
  label: string;
  rate: number;
  order: number;
  retired: boolean;
  services: number;
};

const INPUT =
  'rounded-[9px] border border-line bg-raised px-2.5 py-1.5 text-[13px] text-ink ' +
  'outline-none focus:border-primary-200';

/**
 * The categories a meal is sold under, and what one costs by default.
 *
 * Two halves with very different consequences. The label is cosmetic and the
 * rate is not: it is what a cook who never set their own price charges, so a
 * number typed here changes what customers pay on every such cook at once.
 * Nothing already booked moves — a booking snapshots its rate — which is the
 * only reason re-pricing is safe to do from a screen at all.
 *
 * The key is shown and never editable, for the same reason a specialty's is
 * not: services, calendars and bookings all store that string on their own
 * rows, and renaming it would orphan every one of them silently.
 */
export function MealCategoryEditor({
  categories,
  disabled,
}: {
  categories: MealCategory[];
  disabled: boolean;
}) {
  const [label, setLabel] = useState('');
  const [rate, setRate] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ label: '', rate: '' });
  const [showRetired, setShowRetired] = useState(false);

  /* Retired rows kept, but out of the way. They are never deleted — every
     service, calendar and booking stores the key — so over time they
     accumulate, and they were taking the same space as the live ones while
     being the rows an operator almost never wants. */
  const live = categories.filter((c) => !c.retired);
  const retired = categories.filter((c) => c.retired);
  const shown = showRetired ? [...live, ...retired] : live;

  return (
    <div>
      {!disabled ? (
        <div className="flex flex-wrap gap-2 border-b border-line p-3">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="A new category — e.g. Diet Meal"
            className={`${INPUT} min-w-[200px] flex-1`}
          />
          <input
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            inputMode="numeric"
            placeholder="Rate ৳"
            className={`${INPUT} tnum w-28`}
            aria-label="Default rate"
          />
          <ActionButton
            action={() => saveMealCategory(null, label, Number(rate))}
            variant="ghost"
            disabled={!label.trim() || !(Number(rate) > 0)}
          >
            Add
          </ActionButton>
        </div>
      ) : null}

      <ul className="divide-y divide-line2">
        {shown.map((category) => {
          const isEditing = editing === category.id;

          return (
            <li
              key={category.id}
              className={`flex items-center gap-3 px-4 py-2.5 ${
                category.retired ? 'opacity-50' : ''
              }`}
            >
              {isEditing ? (
                <>
                  <input
                    value={draft.label}
                    onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                    className={`${INPUT} min-w-0 flex-1`}
                    aria-label="Label"
                  />
                  <input
                    value={draft.rate}
                    onChange={(e) => setDraft({ ...draft, rate: e.target.value })}
                    inputMode="numeric"
                    className={`${INPUT} tnum w-28`}
                    aria-label="Default rate"
                  />
                  <ActionButton
                    action={async () => {
                      const out = await saveMealCategory(
                        category.id,
                        draft.label,
                        Number(draft.rate),
                      );
                      setEditing(null);
                      return out;
                    }}
                    variant="ghost"
                    disabled={!draft.label.trim() || !(Number(draft.rate) > 0)}
                  >
                    Save
                  </ActionButton>
                  <button
                    type="button"
                    onClick={() => setEditing(null)}
                    className="text-[12px] text-ink3 hover:text-ink"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">
                      {category.label}
                    </span>
                    {/* The stored string — the join, and why the label is the
                        only half that can be edited. */}
                    <span className="tnum block truncate text-[10.5px] text-ink3">
                      {category.key}
                    </span>
                  </span>

                  <span className="tnum shrink-0 text-[13px] font-semibold text-ink">
                    {taka(category.rate)}
                    <span className="ml-1 text-[10.5px] font-normal text-ink3">/ meal</span>
                  </span>

                  {/* How many cooks a re-price or a retirement would land on. */}
                  <span
                    className={`tnum w-10 shrink-0 text-right text-[12px] ${
                      category.services ? 'text-ink2' : 'text-ink3'
                    }`}
                    title={
                      category.services
                        ? `${category.services} cooks are serving this category`
                        : 'No cook has taken this category'
                    }
                  >
                    {category.services || '—'}
                  </span>

                  {!disabled ? (
                    <span className="flex shrink-0 items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(category.id);
                          setDraft({ label: category.label, rate: String(category.rate) });
                        }}
                        className="px-2 text-[12px] text-ink3 hover:text-primary"
                      >
                        Edit
                      </button>
                      <ActionButton
                        action={() => retireMealCategory(category.id, !category.retired)}
                        variant="ghost"
                      >
                        {category.retired ? 'Restore' : 'Retire'}
                      </ActionButton>
                    </span>
                  ) : null}
                </>
              )}
            </li>
          );
        })}
      </ul>

      {retired.length > 0 ? (
        <button
          type="button"
          onClick={() => setShowRetired((v) => !v)}
          className="w-full border-t border-line px-4 py-2.5 text-left text-[12.5px] text-ink3 hover:text-ink"
        >
          {showRetired
            ? 'Hide retired'
            : `${retired.length} retired ${retired.length === 1 ? 'category' : 'categories'} — show`}
        </button>
      ) : null}
    </div>
  );
}
