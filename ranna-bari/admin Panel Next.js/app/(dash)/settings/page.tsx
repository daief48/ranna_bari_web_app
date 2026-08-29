import { currentUser } from '@/lib/auth';
import { can } from '@/lib/domain';
import { BACKEND_URL, BackendError, get } from '@/lib/backend';
import { getFlags, type PlatformSettings } from '@/lib/settings';
import { Card, GapNote, PageHeader, Badge } from '@/components/ui';
import { SettingField, FlagRow, ZoneEditor, TaxonomyEditor } from './editors';
import { requirePage } from '@/lib/guard';

export const metadata = { title: 'Configuration · RannaBari Admin' };
export const dynamic = 'force-dynamic';

type SettingMeta = { label: string; help: string; kind: 'money' | 'rate' | 'days' };

type Config = {
  settings: PlatformSettings;
  meta: Record<keyof PlatformSettings, SettingMeta>;
};

type Zone = { id: string; name: string; deliveryFee: number | null; active: boolean };
type Category = { id: string; key: string; label: string; emoji: string; retired: boolean };

/**
 * What is left of this screen when the backend is not there.
 *
 * The panel is a client of `backend-node` now, so a dead backend is a dead
 * page — and the honest version of that is a sentence naming the process that
 * is missing, not a stack trace an operator standing at a desk cannot act on.
 */
function BackendDown() {
  return (
    <GapNote>
      <strong>The backend is not answering.</strong> This screen reads its
      configuration from <code>backend-node</code>, which is not responding at{' '}
      <code>{BACKEND_URL}</code>. Start it with{' '}
      <code>cd backend-node &amp;&amp; npm run dev</code>, then reload.
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

  try {
    const [remote, zoneList, categories, flagRows] = await Promise.all([
      get<Config>('/settings'),
      get<{ zones: Zone[] }>('/zones'),
      get<{ taxonomy: Category[] }>('/taxonomy'),
      getFlags(),
    ]);
    config = remote;
    zones = zoneList.zones;
    taxonomy = categories.taxonomy;
    flags = flagRows;
  } catch (error) {
    if (error instanceof BackendError && error.status === 0) {
      return (
        <>
          <PageHeader
            title="Configuration"
            subtitle="Everything here used to be a constant inside the mobile bundle"
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

  return (
    <>
      <PageHeader
        title="Configuration"
        subtitle="Everything here used to be a constant inside the mobile bundle"
      />

      <GapNote>
        <strong>Why this screen exists.</strong> <code>DELIVERY_FEE = 40</code> and{' '}
        <code>PLATFORM_FEE = 10</code> were literals in{' '}
        <code>CartContext.js</code>. The area list was a hardcoded array of 37 names.
        The category vocabulary was a <code>const</code> in a React component — the
        app&rsquo;s own comment on it reads{' '}
        <em>&ldquo;used by nothing in the UI yet, and by a future admin screen&rdquo;</em>.
        This is that screen. A price you can only change by shipping a new build to the
        app stores is not a price, it is a release.
      </GapNote>

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
            The app has no <code>platform</code> ledger account at all. Escrow released{' '}
            <strong>100% to the cook</strong>, so meals, stores and food requests
            earned the business nothing — only the cash-on-delivery path took a cut,
            through <code>COOK_PAYOUT_RATE = 0.85</code>.
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
        A category&rsquo;s <code>key</code> is the tag written on every dish and
        kitchen, so it is never editable — renaming it would orphan the filter. That is
        also why retiring is not deleting.
      </p>
    </>
  );
}
