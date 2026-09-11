import nodemailer, { type Transporter } from 'nodemailer';

import { loadEnv, mailIsLive } from '../config/env.js';

/**
 * The one place mail leaves this service, and it leaves for exactly one
 * reason: a six-digit code.
 *
 * The transporter is built once and kept. On the lambda deployment a warm
 * instance reuses it across invocations, and every cold start otherwise pays
 * an SMTP handshake on the request that can least afford one — a person is
 * sitting in front of a code field watching it not arrive.
 *
 * Failures are thrown, never swallowed: the caller turns them into a refusal
 * the caller's caller can show, and a person waiting for a code that was
 * never sent is worse than one told to try again.
 */
let transporter: Transporter | null = null;

function transport(): Transporter {
  if (transporter) return transporter;
  const env = loadEnv();
  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    connectionTimeout: 8_000,
    greetingTimeout: 8_000,
  });
  return transporter;
}

export async function sendEmailOtp(to: string, code: string): Promise<void> {
  if (!mailIsLive()) {
    throw new Error('SMTP is not configured, so no mail can leave this service.');
  }

  const info = await transport().sendMail({
    from: loadEnv().MAIL_FROM,
    to,
    subject: 'Your RannaBari verification code',
    text:
      `Your RannaBari code is ${code}.\n\n` +
      'It expires in five minutes. If you did not ask for it, ignore this email — ' +
      'nobody can use it without the rest of your details.',
    html:
      '<div style="font-family:Arial,Helvetica,sans-serif;max-width:420px;margin:0 auto">' +
      '<h2 style="margin:24px 0 8px;color:#1f2937">RannaBari</h2>' +
      '<p style="margin:0 0 16px;color:#374151">Your verification code:</p>' +
      `<p style="margin:0 0 16px;font-size:32px;letter-spacing:8px;font-weight:700;color:#b45309">${code}</p>` +
      '<p style="margin:0;color:#6b7280">It expires in five minutes. ' +
      'If you did not ask for it, ignore this email.</p>' +
      '</div>',
  });

  /* The message id and never more — the log has no business holding bodies,
     and the credentials never pass through here at all. */
  console.log(`[mail] code delivered to ${to} (${info.messageId})`);
}
