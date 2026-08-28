import { NextResponse, type NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

import { SESSION_COOKIE } from './lib/auth-shared';

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
  let signedIn = false;

  if (token && process.env.AUTH_SECRET) {
    try {
      await jwtVerify(token, new TextEncoder().encode(process.env.AUTH_SECRET));
      signedIn = true;
    } catch {
      signedIn = false;
    }
  }

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
   * Everything except Next's own assets and the app-facing API.
   *
   * `/api/app/*` is the endpoint set the Expo client will eventually call; it
   * authenticates as an app account, not as an operator, so an admin session
   * cookie must not be what opens it.
   */
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/app).*)'],
};
