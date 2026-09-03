'use client';

import { useMemo, useState } from 'react';

import { addIcon, renameIcon, retireIcon } from '@/actions/platform';
import { ActionButton } from '@/components/ui/client';
import { IconGlyph, fileToIconValue, type LibraryIcon } from '@/components/ui/icon-picker';

const INPUT =
  'rounded-[9px] border border-line bg-raised px-2.5 py-1.5 text-[13px] text-ink ' +
  'outline-none focus:border-primary-200';

/**
 * The library every picture-field picks from.
 *
 * A label is not decoration here — it is what the picker searches. An icon
 * added without one is findable only by scrolling, which is the problem this
 * library exists to solve, so the field is beside the value rather than
 * tucked behind an edit.
 */
export function IconLibrary({
  icons,
  disabled,
}: {
  icons: LibraryIcon[];
  disabled: boolean;
}) {
  const [value, setValue] = useState('');
  const [label, setLabel] = useState('');
  const [note, setNote] = useState('');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return icons;
    return icons.filter((i) => i.label.includes(needle) || i.value.includes(needle));
  }, [icons, query]);

  return (
    <div>
      {!disabled ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="🍛 or https://…/icon.png"
            className={`${INPUT} w-[190px]`}
            aria-label="Emoji or image URL"
          />
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="What to search it by — curry, rice…"
            className={`${INPUT} min-w-0 flex-1`}
            aria-label="Search words"
          />
          {/* A file, for when the platform wants its own artwork rather than
              whatever a reader's phone draws for 🔥. */}
          <label className="cursor-pointer rounded-[9px] border border-line px-2.5 py-1.5 text-[12.5px] font-semibold text-ink2 hover:border-primary-200 hover:text-primary">
            Upload
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                /* Cleared straight away so choosing the same file twice still
                   fires a change event. */
                e.target.value = '';
                if (!file) return;
                try {
                  setNote('');
                  setValue(await fileToIconValue(file));
                } catch (error) {
                  setNote(error instanceof Error ? error.message : 'That file could not be read.');
                }
              }}
            />
          </label>

          <ActionButton
            action={async () => {
              const out = await addIcon(value, label);
              setValue('');
              setLabel('');
              setNote('');
              return out;
            }}
            variant="ghost"
            disabled={!value.trim()}
          >
            Add
          </ActionButton>

          {/* What is about to be added, at the size it will actually be
              drawn. A 128px source that turns out to be illegible at 18 is
              worth seeing before it joins the library. */}
          {value ? (
            <span className="flex items-center gap-2 text-[11.5px] text-ink3">
              <IconGlyph value={value} size={18} />
              {value.startsWith('data:') ? 'uploaded image' : null}
            </span>
          ) : null}

          {note ? <span className="w-full text-[11.5px] text-primary">{note}</span> : null}
        </div>
      ) : null}

      <div className="border-b border-line p-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the library…"
          className={`${INPUT} w-full`}
        />
      </div>

      {shown.length === 0 ? (
        <p className="p-6 text-center text-[13px] text-ink3">
          Nothing in the library matches “{query.trim()}”.
        </p>
      ) : (
        <ul className="divide-y divide-line2">
          {shown.map((icon) => (
            <li
              key={icon.id}
              className={`flex items-center gap-3 px-4 py-2.5 ${icon.retired ? 'opacity-50' : ''}`}
            >
              <span className="flex w-8 shrink-0 justify-center">
                <IconGlyph value={icon.value} size={20} />
              </span>

              {editing === icon.id ? (
                <>
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    className={`${INPUT} flex-1`}
                    aria-label="Search words"
                  />
                  <ActionButton
                    action={async () => {
                      const out = await renameIcon(icon.id, draft);
                      setEditing(null);
                      return out;
                    }}
                    variant="ghost"
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
                    <span className="block truncate text-[13px]">
                      {icon.label || <span className="text-ink3">no search words</span>}
                    </span>
                    <span className="block text-[10.5px] text-ink3">
                      {icon.kind === 'image' ? 'image' : 'emoji'}
                    </span>
                  </span>

                  {/* Where it is drawn today. Retiring one that nothing uses
                      costs nothing; retiring one with eleven behind it is a
                      different decision. */}
                  <span
                    className={`tnum shrink-0 text-[12px] ${icon.uses ? 'text-ink2' : 'text-ink3'}`}
                    title={
                      icon.uses
                        ? `${icon.uses} categories or specialties use this`
                        : 'Nothing uses this yet'
                    }
                  >
                    {icon.uses || '—'}
                  </span>

                  {!disabled ? (
                    <span className="flex shrink-0 items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(icon.id);
                          setDraft(icon.label);
                        }}
                        className="px-2 text-[12px] text-ink3 hover:text-primary"
                      >
                        Rename
                      </button>
                      <ActionButton
                        action={() => retireIcon(icon.id, !icon.retired)}
                        variant="ghost"
                      >
                        {icon.retired ? 'Restore' : 'Retire'}
                      </ActionButton>
                    </span>
                  ) : null}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
