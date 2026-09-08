import { Platform, Share } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';

/**
 * Getting a report off the phone. §4.9.
 *
 * The specification's flow is *generate → preview → share via WhatsApp,
 * Messenger or Email*, which is three different platform capabilities:
 * rendering, a file, and the OS share sheet. This module is the one place
 * that knows which of them exist where.
 *
 * The backend produces the document — print-ready HTML for the PDF, a CSV
 * string for the spreadsheet — so the layout lives on the server and every
 * client gets the same page. All that happens here is turning that into
 * something the operating system will accept.
 *
 * Web is the awkward one and is handled explicitly rather than left to fail:
 * `expo-sharing` is unavailable there and a data-URI download is blocked in
 * enough browsers that it cannot be the only path. So web prints through the
 * browser's own dialog and falls back to the clipboard.
 */

/** A filename that will not upset a file system or a mail client. */
const safeName = (base) =>
  String(base ?? 'report')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'report';

/* ------------------------------------------------------------------ *
 * PDF
 * ------------------------------------------------------------------ */

/**
 * Turn the server's HTML into a PDF and hand it to the share sheet.
 *
 * Returns a verdict rather than throwing, in the same `{ ok }` shape the rest
 * of the module uses, so a screen can report the failure with its ordinary
 * error path instead of a try/catch of its own.
 */
export async function sharePdf(html, filename) {
  if (!html) return { ok: false, error: 'mm-request-invalid' };

  /* On web there is no file to share — the browser's print dialog *is* the
     preview and the "save as PDF" both. */
  if (Platform.OS === 'web') {
    try {
      await Print.printAsync({ html });
      return { ok: true, result: { printed: true } };
    } catch {
      return { ok: false, error: 'mm-request-invalid' };
    }
  }

  try {
    const { uri } = await Print.printToFileAsync({ html });

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: safeName(filename),
        UTI: 'com.adobe.pdf',
      });
      return { ok: true, result: { uri } };
    }

    /* No share sheet — the OS print dialog still gets it onto paper or into
       a file the person chooses. */
    await Print.printAsync({ uri });
    return { ok: true, result: { uri } };
  } catch {
    return { ok: false, error: 'mm-request-invalid' };
  }
}

/** Preview without sharing — §4.9's middle step. */
export async function previewPdf(html) {
  if (!html) return { ok: false, error: 'mm-request-invalid' };
  try {
    await Print.printAsync({ html });
    return { ok: true, result: { printed: true } };
  } catch {
    return { ok: false, error: 'mm-request-invalid' };
  }
}

/* ------------------------------------------------------------------ *
 * CSV
 * ------------------------------------------------------------------ */

/**
 * Share a CSV.
 *
 * `Sharing.shareAsync` needs a file and writing one needs `expo-file-system`,
 * which this app does not carry. A spreadsheet export is small enough to go
 * as text through the OS share sheet, which every mail client and messenger
 * accepts — and the clipboard is the fallback for the cases that do not.
 */
export async function shareCsv(csv, filename) {
  if (!csv) return { ok: false, error: 'mm-request-invalid' };

  const title = safeName(filename);

  if (Platform.OS === 'web') {
    await Clipboard.setStringAsync(csv);
    return { ok: true, result: { copied: true } };
  }

  try {
    await Share.share({ message: csv, title });
    return { ok: true, result: { shared: true } };
  } catch {
    await Clipboard.setStringAsync(csv);
    return { ok: true, result: { copied: true } };
  }
}

/** Put a report on the clipboard, for pasting into a message by hand. */
export async function copyText(text) {
  if (!text) return { ok: false, error: 'mm-request-invalid' };
  await Clipboard.setStringAsync(String(text));
  return { ok: true, result: { copied: true } };
}
