import { NextResponse, type NextRequest } from 'next/server';

import { SESSION_COOKIE, readSession } from './lib/auth-shared';

/**
 * The gate. `proxy` is what Next 16 renamed `middleware` to.
 *
 * It verifies the session signature and nothing more — no database round trip
 * on every request, and no capability logic. Authorisation belongs next to
 * the data, in the server actions, where it can be enforced rather than
 * merely implied by which links were rendered.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const signedIn = !!(await readSession(token));

  if (pathname === '/login') {
    return signedIn ? NextResponse.redirect(new URL('/', request.url)) : NextResponse.next();
  }

  if (!signedIn) {
    const url = new URL('/login', request.url);
    // Come back to where they were trying to go once they are in.
    if (pathname !== '/') url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  /*
   * Everything except Next's own assets, the app-facing API, and anything
   * that is a file rather than a page.
   *
   * `/api/app/*` is the endpoint set the Expo client will eventually call; it
   * authenticates as an app account, not as an operator, so an admin session
   * cookie must not be what opens it.
   *
   * ## Why the extension list is here
   *
   * `_next/static` covers what the bundler emits, and nothing else. Files in
   * `public/` are served from the root — `/logo.png`, not `/_next/...` — so
   * they fell through to the gate below, and an unauthenticated request for
   * the wordmark was answered with a 307 to `/login?next=%2Flogo.png`. The
   * browser got an HTML page where it expected a PNG, so the logo on the
   * sign-in screen was broken: the one page guaranteed to have no session is
   * the one page that shows the logo.
   *
   * `favicon.ico` was already excluded by name, but the file in `public/` is
   * `favicon.png`, so the tab icon was broken for the same reason. Matching
   * on the extension covers both, and covers whatever gets added later
   * without anyone having to remember this.
   */
  matcher: [
    '/((?!_next/static|_next/image|api/app|.*\\.(?:png|jpg|jpeg|webp|avif|gif|svg|ico|woff|woff2|ttf|otf|webmanifest|txt|xml|map)$).*)',
  ],
};
