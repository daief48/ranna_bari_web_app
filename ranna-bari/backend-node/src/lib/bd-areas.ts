/**
 * Bangladesh, as delivery coverage: the eight divisions and the districts
 * inside each. Dhaka city is broken out to neighbourhood level, because those
 * are the names people actually type.
 *
 * MIRROR — the source of truth is `User and Cook App/src/lib/bd-areas.js`.
 * Change one, change both. A static file was chosen over serving the list
 * from `/config` because the app needs it before sign-in, and because it
 * changes at census pace, not app pace.
 *
 * Shapes:
 *   DIVISIONS           [{ name, districts: [{ name, areas: [] }] }]
 *   serviceAreas rows    { division, areas: [district-or-area, ...] }
 * An empty `areas` array under a division means "the whole division".
 */

export type ServiceArea = { division: string; areas: string[] };

const DHAKA_AREAS = [
  'Old Dhaka',
  'Bashundhara',
  'Mohammadpur',
  'Segunbagicha',
  'Aftabnagar',
  'Shantinagar',
  'Dhanmondi',
  'Mohakhali',
  'Khilgaon',
  'Malibagh',
  'Jatrabari',
  'Kalabagan',
  'Lalmatia',
  'Baridhara',
  'Motijheel',
  'Banasree',
  'Shyamoli',
  'Khilkhet',
  'Nikunja',
  'Shahbagh',
  'Azimpur',
  'Farmgate',
  'Rampura',
  'Tejgaon',
  'Niketan',
  'Gulshan',
  'Banani',
  'Mirpur',
  'Uttara',
  'Keraniganj',
  'Paltan',
  'Adabor',
  'Vatara',
  'Savar',
  'Badda',
  'Kuril',
  'Wari',
];

export const DIVISIONS: { name: string; districts: { name: string; areas: string[] }[] }[] = [
  {
    name: 'Dhaka',
    districts: [
      { name: 'Dhaka', areas: DHAKA_AREAS },
      { name: 'Faridpur', areas: [] },
      { name: 'Gazipur', areas: [] },
      { name: 'Gopalganj', areas: [] },
      { name: 'Kishoreganj', areas: [] },
      { name: 'Madaripur', areas: [] },
      { name: 'Manikganj', areas: [] },
      { name: 'Munshiganj', areas: [] },
      { name: 'Narayanganj', areas: [] },
      { name: 'Narsingdi', areas: [] },
      { name: 'Rajbari', areas: [] },
      { name: 'Shariatpur', areas: [] },
      { name: 'Tangail', areas: [] },
    ],
  },
  {
    name: 'Chattogram',
    districts: [
      { name: 'Bandarban', areas: [] },
      { name: 'Brahmanbaria', areas: [] },
      { name: 'Chandpur', areas: [] },
      { name: 'Chattogram', areas: [] },
      { name: 'Cumilla', areas: [] },
      { name: "Cox's Bazar", areas: [] },
      { name: 'Feni', areas: [] },
      { name: 'Khagrachhari', areas: [] },
      { name: 'Lakshmipur', areas: [] },
      { name: 'Noakhali', areas: [] },
      { name: 'Rangamati', areas: [] },
    ],
  },
  {
    name: 'Barishal',
    districts: [
      { name: 'Barguna', areas: [] },
      { name: 'Barishal', areas: [] },
      { name: 'Bhola', areas: [] },
      { name: 'Jhalokati', areas: [] },
      { name: 'Patuakhali', areas: [] },
      { name: 'Pirojpur', areas: [] },
    ],
  },
  {
    name: 'Khulna',
    districts: [
      { name: 'Bagerhat', areas: [] },
      { name: 'Chuadanga', areas: [] },
      { name: 'Jashore', areas: [] },
      { name: 'Jhenaidah', areas: [] },
      { name: 'Khulna', areas: [] },
      { name: 'Kushtia', areas: [] },
      { name: 'Magura', areas: [] },
      { name: 'Meherpur', areas: [] },
      { name: 'Narail', areas: [] },
      { name: 'Satkhira', areas: [] },
    ],
  },
  {
    name: 'Rajshahi',
    districts: [
      { name: 'Bogura', areas: [] },
      { name: 'Chapainawabganj', areas: [] },
      { name: 'Joypurhat', areas: [] },
      { name: 'Naogaon', areas: [] },
      { name: 'Natore', areas: [] },
      { name: 'Pabna', areas: [] },
      { name: 'Rajshahi', areas: [] },
      { name: 'Sirajganj', areas: [] },
    ],
  },
  {
    name: 'Rangpur',
    districts: [
      { name: 'Dinajpur', areas: [] },
      { name: 'Gaibandha', areas: [] },
      { name: 'Kurigram', areas: [] },
      { name: 'Lalmonirhat', areas: [] },
      { name: 'Nilphamari', areas: [] },
      { name: 'Panchagarh', areas: [] },
      { name: 'Rangpur', areas: [] },
      { name: 'Thakurgaon', areas: [] },
    ],
  },
  {
    name: 'Sylhet',
    districts: [
      { name: 'Habiganj', areas: [] },
      { name: 'Moulvibazar', areas: [] },
      { name: 'Sunamganj', areas: [] },
      { name: 'Sylhet', areas: [] },
    ],
  },
  {
    name: 'Mymensingh',
    districts: [
      { name: 'Jamalpur', areas: [] },
      { name: 'Mymensingh', areas: [] },
      { name: 'Netrokona', areas: [] },
      { name: 'Sherpur', areas: [] },
    ],
  },
];

/** Which division a district sits in, or null. */
export function divisionOfDistrict(name: string): string | null {
  const wanted = String(name ?? '').trim();
  if (!wanted) return null;
  for (const division of DIVISIONS) {
    if (division.districts.some((d) => d.name === wanted)) return division.name;
  }
  return null;
}

function areaInRow(row: ServiceArea, name?: string | null): boolean {
  const wanted = String(name ?? '').trim().toLowerCase();
  if (!wanted) return false;
  return (row.areas ?? []).some((a) => String(a).toLowerCase() === wanted);
}

/**
 * Does a seller's coverage cover one address?
 *
 * The server-side twin of the app's `coversCustomer`: `allBangladesh` covers
 * everything; a seller with serviceAreas rows covers any address whose
 * division matches a row with either no district list (whole division) or the
 * address's district/area named in it. A seller with neither field falls back
 * to the caller's legacy decision — this function answers only the coverage
 * half.
 */
export function serviceAreaCovers(
  seller: { allBangladesh?: boolean; serviceAreas?: ServiceArea[] } | null,
  addr: { division?: string | null; district?: string | null; area?: string | null } | null,
): boolean | null {
  if (!addr || (!addr.division && !addr.district && !addr.area)) return null;
  if (seller?.allBangladesh) return true;

  const rows = seller?.serviceAreas ?? [];
  if (!rows.length) return null;

  const division =
    addr.division ||
    divisionOfDistrict(String(addr.district ?? '')) ||
    divisionOfDistrict(String(addr.area ?? ''));
  if (!division) return null;

  const hit = rows.some(
    (row) =>
      row?.division === division &&
      (!(row.areas ?? []).length ||
        areaInRow(row, addr.district) ||
        areaInRow(row, addr.area)),
  );
  /* A seller with coverage rows has answered the question: a miss is a real
     "does not cover", not a fallthrough to the radius. */
  return hit;
}

/**
 * Normalise what a client posted as serviceAreas.
 *
 * Arrives as arbitrary JSON; leaves as rows of trimmed strings with empty
 * area arrays collapsed to []. Rows without a division are dropped — a
 * coverage that names no division covers nothing and would only confuse the
 * read side.
 */
export function normaliseServiceAreas(input: unknown): ServiceArea[] {
  if (!Array.isArray(input)) return [];
  const out: ServiceArea[] = [];
  for (const raw of input) {
    const division = String((raw as ServiceArea)?.division ?? '').trim();
    if (!division) continue;
    const areas = Array.isArray((raw as ServiceArea)?.areas)
      ? [...new Set((raw as ServiceArea).areas.map((a) => String(a ?? '').trim()).filter(Boolean))]
      : [];
    out.push({ division, areas });
  }
  return out;
}
