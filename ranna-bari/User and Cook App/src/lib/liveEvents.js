/**
 * The socket's events, for the parts of the app that are not the chat.
 *
 * There is exactly one WebSocket, and `ChatContext` owns it — it opened it,
 * it holds the token, and it reconnects it. That was fine while chat was the
 * only thing the server pushed. It is not the only thing any more: an order
 * moving along its rail is announced down the same wire, and the screen that
 * has to repaint is the customer's tracker, which knows nothing about chat.
 *
 * A second socket per listener would be the obvious move and the wrong one —
 * two connections, two reconnect loops, two sets of presence. So the socket
 * stays where it is and hands anything that is not a chat frame to this, and
 * whoever cares subscribes. Module-level, so a subscriber does not have to be
 * mounted inside any particular provider.
 */
const listeners = new Set();

/** Returns an unsubscribe, so an effect can clean up after itself. */
export function onLiveEvent(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function emitLiveEvent(event) {
  if (!event || typeof event.type !== 'string') return;

  listeners.forEach((fn) => {
    try {
      fn(event);
    } catch {
      /* One bad listener must not stop the others, or take the socket's
         message handler down with it. */
    }
  });
}
