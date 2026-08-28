/**
 * The handful of auth constants the edge middleware needs.
 *
 * Kept apart from `lib/auth.ts` because that module imports Prisma and
 * `server-only`, neither of which can be loaded in the edge runtime.
 */
export const SESSION_COOKIE = 'rb_admin_session';
