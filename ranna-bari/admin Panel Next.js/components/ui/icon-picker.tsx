'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { EMOJI, EMOJI_DEFAULT_GROUP, EMOJI_GROUPS } from '@/lib/emoji-catalogue';

/** How big an uploaded icon is allowed to be, in pixels. */
const ICON_MAX = 128;

/**
 * An image file, as a value this platform can store.
 *
 * There is no upload endpoint anywhere in this codebase — every image field
 * holds a URL — so rather than invent storage, buckets and credentials for
 * pictures drawn at 18px, the file becomes the value: downscaled onto a
 * canvas and exported as a PNG data URI.
 *
 * The downscale is the point, not a nicety. It bounds what anybody can put in
 * the database regardless of what they picked: a 4MB camera JPEG and a 2KB
 * PNG both come out a few kilobytes.
 *
 * Contained, never cropped — an icon centre-cropped to a square has usually
 * lost the thing that made it recognisable. PNG because transparency is what
 * makes an icon sit on any background.
 */
export async function fileToIconValue(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('That is not an image.');
  }

  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('That image could not be read.'));
      el.src = url;
    });

    /* An SVG with no intrinsic size draws as 0×0 and yields a blank canvas,
       which would be filed as a perfectly valid invisible icon. */
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) throw new Error('That image has no size the browser can read.');

    const scale = Math.min(ICON_MAX / w, ICON_MAX / h, 1);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('This browser cannot resize images.');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    return canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}

export type LibraryIcon = {
  id: string;
  value: string;
  label: string;
  kind: 'emoji' | 'image';
  retired: boolean;
  uses?: number;
};

/**
 * One picture, rendered however its kind says to.
 *
 * Every field stores an opaque string, so this is the single place that knows
 * a URL means an <img> and anything else means text. Without it each caller
 * would decide again, and one of them would eventually print a URL as a label.
 */
export function IconGlyph({ value, size = 18 }: { value: string; size?: number }) {
  if (!value) return <span className="text-ink3">—</span>;

  /* A data URI counts too — an uploaded icon is stored as one, and without
     this it would render as several kilobytes of base64 printed as text. */
  if (/^(?:https?:\/\/|data:image\/)/i.test(value)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={value}
        alt=""
        width={size}
        height={size}
        className="inline-block object-contain align-middle"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span aria-hidden style={{ fontSize: size }}>
      {value}
    </span>
  );
}

/**
 * Pick a picture from the shared library, or bring your own.
 *
 * Every emoji field in this console used to be a bare text box. That works for
 * whoever set the list up and for nobody after: you cannot see what the
 * platform already uses, so a new category gets 🍛 while the one above it has
 * 🍚 and the set drifts into near-identical pictures nobody chose.
 *
 * Offering the library first is the whole point. The custom box is still there
 * — a genuinely new picture has to enter somehow — but it is below the grid
 * rather than instead of it, so the default action is "use one of ours".
 */
export function IconPicker({
  value,
  onChange,
  icons,
  label = 'Icon',
}: {
  value: string;
  onChange: (value: string) => void;
  icons: LibraryIcon[];
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'library' | 'all'>('library');
  const [group, setGroup] = useState(EMOJI_DEFAULT_GROUP);
  const [query, setQuery] = useState('');
  const [custom, setCustom] = useState('');
  const box = useRef<HTMLDivElement>(null);

  /* Click-away and Escape, because a popover that can only be closed by
     choosing something traps anybody who opened it by accident. */
  useEffect(() => {
    if (!open) return;

    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const needle = query.trim().toLowerCase();

  const shown = useMemo(() => {
    const live = icons.filter((i) => !i.retired);
    if (!needle) return live;
    return live.filter((i) => i.label.includes(needle) || i.value.includes(needle));
  }, [icons, needle]);

  /* One group at a time unless somebody is searching. Putting all 1,914 in
     the DOM to draw a grid nobody scrolls to the end of is how a popover
     becomes slow to open. */
  const catalogue = useMemo(() => {
    if (needle) return EMOJI.filter(([, name]) => name.includes(needle)).slice(0, 300);
    return EMOJI.filter(([, , g]) => g === group);
  }, [needle, group]);

  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        aria-label={`${label}: ${value || 'none chosen'}`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-[34px] w-14 items-center justify-center rounded-[9px] border border-line bg-raised hover:border-primary-200"
      >
        <IconGlyph value={value} />
      </button>

      {open ? (
        <div className="absolute left-0 top-[38px] z-30 w-[300px] rounded-[12px] border border-line bg-raised p-2.5 shadow-lg">
          {/* The library first, because reaching for what the platform
              already uses is the behaviour this whole thing exists to
              encourage. All of Unicode is a deliberate second step. */}
          <div className="mb-2 flex gap-1 rounded-[8px] bg-sunken p-0.5">
            {(['library', 'all'] as const).map((which) => (
              <button
                key={which}
                type="button"
                onClick={() => setTab(which)}
                className={`flex-1 rounded-[6px] px-2 py-1 text-[12px] font-semibold ${
                  tab === which ? 'bg-raised text-ink shadow-sm' : 'text-ink3 hover:text-ink2'
                }`}
              >
                {which === 'library' ? `Library (${icons.filter((i) => !i.retired).length})` : 'All emoji'}
              </button>
            ))}
          </div>

          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tab === 'library' ? 'Search — fire, rice, sweet…' : 'Search all emoji…'}
            className="mb-2 w-full rounded-[8px] border border-line bg-sunken px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-primary-200"
          />

          {tab === 'all' && !needle ? (
            <div className="mb-2 flex flex-wrap gap-1">
              {EMOJI_GROUPS.map((name, i) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => setGroup(i)}
                  className={`rounded-[6px] px-1.5 py-0.5 text-[10.5px] ${
                    group === i ? 'bg-primary-50 text-primary' : 'text-ink3 hover:text-ink2'
                  }`}
                >
                  {name.replace(' & ', ' ')}
                </button>
              ))}
            </div>
          ) : null}

          {tab === 'library' ? (
            shown.length ? (
              <div className="grid max-h-[180px] grid-cols-8 gap-1 overflow-y-auto">
                {shown.map((icon) => (
                  <button
                    key={icon.id}
                    type="button"
                    title={icon.label || icon.value}
                    aria-label={icon.label || icon.value}
                    onClick={() => {
                      onChange(icon.value);
                      setOpen(false);
                      setQuery('');
                    }}
                    className={`flex h-8 items-center justify-center rounded-[7px] border ${
                      value === icon.value
                        ? 'border-primary bg-primary-50'
                        : 'border-transparent hover:bg-sunken'
                    }`}
                  >
                    <IconGlyph value={icon.value} size={17} />
                  </button>
                ))}
              </div>
            ) : (
              <p className="px-1 py-3 text-center text-[12px] text-ink3">
                Nothing in the library matches “{query.trim()}”. Try{' '}
                <button
                  type="button"
                  onClick={() => setTab('all')}
                  className="font-semibold text-primary hover:underline"
                >
                  all emoji
                </button>
                .
              </p>
            )
          ) : catalogue.length ? (
            <div className="grid max-h-[180px] grid-cols-8 gap-1 overflow-y-auto">
              {catalogue.map(([emoji, name]) => (
                <button
                  key={emoji}
                  type="button"
                  title={name}
                  aria-label={name}
                  onClick={() => {
                    onChange(emoji);
                    setOpen(false);
                    setQuery('');
                  }}
                  className={`flex h-8 items-center justify-center rounded-[7px] border text-[17px] ${
                    value === emoji
                      ? 'border-primary bg-primary-50'
                      : 'border-transparent hover:bg-sunken'
                  }`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          ) : (
            <p className="px-1 py-3 text-center text-[12px] text-ink3">
              No emoji matches “{query.trim()}”.
            </p>
          )}

          {/* A genuinely new picture has to enter somewhere. Below the grid,
              not instead of it, so reaching for the library is the default. */}
          <div className="mt-2 border-t border-line2 pt-2">
            <label className="mb-1 block text-[10.5px] uppercase tracking-wide text-ink3">
              Or paste an emoji or image URL
            </label>
            <div className="flex gap-1.5">
              <input
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                placeholder="🥣  or  https://…/icon.png"
                className="min-w-0 flex-1 rounded-[8px] border border-line bg-sunken px-2.5 py-1.5 text-[12.5px] text-ink outline-none focus:border-primary-200"
              />
              <label
                title="Upload an image"
                className="shrink-0 cursor-pointer rounded-[8px] border border-line px-2.5 py-1.5 text-[12px] font-semibold text-ink2 hover:border-primary-200 hover:text-primary"
              >
                Upload
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (!file) return;
                    try {
                      onChange(await fileToIconValue(file));
                      setOpen(false);
                    } catch {
                      /* The field keeps whatever it had; the library page is
                         where uploading is the main job and says why. */
                    }
                  }}
                />
              </label>

              <button
                type="button"
                disabled={!custom.trim()}
                onClick={() => {
                  onChange(custom.trim());
                  setCustom('');
                  setOpen(false);
                }}
                className="shrink-0 rounded-[8px] border border-line px-2.5 py-1.5 text-[12px] font-semibold text-ink2 hover:border-primary-200 hover:text-primary disabled:opacity-40"
              >
                Use
              </button>
            </div>
            <p className="mt-1 text-[10.5px] text-ink3">
              Used here straight away. Add it to the library on{' '}
              <span className="text-ink2">Emoji &amp; icons</span> to offer it everywhere.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
