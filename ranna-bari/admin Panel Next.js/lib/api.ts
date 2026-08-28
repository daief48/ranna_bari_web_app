import 'server-only';

import { NextResponse } from 'next/server';

import { identifyRequest, type AppIdentity } from './app-auth';
import { currentUser } from './auth';
import { errText } from './domain';
import type { Viewer } from './logic/chat';

/**
 * The shared shape of every app-facing endpoint.
 *
 * Errors go out as `{ error: <code>, message: <sentence> }` — the code so the
 * app can branch (it already has the `ERR` vocabulary), the sentence so it has
 * something to show if it has not been taught that code yet.
 */
export const jsonError = (error: string, status = 400) =>
  NextResponse.json({ error, message: errText(error) }, { status });

export const unauthorized = () =>
  NextResponse.json({ error: 'unauthenticated', message: 'Sign in again.' }, { status: 401 });

/**
 * Who is calling, as a chat viewer.
 *
 * Accepts either credential: an app bearer token, or the operator session
 * cookie. That is what lets one set of chat endpoints serve the phone and the
 * support desk without either learning the other's rules — the *viewer* is
 * what the chat logic reads, and it is built here, once.
 */
export async function viewerFor(request: Request): Promise<Viewer | null> {
  const account: AppIdentity | null = await identifyRequest(request);
  if (account) {
    if (account.role === 'cook' && account.kitchenId) {
      return {
        side: 'cook',
        kitchenId: account.kitchenId,
        customerKey: account.customerKey,
        name: account.kitchenName || account.name || 'Kitchen',
      };
    }
    return {
      side: 'customer',
      customerKey: account.customerKey,
      name: account.name || 'Customer',
    };
  }

  const operator = await currentUser();
  if (operator) return { side: 'admin', email: operator.email, name: operator.name };

  return null;
}

/** Read and validate a JSON body without throwing on malformed input. */
export async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

export const clientIp = (request: Request) =>
  request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
  request.headers.get('x-real-ip') ??
  null;
