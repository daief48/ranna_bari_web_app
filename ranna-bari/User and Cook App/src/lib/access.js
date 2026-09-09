/**
 * Who is allowed into which half of the app.
 *
 * The two sides are not two views of one thing. Running a kitchen and buying
 * dinner are different jobs with different data behind them, and which one
 * you are looking at was decided by `viewMode` — a string in AsyncStorage
 * that the app wrote and the app read. That is a preference, not a
 * permission, and a preference is the wrong thing to hang a section of the
 * app on: anything that can set it can open the kitchen.
 *
 * So the question is asked of the server instead. `identity` is what
 * `/auth/me` answered, and the backend only calls somebody a cook when a
 * live, unsuspended `Kitchen` row points at their account — see
 * `toIdentity` in `backend-node/src/auth/app-auth.js`. A device cannot
 * produce that by editing its own storage.
 *
 * ## What "verified" is doing here
 *
 * `isVerified` means a token exists *and* the server has answered for it.
 * Both halves matter. A token alone proves nothing the app can read; an
 * identity alone may be the copy cached for the launch screen, which is
 * exactly what a stale claim looks like.
 *
 * ## Offline
 *
 * A cook on a train keeps their kitchen. `SessionContext` restores the last
 * identity the server issued and only drops it on a 401 — a network failure
 * is not evidence that somebody stopped being a cook. The cached claim was
 * still minted by the server, which is the distinction that matters: it is a
 * stale server answer, not a local assertion.
 */

/**
 * A verified cook, and the kitchen they run.
 *
 * Both are required. `role === 'cook'` without a `kitchenId` is an account
 * mid-registration — the kitchen row is written after the account — and the
 * panel is entirely about a kitchen that does not exist yet.
 */
export function isVerifiedCook(session) {
  if (!session?.isVerified) return false;
  const identity = session.identity;
  return identity?.role === 'cook' && !!identity?.kitchenId;
}

/**
 * Whether the app knows enough to decide yet.
 *
 * Both stores have to have finished restoring. Until then the honest answer
 * is "not yet" rather than "no": a cook on a cold start would otherwise be
 * bounced out of their own kitchen in the frame before the token loads, and
 * a redirect is not something you can take back once the router has run it.
 */
export function accessSettled(auth, session) {
  return !!auth?.hydrated && !!session?.hydrated;
}
