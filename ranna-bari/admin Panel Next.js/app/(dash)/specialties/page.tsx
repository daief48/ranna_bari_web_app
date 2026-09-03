import { BackendError, get } from '@/lib/backend';
import { BackendDown } from '@/components/backend-down';
import { currentUser } from '@/lib/auth';
import { can } from '@/lib/domain';
import { Card, GapNote, Grid, PageHeader, Stat } from '@/components/ui';
import { requirePage } from '@/lib/guard';

import { SpecialtyEditor, type Specialty } from './editor';

export const metadata = { title: 'Specialties · RannaBari Admin' };
export const dynamic = 'force-dynamic';

/**
 * What a kitchen may say it cooks best.
 *
 * This was six strings in a `const` inside the app — twice over, once in the
 * kitchen store and once in the sign-up form, which is how a list like that
 * eventually disagrees with itself. Adding a seventh meant shipping a build,
 * and meanwhile the kitchens in the database were using twenty-four different
 * specialties between them, because whoever seeded them was not reading the
 * dropdown.
 *
 * So it is data now, and this is where it is edited.
 */
export default async function SpecialtiesPage() {
  await requirePage('config.read');
  const user = await currentUser();
  const canWrite = can(user?.role ?? '', 'config.write');

  let specialties: Specialty[];
  try {
    specialties = (await get<{ specialties: Specialty[] }>('/specialties')).specialties;
  } catch (error) {
    if (error instanceof BackendError && error.status === 0) {
      return (
        <BackendDown
          title="Specialties"
          subtitle="What a kitchen may say it cooks best"
        />
      );
    }
    throw error;
  }

  const offered = specialties.filter((s) => !s.retired);
  const claimed = specialties.filter((s) => s.kitchens > 0);
  const unused = offered.filter((s) => s.kitchens === 0);

  return (
    <>
      <PageHeader
        title="Specialties"
        subtitle="What a kitchen may say it cooks best — the list every cook picks from"
      />

      <Grid cols={3}>
        <Stat label="Offered to cooks" value={offered.length} />
        <Stat
          label="Actually chosen"
          value={claimed.length}
          sub="at least one kitchen"
          tone={claimed.length ? 'good' : 'neutral'}
        />
        <Stat
          label="Nobody has picked"
          value={unused.length}
          sub={unused.length ? 'candidates to retire' : 'every one is in use'}
          tone={unused.length ? 'warn' : 'good'}
        />
      </Grid>

      <GapNote>
        <strong>A label can be renamed; a key cannot.</strong> A kitchen stores its
        specialty as that string on its own row, so renaming the key would leave
        every kitchen that chose it claiming something this list no longer contains.
        The same reasoning is why nothing here is deleted — retiring stops it being
        offered to anybody new while the kitchens already carrying it keep meaning
        what they said. The count beside each row is how many those are.
      </GapNote>

      <Card
        className="mt-3"
        pad={false}
        title="The list"
        subtitle="In the order a cook is shown them"
      >
        <SpecialtyEditor specialties={specialties} disabled={!canWrite} />
      </Card>
    </>
  );
}
