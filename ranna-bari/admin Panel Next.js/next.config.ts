import type { NextConfig } from 'next';

/**
 * CORS for the app endpoints only.
 *
 * Native React Native does not enforce CORS, so this is invisible on a phone
 * — but this app also builds for web (`output: "single"` in app.json), and
 * there the Expo dev server is on one port and this API on another. Without
 * these headers every chat request on Expo web fails at the preflight, which
 * looks exactly like the server being down.
 *
 * `*` is correct here and not laziness: these routes authenticate with a
 * bearer token, never a cookie, so there is no ambient authority for another
 * origin to borrow. The panel's own routes are deliberately not included —
 * those *do* use a cookie, and opening them cross-origin would be a real
 * hole.
 */
const config: NextConfig = {
  images: { remotePatterns: [{ protocol: 'https', hostname: '**' }] },
  typedRoutes: false,

  async headers() {
    return [
      {
        source: '/api/app/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,POST,OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'content-type,authorization' },
          { key: 'Access-Control-Max-Age', value: '86400' },
        ],
      },
    ];
  },
};

export default config;
