import { NextResponse } from 'next/server';

import { get, BackendError } from '@/lib/backend';
import { currentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * The desk's inbox.
 *
 * A thin proxy onto `/api/admin/v1/chat/threads`, and thin on purpose: the
 * chat desk is a client component, the backend authenticates the panel with
 * a shared secret, and a secret cannot travel to a browser. This route is the
 * server the desk can reach and the client the backend will talk to.
 *
 * The desk polls this every few seconds because the panel is hosted on
 * serverless functions, which cannot hold the socket the fan-out hub was
 * written for. Polling is the delivery mechanism now, so this path has to
 * exist — without it the desk renders once and then goes deaf.
 */
export async function GET(request: Request) {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const url = new URL(request.url);
  const query = new URLSearchParams();
  for (const key of ['take', 'kind', 'status'] as const) {
    const value = url.searchParams.get(key);
    if (value) query.set(key, value);
  }

  try {
    return NextResponse.json(await get(`/chat/threads?${query}`));
  } catch (error) {
    if (error instanceof BackendError) {
      return NextResponse.json({ error: error.code }, { status: error.status || 502 });
    }
    throw error;
  }
}
