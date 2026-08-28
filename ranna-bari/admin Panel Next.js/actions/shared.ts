import 'server-only';

import { errText } from '@/lib/domain';

/**
 * What a server action hands back to a button.
 *
 * Actions never throw at the UI. A thrown error in a server action reaches
 * the client as a redacted digest in production — useless to the operator
 * standing there — so every action catches and returns a sentence instead.
 */
export type ActionResult = { ok: boolean; message?: string };

export const good = (message?: string): ActionResult => ({ ok: true, message });
export const bad = (message: string): ActionResult => ({ ok: false, message });

/**
 * Wrap an action body so a refusal reads as a sentence and a crash does not
 * take the page down.
 */
export async function guard(fn: () => Promise<ActionResult>): Promise<ActionResult> {
  try {
    return await fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (message.startsWith('admin-forbidden')) {
      return bad('Your role cannot do that.');
    }
    if (message === 'admin-unauthenticated') {
      return bad('Your session has expired. Sign in again.');
    }
    if (message.includes('append-only')) {
      return bad('That would rewrite the ledger. Post a correcting entry instead.');
    }
    // A transition code like `order-wrong-state` becomes readable here.
    const readable = errText(message);
    return bad(readable === message ? 'That did not work.' : readable);
  }
}
