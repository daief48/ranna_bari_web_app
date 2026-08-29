'use client';

import { useState } from 'react';

import {
  updateSetting,
  toggleFlag,
  saveZone,
  saveCategory,
  retireCategory,
  moveCategory,
} from '@/actions/platform';
import { ActionButton } from '@/components/ui/client';
import { Badge, BTN } from '@/components/ui';
import { taka } from '@/lib/format';
import type { PlatformSettings } from '@/lib/settings';

const INPUT =
  'rounded-[10px] border border-line bg-canvas px-2.5 py-1.5 text-[13px] outline-none placeholder:text-ink3 focus:border-primary-200 disabled:opacity-50';

/* ------------------------------------------------------------------ *
 * settings
 * ------------------------------------------------------------------ */

export function SettingField({
  name,
  value,
  meta,
  disabled,
}: {
  name: keyof PlatformSettings;
  value: number;
  meta: { label: string; help: string; kind: 'money' | 'rate' | 'days' };
  disabled: boolean;
}) {
  const [next, setNext] = useState(String(value));
  const changed = Number(next) !== value;

  /* A rate is stored as a fraction and read as a percentage. Typing "15" and
     meaning 0.15 is the mistake this input exists to make impossible. */
  const display =
    meta.kind === 'rate' ? `${Math.round(value * 100)}%` : meta.kind === 'money' ? taka(value) : `${value} days`;

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <label htmlFor={name} className="text-[13px] font-medium text-ink">
          {meta.label}
        </label>
        <span className="tnum text-[12px] text-ink3">currently {display}</span>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            id={name}
            value={next}
            onChange={(e) => setNext(e.target.value)}
            inputMode="decimal"
            disabled={disabled}
            className={`${INPUT} tnum w-full ${meta.kind === 'money' ? 'pl-6' : ''}`}
          />
          {meta.kind === 'money' ? (
            <span className="absolute top-1/2 left-2.5 -translate-y-1/2 text-[13px] text-ink3">
              ৳
            </span>
          ) : null}
        </div>

        <ActionButton
          action={() => updateSetting(name, Number(next))}
          variant="ghost"
          disabled={disabled || !changed}
        >
          Save
        </ActionButton>
      </div>

      <p className="mt-1 text-[11px] leading-relaxed text-ink3">
        {meta.help}
        {meta.kind === 'rate' ? ' A fraction — 0.15 is fifteen per cent.' : ''}
      </p>
    </div>
  );
}

export function FlagRow({
  flagKey,
  enabled,
  description,
  disabled,
}: {
  flagKey: string;
  enabled: boolean;
  description: string;
  disabled: boolean;
}) {
  return (
    <li className="flex items-center justify-between gap-3 px-4 py-2.5">
      <div className="min-w-0">
        <div className="truncate text-[13px] font-medium">{description || flagKey}</div>
        <div className="tnum truncate text-[11px] text-ink3">{flagKey}</div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {enabled ? <Badge tone="good">on</Badge> : <Badge tone="bad">off</Badge>}
        <ActionButton
          action={() => toggleFlag(flagKey)}
          variant="quiet"
          disabled={disabled}
          confirm={
            enabled
              ? `Turn off "${description || flagKey}"? The app stops offering it.`
              : undefined
          }
        >
          {enabled ? 'Disable' : 'Enable'}
        </ActionButton>
      </div>
    </li>
  );
}

/* ------------------------------------------------------------------ *
 * zones
 * ------------------------------------------------------------------ */

type Zone = { id: string; name: string; deliveryFee: number | null; active: boolean };

export function ZoneEditor({ zones, disabled }: { zones: Zone[]; disabled: boolean }) {
  /* The app's `KNOWN_AREAS` array stops at the eighteen seeded here; the next
     one an operator adds is a real Dhaka thana beside them. */
  const [name, setName] = useState('Mohakhali');
  /* Left empty deliberately. Empty means "charge the platform delivery fee",
     which is the right answer for a new zone — a number typed in here is
     charged to every customer in it until somebody changes it back. */
  const [fee, setFee] = useState('');

  return (
    <div>
      {!disabled ? (
        <div className="flex flex-wrap gap-2 border-b border-line p-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New zone"
            className={`${INPUT} flex-1`}
          />
          <input
            value={fee}
            onChange={(e) => setFee(e.target.value)}
            inputMode="numeric"
            placeholder="fee"
            className={`${INPUT} tnum w-20`}
          />
          <ActionButton
            action={() => saveZone(null, name, fee ? Number(fee) : null, true)}
            variant="ghost"
            disabled={!name.trim()}
          >
            Add
          </ActionButton>
        </div>
      ) : null}

      <ul className="max-h-[340px] divide-y divide-line2 overflow-y-auto">
        {zones.map((zone) => (
          <li key={zone.id} className="flex items-center justify-between gap-3 px-4 py-2">
            <span className="min-w-0 flex-1 truncate text-[13px]">{zone.name}</span>
            <span className="tnum shrink-0 text-[12px] text-ink3">
              {zone.deliveryFee != null ? taka(zone.deliveryFee) : 'default fee'}
            </span>
            {zone.active ? <Badge tone="good">active</Badge> : <Badge>off</Badge>}
            <ActionButton
              action={() => saveZone(zone.id, zone.name, zone.deliveryFee, !zone.active)}
              variant="quiet"
              disabled={disabled}
            >
              {zone.active ? 'Disable' : 'Enable'}
            </ActionButton>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * taxonomy
 * ------------------------------------------------------------------ */

type Category = { id: string; key: string; label: string; emoji: string; retired: boolean };

export function TaxonomyEditor({
  categories,
  disabled,
}: {
  categories: Category[];
  disabled: boolean;
}) {
  /* A category the seeded taxonomy is missing, so adding it is a real edit
     rather than a duplicate the server would refuse. */
  const [label, setLabel] = useState('Bhorta');
  const [emoji, setEmoji] = useState('🥣');

  return (
    <div>
      {!disabled ? (
        <div className="flex flex-wrap gap-2 border-b border-line p-3">
          <input
            value={emoji}
            onChange={(e) => setEmoji(e.target.value)}
            placeholder="🍛"
            className={`${INPUT} w-14 text-center`}
            aria-label="Emoji"
          />
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="New category"
            className={`${INPUT} flex-1`}
          />
          <ActionButton
            action={() => saveCategory(null, label, emoji)}
            variant="ghost"
            disabled={!label.trim()}
          >
            Add
          </ActionButton>
        </div>
      ) : null}

      <ul className="max-h-[340px] divide-y divide-line2 overflow-y-auto">
        {categories.map((category, i) => (
          <li
            key={category.id}
            className={`flex items-center gap-2 px-4 py-2 ${category.retired ? 'opacity-50' : ''}`}
          >
            <span className="w-6 shrink-0 text-center text-[15px]" aria-hidden>
              {category.emoji}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px]">{category.label}</span>
              <span className="tnum block truncate text-[10.5px] text-ink3">
                {category.key}
              </span>
            </span>

            {!disabled ? (
              <span className="flex shrink-0 items-center gap-0.5">
                <button
                  type="button"
                  className={`${BTN.quiet} !px-1.5`}
                  aria-label="Move up"
                  onClick={() => moveCategory(category.id, -1)}
                  disabled={i === 0}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className={`${BTN.quiet} !px-1.5`}
                  aria-label="Move down"
                  onClick={() => moveCategory(category.id, 1)}
                  disabled={i === categories.length - 1}
                >
                  ↓
                </button>
              </span>
            ) : null}

            <ActionButton
              action={() => retireCategory(category.id, !category.retired)}
              variant="quiet"
              disabled={disabled}
            >
              {category.retired ? 'Restore' : 'Retire'}
            </ActionButton>
          </li>
        ))}
      </ul>
    </div>
  );
}
