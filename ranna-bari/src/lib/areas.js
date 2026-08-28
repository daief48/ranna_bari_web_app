/**
 * Turning whatever the geocoder said into a neighbourhood.
 *
 * `reverseGeocode` returns Mapbox's `place_name`, which is a full postal
 * address -- "Lane 11 East, 1212 Dhaka, Bangladesh". Storing that as a
 * kitchen's `area` put a street address into the area picker alongside real
 * neighbourhoods, which is neither a filter anyone wants nor a place anyone
 * recognises.
 */

/**
 * Neighbourhoods the picker knows by name.
 *
 * The seeded kitchens only cover nine of these; the rest are here so a cook
 * who pins somewhere else still lands on a recognisable area rather than on
 * their own street. Longest first, so "Old Dhaka" is matched before "Dhaka".
 */
export const KNOWN_AREAS = [
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
].sort((a, b) => b.length - a.length);

/** Words that are a city or a country, never a neighbourhood. */
const NOT_AN_AREA = /^(dhaka|bangladesh|bd|dhaka division)$/i;

/**
 * @param {string} raw  anything from a clean "Dhanmondi" to a full address
 * @returns {string} a neighbourhood, or "Dhaka" when none can be recognised
 */
export function normaliseArea(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return 'Dhaka';

  // Already a neighbourhood, or one is named somewhere inside the address.
  const hit = KNOWN_AREAS.find((a) =>
    new RegExp(`\\b${a.replace(/\s+/g, '\\s+')}\\b`, 'i').test(text),
  );
  if (hit) return hit;

  /* Nothing recognised. Fall back to the first segment that reads like a
     place rather than a house number or a postcode -- and never to the city
     or the country, which say nothing about where the food is. */
  const segment = text
    .split(',')
    .map((s) => s.trim())
    .find((s) => s && !/\d/.test(s) && !NOT_AN_AREA.test(s));

  return segment || 'Dhaka';
}
