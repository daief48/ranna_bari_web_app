'use client';

import { useState } from 'react';

import { moveSpecialty, retireSpecialty, saveSpecialty } from '@/actions/platform';
import { ActionButton } from '@/components/ui/client';

export type Specialty = {
  id: string;
  key: string;
  label: string;
  emoji: string;
  order: number;
  retired: boolean;
  kitchens: number;
};

const INPUT =
  'rounded-[9px] border border-line bg-raised px-2.5 py-1.5 text-[13px] text-ink ' +
  'outline-none focus:border-primary-200';

/**
 * The list a cook picks from when they say what they cook best.
 *
 * Editing a label is safe and editing a key is not, so the key is shown and
 * never offered: a kitchen stores its specialty as that string on its own row,
 * and renaming it would leave every kitchen that chose it pointing at nothing.
 * The only way out of the list is retirement, which stops it being offered
 * without disturbing anybody already standing on it.
 */
export function SpecialtyEditor({
  specialties,
  disabled,
}: {
  specialties: Specialty[];
  disabled: boolean;
}) {
  const [label, setLabel] = useState('');
  const [emoji, setEmoji] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ label: '', emoji: '' });

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
            placeholder="A new specialty — e.g. Kacchi & Tehari"
            className={`${INPUT} flex-1`}
          />
          <ActionButton
            action={() => saveSpecialty(null, label, emoji)}
            variant="ghost"
            disabled={!label.trim()}
          >
            Add
          </ActionButton>
        </div>
      ) : null}

      <ul className="divide-y divide-line2">
        {specialties.map((specialty, i) => {
          const isEditing = editing === specialty.id;

          return (
            <li
              key={specialty.id}
              className={`flex items-center gap-3 px-4 py-2.5 ${
                specialty.retired ? 'opacity-50' : ''
              }`}
            >
              {isEditing ? (
                <>
                  <input
                    value={draft.emoji}
                    onChange={(e) => setDraft({ ...draft, emoji: e.target.value })}
                    className={`${INPUT} w-14 text-center`}
                    aria-label="Emoji"
                  />
                  <input
                    value={draft.label}
                    onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                    className={`${INPUT} flex-1`}
                    aria-label="Label"
                  />
                  <ActionButton
                    action={async () => {
                      const out = await saveSpecialty(specialty.id, draft.label, draft.emoji);
                      setEditing(null);
                      return out;
                    }}
                    variant="ghost"
                    disabled={!draft.label.trim()}
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
                  <span className="w-6 shrink-0 text-center text-[15px]" aria-hidden>
                    {specialty.emoji}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">
                      {specialty.label}
                    </span>
                    {/* The stored string, shown because it is the join and
                        explains why the label is the only editable half. */}
                    <span className="tnum block truncate text-[10.5px] text-ink3">
                      {specialty.key}
                    </span>
                  </span>

                  {/* The number that decides whether retiring is safe. */}
                  <span
                    className={`tnum shrink-0 text-[12px] ${
                      specialty.kitchens ? 'text-ink2' : 'text-ink3'
                    }`}
                    title={
                      specialty.kitchens
                        ? `${specialty.kitchens} kitchens say this is what they cook best`
                        : 'No kitchen has chosen this'
                    }
                  >
                    {specialty.kitchens || '—'}
                  </span>

                  {!disabled ? (
                    <span className="flex shrink-0 items-center gap-0.5">
                      <button
                        type="button"
                        aria-label="Move up"
                        disabled={i === 0}
                        onClick={() => moveSpecialty(specialty.id, 'up')}
                        className="px-1.5 text-[13px] text-ink3 hover:text-ink disabled:opacity-30"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        aria-label="Move down"
                        disabled={i === specialties.length - 1}
                        onClick={() => moveSpecialty(specialty.id, 'down')}
                        className="px-1.5 text-[13px] text-ink3 hover:text-ink disabled:opacity-30"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(specialty.id);
                          setDraft({ label: specialty.label, emoji: specialty.emoji });
                        }}
                        className="px-2 text-[12px] text-ink3 hover:text-primary"
                      >
                        Rename
                      </button>
                      <ActionButton
                        action={() => retireSpecialty(specialty.id, !specialty.retired)}
                        variant="ghost"
                      >
                        {specialty.retired ? 'Restore' : 'Retire'}
                      </ActionButton>
                    </span>
                  ) : null}
                </>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
