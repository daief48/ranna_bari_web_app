import { MM_ERR, mmFail, mmOk, type MmResult } from '../errors.js';
import { MmAttachment } from '../models.js';

import { idOf, type MessContext } from './context.js';

/**
 * Receipts, kept out of the rows that reference them.
 *
 * §4.3 and §4.4 both want an image on the record, and §4.17 asks for
 * restricted file types and sizes. Both are handled here rather than at each
 * of the three call sites, so "what may be uploaded" is one answer.
 *
 * The bytes arrive as a data URI, which is what the Expo image picker
 * produces after the app has already downscaled it. Storing them in their own
 * collection means a list of expenses stays a list of small documents — the
 * alternative drags a two-megabyte string into every query that ever touches
 * the month.
 */

/** Two megabytes. A downscaled phone photograph of a receipt is ~200KB. */
const MAX_BYTES = 2_000_000;

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);

const HEADER = /^data:([a-z]+\/[a-z0-9.+-]+);base64,/i;

/**
 * Store one upload and hand back its id.
 *
 * An empty string is a valid input meaning "no receipt", and returns an empty
 * id rather than a refusal — every caller has an optional receipt and none of
 * them should have to branch on it.
 */
export async function saveAttachment(
  ctx: MessContext,
  dataUri: string | undefined,
  kind: string,
): Promise<MmResult<string>> {
  const raw = String(dataUri ?? '').trim();
  if (!raw) return mmOk('');

  const header = HEADER.exec(raw);
  if (!header) return mmFail(MM_ERR.BAD_ATTACHMENT, { reason: 'not-a-data-uri' });

  const mime = header[1].toLowerCase();
  if (!ALLOWED.has(mime)) return mmFail(MM_ERR.BAD_ATTACHMENT, { mime });

  /* Base64 is four characters per three bytes; close enough to reject a
     twenty-megabyte upload without decoding it first. */
  const size = Math.floor((raw.length - header[0].length) * 0.75);
  if (size > MAX_BYTES) return mmFail(MM_ERR.BAD_ATTACHMENT, { size, max: MAX_BYTES });

  const row = await MmAttachment.create({
    messId: ctx.messId,
    kind,
    mime,
    size,
    data: raw,
    uploadedBy: ctx.caller.customerKey,
  });

  return mmOk(idOf(row._id));
}

/** Fetch one, scoped to the mess so an id from elsewhere reads nothing. */
export async function readAttachment(ctx: MessContext, attachmentId: string) {
  const row = await MmAttachment.findOne({ _id: attachmentId, messId: ctx.messId }).lean();
  if (!row) return mmFail(MM_ERR.BAD_ATTACHMENT);

  return mmOk({ id: idOf(row._id), mime: row.mime, size: row.size, data: row.data });
}

/**
 * Drop an attachment nothing points at any more.
 *
 * Called when a receipt is replaced. Failure is swallowed: an orphaned blob is
 * a storage nuisance, and a failed cleanup should not fail the edit that
 * succeeded.
 */
export function dropAttachment(ctx: MessContext, attachmentId: string | undefined): void {
  if (!attachmentId) return;
  void MmAttachment.deleteOne({ _id: attachmentId, messId: ctx.messId }).catch(() => {});
}
