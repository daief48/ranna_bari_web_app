import { BackendError, get } from '@/lib/backend';
import { BackendDown } from '@/components/backend-down';
import { currentUser } from '@/lib/auth';
import { can } from '@/lib/domain';
import { Card, GapNote, Grid, PageHeader, Stat } from '@/components/ui';
import { type LibraryIcon } from '@/components/ui/icon-picker';
import { requirePage } from '@/lib/guard';

import { IconLibrary } from './editor';

export const metadata = { title: 'Emoji & icons · RannaBari Admin' };
export const dynamic = 'force-dynamic';

/**
 * The shared set of little pictures.
 *
 * Three things across the platform carry one — dish categories, kitchen
 * specialties and a cook's own shelves — and every one of them used to ask
 * for it with a bare text box. That works for whoever set the list up and for
 * nobody afterwards: you cannot see what is already in use, so a new category
 * gets 🍛 while the one above it has 🍚 and the set drifts into a scatter of
 * near-identical pictures nobody chose on purpose.
 *
 * The library is now offered wherever a picture is picked. This page is where
 * it is curated.
 */
export default async function IconsPage() {
  await requirePage('config.read');
  const user = await currentUser();
  const canWrite = can(user?.role ?? '', 'config.write');

  let icons: LibraryIcon[];
  try {
    icons = (await get<{ icons: LibraryIcon[] }>('/icons')).icons;
  } catch (error) {
    if (error instanceof BackendError && error.status === 0) {
      return (
        <BackendDown
          title="Emoji & icons"
          subtitle="The shared set every category and specialty picks from"
        />
      );
    }
    throw error;
  }

  const live = icons.filter((i) => !i.retired);
  const used = icons.filter((i) => (i.uses ?? 0) > 0);
  const images = icons.filter((i) => i.kind === 'image');
  const unlabelled = live.filter((i) => !i.label);

  return (
    <>
      <PageHeader
        title="Emoji & icons"
        subtitle="The shared set every category, specialty and shelf picks from"
      />

      <Grid cols={4}>
        <Stat label="In the library" value={live.length} />
        <Stat label="Drawn somewhere" value={used.length} sub="on a category or specialty" />
        <Stat label="Custom images" value={images.length} sub="rather than emoji" />
        <Stat
          label="Without search words"
          value={unlabelled.length}
          sub={unlabelled.length ? 'findable only by scrolling' : 'all searchable'}
          tone={unlabelled.length ? 'warn' : 'good'}
        />
      </Grid>

      <GapNote>
        <strong>The label is what the picker searches.</strong> An icon with no search
        words can only be found by scrolling the grid, which is the problem this
        library exists to solve — so give each one the words somebody would actually
        type: <em>fire</em>, not <em>flame emoji</em>. The value itself is never
        edited: categories and specialties store the character, so changing it here
        would rename nothing and only make this list disagree with what is on screen.
        A wrong picture is retired and a right one added.
      </GapNote>

      <Card
        className="mt-3"
        pad={false}
        title="The library"
        subtitle="An emoji character, or a URL for your own artwork"
      >
        <IconLibrary icons={icons} disabled={!canWrite} />
      </Card>
    </>
  );
}
