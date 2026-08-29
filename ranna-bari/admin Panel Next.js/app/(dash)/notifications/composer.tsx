'use client';

import { useState } from 'react';

import { broadcast } from '@/actions/platform';
import { ActionButton } from '@/components/ui/client';
import { bnNum } from '@/lib/format';

const INPUT =
  'w-full rounded-[10px] border border-line bg-canvas px-2.5 py-1.5 text-[13px] outline-none placeholder:text-ink3 focus:border-primary-200';

/**
 * Write one broadcast, and see it the way both halves of the audience will.
 *
 * The Bengali preview is not decoration. Roughly half this platform reads
 * Bengali, and a message written in English and shipped untranslated reaches
 * them as noise — so the preview shows the Bengali frame with Bengali
 * numerals, which is the part an English speaker cannot eyeball.
 */
export function Composer({ zones }: { zones: string[] }) {
  const [audience, setAudience] = useState<'customer' | 'cook'>('customer');
  const [zone, setZone] = useState('');
  /* A monsoon delay notice — the broadcast this desk actually sends most, and
     one carrying enough figures (a road number, two waits, a cut-off) that the
     Bengali preview below has something to change. */
  const [title, setTitle] = useState('Heavy rain — deliveries running 30–40 minutes late');
  const [body, setBody] = useState(
    'Waterlogging on Mirpur Road and around Dhanmondi 27 is holding riders up. Kitchens are cooking to time — please allow an extra 30 minutes tonight. Orders placed after 10pm may move to tomorrow.',
  );

  /* Numerals are the one thing that has to change even when the words do not.
     "৳500 added" reads as half-translated with Latin digits in it. */
  const bnPreview = (text: string) => text.replace(/\d+/g, (d) => bnNum(d));

  return (
    <div className="space-y-3">
      <div>
        <div className="label mb-1.5">Audience</div>
        <div className="flex gap-2">
          {(['customer', 'cook'] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setAudience(option)}
              className={`flex-1 rounded-[10px] border px-3 py-1.5 text-[13px] font-semibold capitalize ${
                audience === option
                  ? 'border-primary-200 bg-primary-50 text-primary'
                  : 'border-line bg-raised text-ink2 hover:bg-sunken'
              }`}
            >
              {option}s
            </button>
          ))}
        </div>
      </div>

      <div>
        <label htmlFor="zone" className="label mb-1.5 block">
          Zone
        </label>
        <select
          id="zone"
          value={zone}
          onChange={(e) => setZone(e.target.value)}
          className={INPUT}
        >
          <option value="">Everywhere</option>
          {zones.map((z) => (
            <option key={z} value={z}>
              {z}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="title" className="label mb-1.5 block">
          Title
        </label>
        <input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Eid delivery hours"
          className={INPUT}
          maxLength={60}
        />
      </div>

      <div>
        <label htmlFor="body" className="label mb-1.5 block">
          Body
        </label>
        <textarea
          id="body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          placeholder="Kitchens close at 4pm on the 10th. Order before 2pm for same-day delivery."
          className={`${INPUT} resize-y`}
          maxLength={200}
        />
      </div>

      {title || body ? (
        <div className="space-y-2">
          <div className="label">Preview</div>

          <div className="rounded-[10px] border border-line bg-sunken p-2.5">
            <div className="label mb-1">English</div>
            <div className="text-[13px] font-semibold text-ink">{title || '—'}</div>
            <div className="text-[12px] text-ink2">{body}</div>
          </div>

          <div className="rounded-[10px] border border-line bg-sunken p-2.5">
            <div className="label mb-1">Bengali numerals</div>
            <div className="bn text-[13px] font-semibold text-ink" lang="bn">
              {bnPreview(title) || '—'}
            </div>
            <div className="bn text-[12px] text-ink2" lang="bn">
              {bnPreview(body)}
            </div>
          </div>
        </div>
      ) : null}

      <ActionButton
        action={() => broadcast(audience, zone || null, title, body)}
        variant="primary"
        disabled={!title.trim() || !body.trim()}
        confirm={`Send to ${audience}s${zone ? ` in ${zone}` : ' everywhere'}?`}
      >
        Send broadcast
      </ActionButton>

      <p className="text-[11px] leading-relaxed text-ink3">
        A broadcast whose title is already out and unread is refused rather than
        duplicated — the dedupe key is built from the title, so re-wording the body
        does not defeat it.
      </p>
    </div>
  );
}
