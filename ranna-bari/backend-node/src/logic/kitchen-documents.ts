import { Kitchen, KitchenDocument } from '../models/index.js';
import { ERR, fail, ok, type Result } from '../lib/domain.js';
import { tx } from '../config/db.js';

/**
 * KYC evidence for a kitchen — the NID faces, the optional portrait, the
 * pictures of the kitchen itself.
 *
 * What may be uploaded is answered once here, not at the route, for the same
 * reason the meal-management receipts are (`attachments.ts`): three call
 * sites sharing one rule beat one rule written three ways.
 *
 * The bytes arrive as data URIs and live in their own collection, so
 * `GET /kitchens/mine` and every admin list stay small; only the endpoints
 * that draw one document ever touch `data`.
 */

/** Two megabytes — a photographed NID is ~400KB; a scanned PDF can be more. */
const MAX_BYTES = 2_000_000;

const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const HEADER = /^data:([a-z]+\/[a-z0-9.+-]+);base64,/i;

export const DOCUMENT_KINDS = ['nid-front', 'nid-back', 'profile-pic', 'kitchen-photo'] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export type DocumentInput = { kind: DocumentKind; seq?: number; dataUri: string };

/**
 * Parse and vet one upload.
 *
 * A PDF is accepted for the NID faces only — it is a document scanner's
 * output, and a kitchen gallery full of print jobs is nobody's intent.
 */
function vetOne(
  kind: DocumentKind,
  seq: number,
  raw: string,
): { ok: true; mime: string; size: number; data: string } | { ok: false; detail: Record<string, unknown> } {
  const header = HEADER.exec(raw.trim());
  if (!header) return { ok: false, detail: { kind, reason: 'not-a-data-uri' } };

  const mime = header[1].toLowerCase();
  const allowed = IMAGE_MIMES.has(mime) || (mime === 'application/pdf' && (kind === 'nid-front' || kind === 'nid-back'));
  if (!allowed) return { ok: false, detail: { kind, mime, reason: 'mime-not-allowed' } };

  /* Base64 is four characters per three bytes; close enough to reject a
     twenty-megabyte upload without decoding it first. */
  const size = Math.floor((raw.trim().length - header[0].length) * 0.75);
  if (size > MAX_BYTES) return { ok: false, detail: { kind, size, max: MAX_BYTES } };

  return { ok: true, mime, size, data: raw.trim() };
}

/**
 * Replace a kitchen's document set and stamp the hand-in.
 *
 * The set is replaced, not merged — the screen sends everything it is
 * showing, so a re-upload after a rejection can also be a removal. The old
 * rows go first, inside the transaction with the insert and the stamp, so a
 * half-written set can never be read.
 */
export async function saveKitchenDocuments(
  kitchenId: string,
  accountId: string,
  inputs: DocumentInput[],
): Promise<Result<{ documentsSubmittedAt: Date; kycStatus: string; count: number }>> {
  const kitchen = await Kitchen.findById(kitchenId).lean();
  if (!kitchen) return fail(ERR.NO_KITCHEN);

  const vetted: {
    kitchenId: string;
    accountId: string;
    kind: DocumentKind;
    seq: number;
    mime: string;
    size: number;
    data: string;
  }[] = [];
  for (const input of inputs) {
    if (!DOCUMENT_KINDS.includes(input.kind)) return fail(ERR.DOC_INVALID, { kind: input.kind });
    const raw = String(input.dataUri ?? '');
    if (!raw) return fail(ERR.DOC_INVALID, { kind: input.kind, reason: 'empty' });

    const one = vetOne(input.kind, input.seq ?? 0, raw);
    if (!one.ok) return fail(ERR.DOC_INVALID, one.detail);
    vetted.push({
      kitchenId,
      accountId,
      kind: input.kind,
      seq: input.seq ?? 0,
      mime: one.mime,
      size: one.size,
      data: one.data,
    });
  }

  const nidFront = inputs.find((d) => d.kind === 'nid-front');
  const nidBack = inputs.find((d) => d.kind === 'nid-back');
  if (!nidFront || !nidBack) return fail(ERR.DOC_MISSING, { kinds: ['nid-front', 'nid-back'] });
  if (!inputs.some((d) => d.kind === 'kitchen-photo')) {
    return fail(ERR.DOC_MISSING, { kinds: ['kitchen-photo'] });
  }

  /* A rejection is lifted by a re-submission, not by approval — the cook has
     done the work again, and the queue should see it once more. */
  const submittedAt = new Date();
  await tx(async (session) => {
    await KitchenDocument.deleteMany({ kitchenId }, { session });
    await KitchenDocument.insertMany(vetted, { session });
    await Kitchen.updateOne(
      { _id: kitchenId },
      {
        documentsSubmittedAt: submittedAt,
        ...(kitchen.kycStatus === 'rejected' ? { kycStatus: 'pending', kycNote: null } : {}),
      },
      { session },
    );
  });

  return ok({
    documentsSubmittedAt: submittedAt,
    kycStatus: kitchen.kycStatus === 'rejected' ? 'pending' : (kitchen.kycStatus ?? 'pending'),
    count: vetted.length,
  });
}

/** The set, without the bytes. */
export async function listKitchenDocuments(kitchenId: string) {
  const rows = await KitchenDocument.find({ kitchenId })
    .sort({ kind: 1, seq: 1 })
    .select({ data: 0 })
    .lean();

  return rows.map((row) => ({
    id: String(row._id),
    kind: row.kind,
    seq: row.seq,
    mime: row.mime,
    size: row.size,
    at: row.at,
  }));
}

/** One document, bytes and all, scoped to its kitchen. */
export async function readKitchenDocument(kitchenId: string, documentId: string) {
  const row = await KitchenDocument.findOne({ _id: documentId, kitchenId }).lean();
  if (!row) return fail(ERR.DOC_MISSING);

  return ok({
    id: String(row._id),
    kind: row.kind,
    seq: row.seq,
    mime: row.mime,
    size: row.size,
    data: row.data,
    at: row.at,
  });
}
