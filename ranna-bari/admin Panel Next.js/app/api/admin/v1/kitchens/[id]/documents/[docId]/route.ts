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
 * The backend answers with a data URI; a browser — an `<img src>`, an
 * open-in-new-tab — was promised bytes. So this route splits the URI and
 * re-serves the base64 as the body with the document's own content type,
 * which is also what keeps the two-megabyte string out of the page's
 * server-rendered HTML: it travels once per view, on demand, and never as
 * part of the tree.
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
    const doc = await get<{ mime?: string; data?: string }>(
      `/kitchens/${id}/documents/${docId}`,
    );

    const data = typeof doc.data === 'string' ? doc.data : '';
    const comma = data.indexOf(',');
    const bytes = Buffer.from(comma >= 0 ? data.slice(comma + 1) : data, 'base64');
    if (!bytes.length) {
      return NextResponse.json({ error: 'document-empty' }, { status: 404 });
    }

    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'content-type': doc.mime || 'application/octet-stream',
        'content-length': String(bytes.byteLength),
        /* The evidence never changes once submitted; the operator's session
            keeps it private. */
        'cache-control': 'private, max-age=300',
      },
    });
  } catch (error) {
    if (error instanceof BackendError) {
      return NextResponse.json({ error: error.code }, { status: error.status || 502 });
    }
    throw error;
  }
}
