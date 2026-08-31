import { NextResponse } from 'next/server';

import { get, post, BackendError } from '@/lib/backend';
import { currentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * The desk's transcript, and its replies.
 *
 * A thin proxy onto `/api/admin/v1/chat/messages`, and thin on purpose: the
 * chat desk is a client component, the backend authenticates the panel with
 * a shared secret, and a secret cannot travel to a browser. This route is
 * the server the desk can reach and the client the backend will talk to. It
 * holds no rules of its own — authorisation, the replay guard on `clientId`
 * and the socket fan-out are all `logic/chat.ts` on the backend, which is
 * the same path the phone goes through.
 */

/** Who is asking, or a 401. Every handler here starts with this. */
async function operator() {
  const user = await currentUser();
  return user ?? null;
}

const failed = (error: unknown) => {
  if (error instanceof BackendError) {
    return NextResponse.json({ error: error.code }, { status: error.status || 502 });
  }
  throw error;
};

export async function GET(request: Request) {
  if (!(await operator())) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const url = new URL(request.url);
  const threadId = url.searchParams.get('threadId');
  if (!threadId) return NextResponse.json({ error: 'name-required' }, { status: 400 });

  const take = url.searchParams.get('take');
  const query = new URLSearchParams({ threadId });
  if (take) query.set('take', take);

  try {
    return NextResponse.json(await get(`/chat/messages?${query}`));
  } catch (error) {
    return failed(error);
  }
}

export async function POST(request: Request) {
  if (!(await operator())) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  let body: { threadId?: string; body?: string; clientId?: string } | null = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  if (!body?.threadId || !body.body || !body.clientId) {
    return NextResponse.json({ error: 'name-required' }, { status: 400 });
  }

  try {
    return NextResponse.json(
      await post('/chat/messages', {
        threadId: body.threadId,
        body: body.body,
        clientId: body.clientId,
      }),
    );
  } catch (error) {
    return failed(error);
  }
}
