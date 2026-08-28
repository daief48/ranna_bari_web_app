import { NextResponse } from 'next/server';

import { db } from '@/lib/db';
import { getSettings, getFlags } from '@/lib/settings';

export const dynamic = 'force-dynamic';

/**
 * Everything the app currently hardcodes.
 *
 * `DELIVERY_FEE`, `PLATFORM_FEE`, `KNOWN_AREAS` and the category vocabulary
 * are all constants inside the mobile bundle today, which means changing a
 * price requires shipping a build to the app stores. Fetching this on launch
 * (and falling back to the bundled constants when it fails) is the smallest
 * change that turns them into configuration.
 *
 * Deliberately unauthenticated: it is the same public information every
 * install already carries, and gating it would just mean the app cannot start
 * without a session.
 */
export async function GET() {
  const [settings, flags, zones, taxonomy] = await Promise.all([
    getSettings(),
    getFlags(),
    db.zone.findMany({
      where: { active: true },
      orderBy: { order: 'asc' },
      select: { name: true, deliveryFee: true },
    }),
    db.taxonomyCategory.findMany({
      where: { retired: false },
      orderBy: { order: 'asc' },
      select: { id: true, key: true, label: true, emoji: true, order: true },
    }),
  ]);

  return NextResponse.json(
    {
      fees: {
        deliveryFee: settings.deliveryFee,
        platformFee: settings.platformFee,
      },
      /* The app shows the cook their share, so it needs the rate rather than
         the commission. 0.85 was `COOK_PAYOUT_RATE`. */
      payoutRates: {
        cod: 1 - settings.commissionCod,
        meal: 1 - settings.commissionMeal,
        store: 1 - settings.commissionStore,
        request: 1 - settings.commissionRequest,
      },
      escrow: {
        autoReleaseDays: settings.escrowAutoReleaseDays,
      },
      /* Longest first, which is what `normaliseArea` needs so that "Old Dhaka"
         is matched before "Dhaka". */
      areas: zones
        .map((z) => z.name)
        .sort((a, b) => b.length - a.length),
      zoneFees: Object.fromEntries(
        zones.filter((z) => z.deliveryFee != null).map((z) => [z.name, z.deliveryFee]),
      ),
      taxonomy,
      flags: Object.fromEntries(flags.map((f) => [f.key, f.enabled])),
    },
    {
      headers: {
        // Short cache: a fee change should reach devices in a minute, not on
        // the next cold start.
        'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
      },
    },
  );
}
