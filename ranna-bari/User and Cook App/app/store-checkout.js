import { Redirect } from 'expo-router';

/**
 * Shop products no longer have a checkout of their own.
 *
 * They share the cart with kitchen dishes, and `/checkout` pays for both. This
 * stays as a one-line redirect so an old link, a stale tab or a remembered
 * route does not land on a page that is not there.
 */
export default function StoreCheckoutRedirect() {
  return <Redirect href="/checkout" />;
}
