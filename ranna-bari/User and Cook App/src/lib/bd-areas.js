/**
 * Bangladesh, as delivery coverage: the eight divisions and the districts
 * inside each, with Dhaka city's neighbourhoods as the one district that is
 * broken out finer (they are the names people actually type).
 *
 * SOURCE OF TRUTH. `backend-node/src/lib/bd-areas.ts` mirrors this file by
 * hand — change one, change both. A static file was chosen over serving the
 * list from `/config` because the address form needs it before sign-in, and
 * because it changes at census pace, not app pace.
 *
 * Shapes:
 *   DIVISIONS           [{ name, districts: [{ name, areas: [] }] }]
 *   serviceAreas rows    { division, areas: [district-or-area, ...] }
 * An empty `areas` array under a division means "the whole division".
 */

import { KNOWN_AREAS } from './areas';

export const DIVISIONS = [
  {
    name: 'Dhaka',
    districts: [
      { name: 'Dhaka', areas: KNOWN_AREAS },
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

/** Division names, in the order the pickers show them. */
export const DIVISION_NAMES = DIVISIONS.map((d) => d.name);

/** The districts of one division, or [] for an unknown name. */
export function districtsOf(division) {
  return DIVISIONS.find((d) => d.name === division)?.districts ?? [];
}

/** District names only — the chips the coverage picker and address form offer. */
export function districtNamesOf(division) {
  return districtsOf(division).map((d) => d.name);
}

/** Which division a district sits in, or null. First match wins; district
    names are unique across divisions in this data. */
export function divisionOfDistrict(name) {
  const wanted = String(name ?? '').trim();
  if (!wanted) return null;
  for (const division of DIVISIONS) {
    if (division.districts.some((d) => d.name === wanted)) return division.name;
  }
  return null;
}

/**
 * Is a district-or-area name a place inside a division's coverage row?
 * Case-insensitive on purpose — "gopalgonj" typed on a phone is still
 * Gopalganj.
 */
export function areaInRow(row, name) {
  const wanted = String(name ?? '').trim().toLowerCase();
  if (!wanted) return false;
  return (row?.areas ?? []).some((a) => String(a).toLowerCase() === wanted);
}
