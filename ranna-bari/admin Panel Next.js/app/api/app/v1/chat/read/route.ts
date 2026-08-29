import { NextResponse } from 'next/server';

import { post, BackendError } from '@/lib/backend';
import { currentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * Mark a thread read, on behalf of the desk.
 *
 * A thin proxy onto `/api/admin/v1/chat/read`, and thin on purpose: the
 * chat desk is a client component, the backend authenticates the panel with
 * a shared secret, and a secret cannot travel to a browser. So this route
 * exists to be the server the desk can reach and the client the backend will
 * talk to — nothing more. It holds no rules of its own.
 *
 * It reads and writes nothing locally. The read receipt, its authorisation
 * and the socket fan-out all happen in `logic/chat.ts` on the backend, which
 * is the same code path the phone goes through.
 */
export async function POST(request: Request) {
  /* Session, not service token: this is an operator acting. Without one the
     desk is somebody who found the URL. */
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  let body: { threadId?: string } | null = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  if (!body?.threadId) {
    return NextResponse.json({ error: 'name-required' }, { status: 400 });
  }

  try {
    return NextResponse.json(await post('/chat/read', { threadId: body.threadId }));
  } catch (error) {
    if (error instanceof BackendError) {
      return NextResponse.json({ error: error.code }, { status: error.status || 502 });
    }
    throw error;
  }
}

/** Preflight. The headers themselves come from `next.config.ts`. */
export function OPTIONS() {
  return new Response(null, { status: 204 });
}
