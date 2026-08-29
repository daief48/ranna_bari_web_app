/**
 * A delivery address, as one line.
 *
 * The app has always stored an address as an object -- a label, a street
 * line, an area, and instructions for the rider -- and the screens that show
 * it used to be handed a string that some other screen had already flattened.
 * Now that orders come back from the server the object arrives intact, and a
 * component that renders it directly throws rather than showing anything.
 *
 * So this is the one place that flattens it. A string passes straight
 * through, because an older order may still hold one, and anything else
 * becomes null so a caller's own fallback ("At the kitchen", "—") is what
 * shows rather than "[object Object]".
 */
export function formatAddress(address) {
  if (!address) return null;
  if (typeof address === 'string') return address.trim() || null;
  if (typeof address !== 'object') return null;

  /* Street first, then area: that is how somebody would say it out loud, and
     the label ("Home", "Office") is the customer's own name for the place
     rather than part of finding it. Instructions are for the rider and are
     shown separately where there is room for them. */
  const parts = [address.line, address.area]
    .map((part) => (typeof part === 'string' ? part.trim() : ''))
    .filter(Boolean);

  if (!parts.length) {
    const label = typeof address.label === 'string' ? address.label.trim() : '';
    return label || null;
  }

  return parts.join(', ');
}
