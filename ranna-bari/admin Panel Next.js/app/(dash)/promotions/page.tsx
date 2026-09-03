import { BackendError, get } from '@/lib/backend';
import { BackendDown } from '@/components/backend-down';
import { currentUser } from '@/lib/auth';
import { can } from '@/lib/domain';
import { Card, GapNote, Grid, PageHeader, Stat } from '@/components/ui';
import { requirePage } from '@/lib/guard';

import { PromotionEditor, type Promotion } from './editor';

export const metadata = { title: 'Promotions · RannaBari Admin' };
export const dynamic = 'force-dynamic';

const taka = (n: number) => '৳' + n.toLocaleString('en-BD');

/**
 * Campaigns, and what they have cost.
 *
 * The platform had no promotional primitive of any kind before this — no
 * code, no voucher, no discount anywhere in thirty-one collections — which
 * meant the only lever for a slow Tuesday was a push notification asking
 * people to order at full price.
 *
 * The rule the whole thing is built on is worth repeating on the page that
 * launches them, because it is the one an operator would otherwise assume the
 * other way round: **a cook is paid exactly the same whether a promotion was
 * used or not.** The platform funds the discount into escrow beside the
 * customer's payment, so the release splits the full gross and a campaign
 * never quietly reduces somebody's earnings.
 */
export default async function PromotionsPage() {
  await requirePage('config.read');
  const user = await currentUser();
  const canWrite = can(user?.role ?? '', 'config.write');

  let promotions: Promotion[];
  try {
    const data = await get<{ promotions: Promotion[] }>('/promotions');
    promotions = data.promotions;
  } catch (error) {
    if (error instanceof BackendError && error.status === 0) {
      return (
        <BackendDown title="Promotions" subtitle="Codes, and what they have cost" />
      );
    }
    throw error;
  }

  const now = Date.now();
  const live = promotions.filter(
    (p) =>
      p.active &&
      (!p.startsAt || now >= new Date(p.startsAt).getTime()) &&
      (!p.endsAt || now <= new Date(p.endsAt).getTime()) &&
      (!p.usageLimit || p.used < p.usageLimit),
  );
  const redemptions = promotions.reduce((n, p) => n + p.used, 0);

  /* An estimate, and labelled as one: `used × value` is exact for a flat code
     and an upper bound for a percentage, because the real discount depended
     on each basket. The ledger holds the true figure — this is the number
     that tells an operator whether to go and look. */
  const flatSpend = promotions
    .filter((p) => p.kind === 'flat')
    .reduce((n, p) => n + p.used * p.value, 0);

  return (
    <>
      <PageHeader
        title="Promotions"
        subtitle="Discount codes — funded by the platform, never out of a cook's share"
      />

      <Grid cols={3}>
        <Stat
          label="Live right now"
          value={live.length}
          sub={`of ${promotions.length} campaign${promotions.length === 1 ? '' : 's'}`}
          tone={live.length ? 'good' : 'neutral'}
        />
        <Stat label="Times redeemed" value={redemptions} sub="across every code" />
        <Stat
          label="Flat-code spend"
          value={taka(flatSpend)}
          sub="percentage codes not included"
        />
      </Grid>

      <GapNote>
        <strong>A cook is paid the same whether a code was used or not.</strong> At
        checkout the customer pays the discounted amount and the platform posts the
        difference into escrow beside it, so escrow holds the full order total and the
        payout splits exactly what the cook was promised. The discount lands on the
        platform&rsquo;s own ledger account, where it is meant to — and a refund unwinds
        both halves separately, returning the customer what they actually paid rather
        than handing them the discount as cash.
      </GapNote>

      <Card
        className="mt-3"
        pad={false}
        title="Campaigns"
        subtitle="Newest first. Codes are never renamed or deleted — only stopped."
      >
        <PromotionEditor promotions={promotions} disabled={!canWrite} />
      </Card>
    </>
  );
}
