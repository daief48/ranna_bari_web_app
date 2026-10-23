/**
 * The two questions every kitchen on a results list has to answer before it
 * is worth showing: is it cooking, and will it come this far.
 *
 * Both were collected but never read. Signup asks a cook for a delivery
 * radius and tells them "only customers inside this circle will see your
 * kitchen"; browse then showed every kitchen to everyone. The open/closed
 * switch had the mirror problem -- it changed the kitchen page and nothing
 * that leads to it, so a closed kitchen still sat at the top of the feed.
 */
import { areaInRow, divisionOfDistrict } from './bd-areas';

/**
 * A kitchen with no flag is cooking. Absence means "never said otherwise",
 * which is the right reading for data that predates the switch.
 */
export function isOpenNow(chef) {
  return chef?.isOpen !== false;
}

/**
 * Whether a kitchen will deliver to somewhere `km` away.
 *
 * Unknown distance means unknown answer, and hiding a kitchen on a guess is
 * worse than showing one that might be far: a guest with no address on file
 * sees everything, exactly as they did before.
 */
export function deliversTo(chef, km) {
  if (km == null || Number.isNaN(km)) return true;
  const radius = chef?.deliveryRadiusKm;
  if (typeof radius !== 'number' || !(radius > 0)) return true;
  return km <= radius;
}

/**
 * Whether a seller — a kitchen or a shop — covers one customer address.
 *
 * The division model outranks the map: a seller who named the divisions they
 * deliver to is visible everywhere inside them, at any distance, and hidden
 * everywhere outside them, however close the pin sits. A seller who never
 * named any (every row that predates the picker) keeps the radius answer, so
 * nothing regresses behind this function's back.
 *
 * `km` is the distance from the caller's origin, computed once upstream and
 * reused here for the legacy path. No address on file — a guest, or an
 * account that never picked a division — falls back the same way: today's
 * behaviour, show everything the radius allows.
 */
export function coversCustomer(seller, addr, km) {
  if (!addr || (!addr.division && !addr.district && !addr.area)) {
    return deliversTo(seller, km);
  }
  if (seller?.allBangladesh) return true;

  const rows = Array.isArray(seller?.serviceAreas) ? seller.serviceAreas : [];
  if (!rows.length) return deliversTo(seller, km);

  const division =
    addr.division || divisionOfDistrict(addr.district) || divisionOfDistrict(addr.area);
  if (!division) return deliversTo(seller, km);

  return rows.some(
    (row) =>
      row?.division === division &&
      (!(Array.isArray(row.areas) && row.areas.length) ||
        areaInRow(row, addr.district) ||
        areaInRow(row, addr.area)),
  );
}
