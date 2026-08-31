import Link from 'next/link';
import { notFound } from 'next/navigation';

import { get } from '@/lib/backend';
import { taka } from '@/lib/format';
import {
  Badge,
  Card,
  Field,
  Grid,
  LinkButton,
  Money,
  PageHeader,
  Stat,
} from '@/components/ui';
import { requirePage } from '@/lib/guard';

export const dynamic = 'force-dynamic';

type Dish = {
  id: string;
  kitchenId: string;
  name: string;
  description: string;
  price: number;
  image: string;
  tags: unknown;
  available: boolean;
};

type DishDetail = {
  dish: Dish;
  kitchen: {
    id: string;
    name: string;
    area: string;
    ownerName: string;
    isVerified: boolean;
    isOpen: boolean;
  } | null;
  siblings: Dish[];
  store: { id: string; name: string } | null;
};

/** Tags are an array in Mongo and a JSON string in the panel's mirror. */
function tagsOf(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw !== 'string') return [];
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value.map(String) : [];
  } catch {
    return [];
  }
}

export default async function DishDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePage('kitchen.read');
  const { id } = await params;

  const data = await get<DishDetail>(`/dishes/${id}`).catch(() => null);
  if (!data) notFound();

  const { dish, kitchen, siblings, store } = data;
  const tags = tagsOf(dish.tags);

  /* Only an absolute http(s) URL is worth putting in an `<img>`. Anything else
     — most often a `blob:` from the web picker — renders as a broken frame
     that looks like the panel's fault rather than the record's. */
  const servable = /^https?:\/\//i.test(dish.image ?? '');

  /* Where this price sits on its own menu. A number is high or low against
     the cook's other dishes, not against the platform. */
  const prices = [dish, ...siblings].map((d) => d.price).sort((a, b) => a - b);
  const median = prices.length ? prices[Math.floor(prices.length / 2)] : dish.price;
  const offCount = siblings.filter((d) => !d.available).length + (dish.available ? 0 : 1);
  const menuSize = siblings.length + 1;

  return (
    <>
      <PageHeader
        title={dish.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            {kitchen ? (
              <Link href={`/kitchens/${kitchen.id}`} className="hover:text-primary">
                {kitchen.name}
              </Link>
            ) : (
              <span className="text-ink3">unknown kitchen</span>
            )}
            <span className="text-ink3">·</span>
            <span>{taka(dish.price)}</span>
            <span className="text-ink3">·</span>
            {dish.available ? (
              <Badge tone="good">Available today</Badge>
            ) : (
              <Badge tone="neutral">Switched off</Badge>
            )}
          </span>
        }
        actions={
          <>
            {kitchen ? (
              <LinkButton href={`/kitchens/${kitchen.id}`}>The kitchen →</LinkButton>
            ) : null}
            <LinkButton href="/menu">← All menus</LinkButton>
          </>
        }
      />

      <Grid cols={4}>
        <Stat label="Price" value={taka(dish.price)} />
        <Stat
          label="Against this menu"
          value={
            dish.price === median
              ? 'Mid'
              : dish.price > median
                ? `+${taka(dish.price - median)}`
                : `−${taka(median - dish.price)}`
          }
          sub={`median dish here is ${taka(median)}`}
        />
        <Stat
          label="Today"
          value={dish.available ? 'On' : 'Off'}
          tone={dish.available ? 'good' : 'warn'}
          sub={
            dish.available
              ? 'A customer can order this now'
              : 'On the menu but not orderable'
          }
        />
        <Stat
          label="Rest of the menu"
          value={menuSize}
          sub={offCount > 0 ? `${offCount} switched off` : 'all of it orderable'}
        />
      </Grid>

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Card title="The dish" className="lg:col-span-2">
          {servable ? (
            /* Not next/image: these are arbitrary cook-supplied URLs on hosts
               the panel does not control, and the optimiser would need each
               one allow-listed. */
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={dish.image}
              alt=""
              className="mb-3 h-44 w-full rounded-[10px] border border-line object-cover"
            />
          ) : dish.image ? (
            /* A `blob:` or `file:` URL is a handle into one browser tab's
               memory, not a location. It cannot load here, on another device,
               or in the app itself once that tab is gone. */
            <div className="mb-3 rounded-[10px] border border-saffron-100 bg-saffron-50 px-3.5 py-3 text-[12.5px] leading-relaxed text-ink2">
              <strong className="text-saffron">This image cannot load anywhere.</strong>{' '}
              It was saved as <code className="break-all">{dish.image.slice(0, 48)}…</code>,
              which is a handle into the memory of the one browser tab that picked the
              file. It is already dead — in the app too, not just here. The cook needs
              to re-add the photo from their phone.
            </div>
          ) : null}

          <p className="text-[13.5px] leading-relaxed whitespace-pre-wrap text-ink2">
            {dish.description || (
              <span className="text-ink3">
                No description. The cook has not written one.
              </span>
            )}
          </p>

          {tags.length ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-[8px] border border-line bg-sunken px-2 py-0.5 text-[11.5px] text-ink2"
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
        </Card>

        <Card title="Where it comes from">
          <Field label="Kitchen">
            {kitchen ? (
              <Link href={`/kitchens/${kitchen.id}`} className="hover:text-primary">
                {kitchen.name}
              </Link>
            ) : (
              <span className="text-ink3">—</span>
            )}
          </Field>
          <Field label="Cook">{kitchen?.ownerName ?? <span className="text-ink3">—</span>}</Field>
          <Field label="Area">{kitchen?.area ?? <span className="text-ink3">—</span>}</Field>
          <Field label="Verified">
            {kitchen?.isVerified ? (
              <Badge tone="good">Yes</Badge>
            ) : (
              <Badge tone="neutral">No</Badge>
            )}
          </Field>
          <Field label="Kitchen open">
            {kitchen?.isOpen ? (
              <Badge tone="good">Open</Badge>
            ) : (
              <Badge tone="neutral">Closed</Badge>
            )}
          </Field>
          <Field label="Shop">
            {store ? (
              <Link href={`/stores/${store.id}`} className="hover:text-primary">
                {store.name || 'this cook’s shop'}
              </Link>
            ) : (
              <span className="text-ink3">No shop</span>
            )}
          </Field>
          <Field label="Dish id">
            <code className="text-[11.5px] text-ink2">{dish.id}</code>
          </Field>
          <p className="mt-2 text-[12px] leading-relaxed text-ink3">
            The availability switch belongs to the cook, in their app&rsquo;s Menu tab.
            Nothing in the panel writes it.
          </p>
        </Card>
      </div>

      <Card
        className="mt-3"
        title="The rest of this menu"
        subtitle={
          kitchen ? `Everything else ${kitchen.name} sells` : 'The same kitchen'
        }
        pad={false}
      >
        <div className="scroll-x">
          <table className="tbl">
            <thead>
              <tr>
                <th>Dish</th>
                <th style={{ textAlign: 'right' }}>Price</th>
                <th>Today</th>
              </tr>
            </thead>
            <tbody>
              {siblings.map((other) => (
                <tr key={other.id} className={other.available ? undefined : 'opacity-60'}>
                  <td className="max-w-[320px]">
                    <Link
                      href={`/menu/${other.id}`}
                      className="block truncate font-medium hover:text-primary"
                    >
                      {other.name}
                    </Link>
                    {other.description ? (
                      <span className="block truncate text-[11.5px] text-ink3">
                        {other.description}
                      </span>
                    ) : null}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <Money amount={other.price} />
                  </td>
                  <td>
                    {other.available ? (
                      <Badge tone="good">On</Badge>
                    ) : (
                      <Badge tone="neutral">Off</Badge>
                    )}
                  </td>
                </tr>
              ))}
              {siblings.length === 0 ? (
                <tr>
                  <td colSpan={3} className="py-6 text-center text-[13px] text-ink3">
                    This is the only dish on the menu.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
