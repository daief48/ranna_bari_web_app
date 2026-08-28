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
