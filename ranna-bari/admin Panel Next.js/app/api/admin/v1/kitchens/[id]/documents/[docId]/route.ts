import { NextResponse } from 'next/server';

import { get, BackendError } from '@/lib/backend';
import { currentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * One KYC document, bytes and all.
 *
 * Thin proxy onto `/api/admin/v1/kitchens/:id/documents/:docId`, and thin on
 * purpose: the backend holds the evidence and authenticates the panel with a
 * shared secret that cannot travel to a browser, so the browser needs a
 * server of its own to ask.
 *
 * The alternative — inlining the data URI into the page's server-rendered
 * tree — would ship a two-megabyte string inside the HTML of the whole
 * kitchen page per document, and a PDF is not something an `<img>` can draw
 * anyway. This route gives both renderers an ordinary `/`-rooted URL: the
 * image renders from it, the PDF opens from it, and the operator's session
 * stays the only key to it.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; docId: string }> },
) {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const { id, docId } = await params;
  try {
    return NextResponse.json(await get(`/kitchens/${id}/documents/${docId}`));
  } catch (error) {
    if (error instanceof BackendError) {
      return NextResponse.json({ error: error.code }, { status: error.status || 502 });
    }
    throw error;
  }
}
