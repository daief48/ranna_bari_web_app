import { currentUser } from '@/lib/auth';
import { can } from '@/lib/domain';
import { BackendError, get } from '@/lib/backend';
import { getFlags, type PlatformSettings } from '@/lib/settings';
import { Card, GapNote, PageHeader, Badge } from '@/components/ui';
import { type LibraryIcon } from '@/components/ui/icon-picker';

import { SettingField, FlagRow, ZoneEditor, TaxonomyEditor } from './editors';
import { requirePage } from '@/lib/guard';

export const metadata = { title: 'Configuration · RannaBari Admin' };
export const dynamic = 'force-dynamic';

type SettingMeta = { label: string; help: string; kind: 'money' | 'rate' | 'days' | 'count' };

type Config = {
  settings: PlatformSettings;
  meta: Record<keyof PlatformSettings, SettingMeta>;
};

type Zone = { id: string; name: string; deliveryFee: number | null; active: boolean };
type Category = { id: string; key: string; label: string; emoji: string; retired: boolean };

/**
 * What is left of this screen when the service behind it is not there.
 *
 * Names no process, address or command. The address in particular was worth
 * removing on its own: it is infrastructure detail on a screen anybody with a
 * config capability can open, and it told an operator nothing they could use.
 */
function BackendDown() {
  return (
    <GapNote>
      <strong>Configuration cannot be loaded right now.</strong> The service that
      holds these settings is not responding, so nothing here can be read or
      changed. Try again in a moment, and let your technical team know if it
      continues.
    </GapNote>
  );
}

export default async function SettingsPage() {
  await requirePage('config.read');
  const user = await currentUser();
  const canWrite = can(user?.role ?? '', 'config.write');

  let config: Config;
  let zones: Zone[];
  let taxonomy: Category[];
  /* Flags are the one read left on Prisma, and only because `toggleFlag` is:
     the backend serves them but has no route that writes one, and a list read
     from Mongo with a switch that writes to SQLite is a switch that never
     moves. Read and write stay on the same side of the wire until there is an
     endpoint for the write. */
  let flags: Awaited<ReturnType<typeof getFlags>>;
  let icons: LibraryIcon[] = [];

  try {
    const [remote, zoneList, categories, flagRows, library] = await Promise.all([
      get<Config>('/settings'),
      get<{ zones: Zone[] }>('/zones'),
      get<{ taxonomy: Category[] }>('/taxonomy'),
      getFlags(),
      /* The picture library, so the category editor can offer it rather than
         asking somebody to remember which emoji the platform already uses. */
      get<{ icons: LibraryIcon[] }>('/icons'),
    ]);
    config = remote;
    zones = zoneList.zones;
    taxonomy = categories.taxonomy;
    flags = flagRows;
    icons = library.icons;
  } catch (error) {
    if (error instanceof BackendError && error.status === 0) {
      return (
        <>
          <PageHeader
            title="Configuration"
            subtitle="Fees, commission and the limits every order is held to"
          />
          <BackendDown />
        </>
      );
    }
    throw error;
  }

  const { settings } = config;

  const moneyKeys: (keyof PlatformSettings)[] = ['deliveryFee', 'platformFee', 'payoutMinimum'];
  const rateKeys: (keyof PlatformSettings)[] = [
    'commissionCod',
    'commissionMeal',
    'commissionStore',
    'commissionRequest',
  ];
  const dayKeys: (keyof PlatformSettings)[] = [
    'escrowAutoReleaseDays',
    'stockAlarmDays',
    'requestExpiryDays',
  ];
  const limitKeys: (keyof PlatformSettings)[] = ['maxQtyPerItem'];

  return (
    <>
      <PageHeader
        title="Configuration"
        subtitle="Fees, commission and the limits every order is held to"
      />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card title="Fees" subtitle="Charged once per basket, not once per kitchen">
          <div className="space-y-3">
            {moneyKeys.map((key) => (
              <SettingField
                key={key}
                name={key}
                value={settings[key]}
                meta={config.meta[key]}
                disabled={!canWrite}
              />
            ))}
          </div>
        </Card>

        <Card
          title="Commission"
          subtitle="The platform's cut of an order's food value, per system"
        >
          <div className="mb-3 rounded-[10px] border border-saffron-100 bg-saffron-50 px-3 py-2 text-[12px] leading-relaxed text-ink2">
            A rate here is taken from the food value of an order, never from the
            delivery fee. Set one to zero and that system earns the business
            nothing.
          </div>
          <div className="space-y-3">
            {rateKeys.map((key) => (
              <SettingField
                key={key}
                name={key}
                value={settings[key]}
                meta={config.meta[key]}
                disabled={!canWrite}
              />
            ))}
          </div>
        </Card>

        <Card
          title="Ordering limits"
          subtitle="What one basket is allowed to ask for"
        >
          <div className="mb-3 rounded-[10px] border border-saffron-100 bg-saffron-50 px-3 py-2 text-[12px] leading-relaxed text-ink2">
            A cook selling four cakes a day can still set a tighter{' '}
            a lower limit of its own on the product itself — the lower of the two
            wins. This is the ceiling for everything that does not say.
          </div>
          <div className="space-y-3">
            {limitKeys.map((key) => (
              <SettingField
                key={key}
                name={key}
                value={settings[key]}
                meta={config.meta[key]}
                disabled={!canWrite}
              />
            ))}
          </div>
        </Card>

        <Card title="Timings" subtitle="How long the platform waits before it acts">
          <div className="space-y-3">
            {dayKeys.map((key) => (
              <SettingField
                key={key}
                name={key}
                value={settings[key]}
                meta={config.meta[key]}
                disabled={!canWrite}
              />
            ))}
          </div>
        </Card>

        <Card
          title="Feature flags"
          subtitle="Kill a whole system if it misbehaves, without a deploy"
          pad={false}
        >
          <ul className="divide-y divide-line2">
            {flags.map((flag) => (
              <FlagRow
                key={flag.key}
                flagKey={flag.key}
                enabled={flag.enabled}
                description={flag.description}
                disabled={!canWrite}
              />
            ))}
          </ul>
        </Card>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card
          title="Zones"
          subtitle={`${zones.filter((z) => z.active).length} active of ${zones.length}`}
          pad={false}
        >
          <ZoneEditor
            zones={zones.map((z) => ({
              id: z.id,
              name: z.name,
              deliveryFee: z.deliveryFee,
              active: z.active,
            }))}
            disabled={!canWrite}
          />
        </Card>

        <Card
          title="Platform categories"
          subtitle="The vocabulary browse, search and food requests all share"
          pad={false}
        >
          <TaxonomyEditor
            categories={taxonomy.map((c) => ({
              id: c.id,
              key: c.key,
              label: c.label,
              emoji: c.emoji,
              retired: c.retired,
            }))}
            icons={icons}
            disabled={!canWrite}
          />
        </Card>
      </div>

      {!canWrite ? (
        <p className="mt-5 text-[12px] text-ink3">
          Your role can read this configuration but not change it. Configuration writes
          need the operations or superadmin role.
        </p>
      ) : null}

      <p className="mt-6 text-[11.5px] leading-relaxed text-ink3">
        A category&rsquo;s <strong>key</strong> is the tag written on every dish and
        kitchen, so it is never editable — renaming it would orphan the filter. That is
        also why retiring is not deleting.
      </p>
    </>
  );
}
