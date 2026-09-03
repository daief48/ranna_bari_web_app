'use client';

import { useState } from 'react';

import { savePromotion, stopPromotion } from '@/actions/platform';
import { ActionButton } from '@/components/ui/client';

export type Promotion = {
  id: string;
  code: string;
  kind: 'percent' | 'flat';
  value: number;
  minOrder: number;
  maxDiscount: number;
  firstOrderOnly: boolean;
  usageLimit: number;
  perCustomer: number;
  startsAt: string | null;
  endsAt: string | null;
  active: boolean;
  used: number;
};

const INPUT =
  'rounded-[9px] border border-line bg-raised px-2.5 py-1.5 text-[13px] text-ink ' +
  'outline-none focus:border-primary-200';

const LABEL = 'text-[11px] uppercase tracking-[0.08em] text-ink3';

/** ৳ for flat, % for a share. The unit is the first thing read on this page. */
const worth = (p: Pick<Promotion, 'kind' | 'value'>) =>
  p.kind === 'flat' ? `৳${p.value}` : `${p.value}%`;

/**
 * Why a code is not live, in the words an operator would use.
 *
 * `active` is only one of four reasons, and the other three are invisible on
 * a row that just says "Live": a campaign can be switched on and still be
 * refusing every customer because it has not started, has ended, or has been
 * fully claimed. Saying which saves an operator debugging a code that is
 * behaving exactly as configured.
 */
function standing(p: Promotion): { text: string; tone: 'good' | 'warn' | 'off' } {
  if (!p.active) return { text: 'Stopped', tone: 'off' };

  const now = Date.now();
  if (p.startsAt && now < new Date(p.startsAt).getTime()) {
    return { text: 'Not started', tone: 'warn' };
  }
  if (p.endsAt && now > new Date(p.endsAt).getTime()) return { text: 'Ended', tone: 'off' };
  if (p.usageLimit && p.used >= p.usageLimit) return { text: 'Fully claimed', tone: 'warn' };

  return { text: 'Live', tone: 'good' };
}

const TONE = {
  good: 'border border-sage-100 bg-sage-50 text-sage',
  warn: 'border border-saffron-100 bg-saffron-50 text-saffron',
  off: 'border border-line bg-sunken text-ink3',
} as const;

const asDate = (iso: string | null) => (iso ? iso.slice(0, 10) : '');

/**
 * Campaigns, and the money they are spending.
 *
 * The form is deliberately long rather than clever. Every field on it is a
 * limit, and a promotion is the one thing on this console that gives platform
 * money away — a code launched without a cap because the form hid the field
 * behind "advanced" is the exact mistake worth a few extra rows of markup.
 */
export function PromotionEditor({
  promotions,
  disabled,
}: {
  promotions: Promotion[];
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  const [draft, setDraft] = useState({
    code: '',
    kind: 'percent' as 'percent' | 'flat',
    value: '',
    minOrder: '',
    maxDiscount: '',
    usageLimit: '',
    perCustomer: '1',
    firstOrderOnly: false,
    startsAt: '',
    endsAt: '',
  });

  const num = (v: string) => (v.trim() === '' ? undefined : Number(v));

  const fields = () => ({
    kind: draft.kind,
    value: num(draft.value) ?? 0,
    minOrder: num(draft.minOrder) ?? 0,
    maxDiscount: num(draft.maxDiscount) ?? 0,
    usageLimit: num(draft.usageLimit) ?? 0,
    perCustomer: num(draft.perCustomer) ?? 1,
    firstOrderOnly: draft.firstOrderOnly,
    startsAt: draft.startsAt ? new Date(draft.startsAt).toISOString() : null,
    endsAt: draft.endsAt ? new Date(draft.endsAt).toISOString() : null,
  });

  const startEdit = (p: Promotion) => {
    setEditing(p.id);
    setOpen(false);
    setDraft({
      code: p.code,
      kind: p.kind,
      value: String(p.value),
      minOrder: p.minOrder ? String(p.minOrder) : '',
      maxDiscount: p.maxDiscount ? String(p.maxDiscount) : '',
      usageLimit: p.usageLimit ? String(p.usageLimit) : '',
      perCustomer: String(p.perCustomer),
      firstOrderOnly: p.firstOrderOnly,
      startsAt: asDate(p.startsAt),
      endsAt: asDate(p.endsAt),
    });
  };

  const reset = () => {
    setOpen(false);
    setEditing(null);
    setDraft({
      code: '',
      kind: 'percent',
      value: '',
      minOrder: '',
      maxDiscount: '',
      usageLimit: '',
      perCustomer: '1',
      firstOrderOnly: false,
      startsAt: '',
      endsAt: '',
    });
  };

  const form = (
    <div className="grid gap-3 border-b border-line bg-sunken/40 p-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className="flex flex-col gap-1">
        <span className={LABEL}>Code</span>
        <input
          value={draft.code}
          onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase() })}
          disabled={!!editing}
          placeholder="EIDBARI"
          className={`${INPUT} font-mono uppercase disabled:text-ink3`}
        />
        {editing ? (
          <span className="text-[11px] text-ink3">A code is never renamed.</span>
        ) : null}
      </label>

      <label className="flex flex-col gap-1">
        <span className={LABEL}>Takes off</span>
        <div className="flex gap-1.5">
          <input
            value={draft.value}
            onChange={(e) => setDraft({ ...draft, value: e.target.value })}
            inputMode="numeric"
            placeholder={draft.kind === 'flat' ? '150' : '20'}
            className={`${INPUT} w-full`}
          />
          <select
            value={draft.kind}
            onChange={(e) =>
              setDraft({ ...draft, kind: e.target.value as 'percent' | 'flat' })
            }
            className={INPUT}
          >
            <option value="percent">%</option>
            <option value="flat">৳</option>
          </select>
        </div>
      </label>

      <label className="flex flex-col gap-1">
        <span className={LABEL}>Basket must reach</span>
        <input
          value={draft.minOrder}
          onChange={(e) => setDraft({ ...draft, minOrder: e.target.value })}
          inputMode="numeric"
          placeholder="No minimum"
          className={INPUT}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className={LABEL}>Never more than</span>
        <input
          value={draft.maxDiscount}
          onChange={(e) => setDraft({ ...draft, maxDiscount: e.target.value })}
          inputMode="numeric"
          placeholder={draft.kind === 'flat' ? 'n/a' : 'Uncapped'}
          disabled={draft.kind === 'flat'}
          className={`${INPUT} disabled:text-ink3`}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className={LABEL}>Total redemptions</span>
        <input
          value={draft.usageLimit}
          onChange={(e) => setDraft({ ...draft, usageLimit: e.target.value })}
          inputMode="numeric"
          placeholder="Unlimited"
          className={INPUT}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className={LABEL}>Per customer</span>
        <input
          value={draft.perCustomer}
          onChange={(e) => setDraft({ ...draft, perCustomer: e.target.value })}
          inputMode="numeric"
          placeholder="1"
          className={INPUT}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className={LABEL}>Starts</span>
        <input
          type="date"
          value={draft.startsAt}
          onChange={(e) => setDraft({ ...draft, startsAt: e.target.value })}
          className={INPUT}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className={LABEL}>Ends</span>
        <input
          type="date"
          value={draft.endsAt}
          onChange={(e) => setDraft({ ...draft, endsAt: e.target.value })}
          className={INPUT}
        />
      </label>

      <label className="flex items-center gap-2 text-[13px] text-ink2 lg:col-span-2">
        <input
          type="checkbox"
          checked={draft.firstOrderOnly}
          onChange={(e) => setDraft({ ...draft, firstOrderOnly: e.target.checked })}
          className="size-4 accent-primary"
        />
        First order only — counted against orders, so anybody who has ordered
        without a code is still not new.
      </label>

      <div className="flex items-center gap-2 lg:col-span-2 lg:justify-end">
        <button
          type="button"
          onClick={reset}
          className="rounded-[9px] px-3 py-1.5 text-[13px] text-ink3 hover:text-ink"
        >
          Cancel
        </button>
        <ActionButton
          action={async () => {
            const out = await savePromotion(
              editing,
              editing ? fields() : { ...fields(), code: draft.code },
            );
            if (out.ok) reset();
            return out;
          }}
          disabled={!draft.code.trim() || !draft.value.trim()}
        >
          {editing ? 'Save' : 'Create campaign'}
        </ActionButton>
      </div>
    </div>
  );

  return (
    <div>
      {!disabled && (open || editing) ? form : null}

      {!disabled && !open && !editing ? (
        <div className="border-b border-line p-3">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-[9px] border border-line bg-raised px-3 py-1.5 text-[13px] font-medium text-ink hover:border-primary-200"
          >
            New campaign
          </button>
        </div>
      ) : null}

      {promotions.length === 0 ? (
        <p className="p-6 text-center text-[13px] text-ink3">
          No campaigns yet. The platform has never run one.
        </p>
      ) : (
        <ul className="divide-y divide-line2">
          {promotions.map((p) => {
            const state = standing(p);
            return (
              <li
                key={p.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5"
              >
                <span className="font-mono text-[13.5px] font-semibold text-ink">
                  {p.code}
                </span>

                <span className="rounded-full bg-primary-50 px-2 py-0.5 text-[12px] font-semibold text-primary">
                  {worth(p)} off
                </span>

                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${TONE[state.tone]}`}
                >
                  {state.text}
                </span>

                <span className="text-[12px] text-ink3">
                  {p.minOrder ? `min ৳${p.minOrder}` : 'no minimum'}
                  {p.maxDiscount ? ` · max ৳${p.maxDiscount}` : ''}
                  {p.firstOrderOnly ? ' · first order' : ''}
                  {p.perCustomer ? ` · ${p.perCustomer} per customer` : ''}
                </span>

                <span className="ml-auto text-[12px] text-ink2">
                  <strong className="text-ink">{p.used}</strong>
                  {p.usageLimit ? ` / ${p.usageLimit}` : ''} used
                </span>

                {!disabled ? (
                  <span className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => startEdit(p)}
                      className="rounded-[8px] px-2 py-1 text-[12px] text-ink3 hover:bg-sunken hover:text-ink"
                    >
                      Edit
                    </button>
                    <ActionButton
                      action={() => stopPromotion(p.id, !p.active)}
                      variant="ghost"
                    >
                      {p.active ? 'Stop' : 'Start'}
                    </ActionButton>
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
