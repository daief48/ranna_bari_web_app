import { call } from './server.js';

/**
 * The cook flow's own door, as thin as the rest of the API adapters.
 *
 * One wrapper per endpoint and nothing else: the token lifecycle lives in
 * `SessionContext`, the screens live in `app/`, and all this does is keep the
 * paths and payload shapes in one place — the same reason every other fetch
 * in the app goes through `call`.
 */

/** Step 1 — the form. Sends the code to the cook's email on success. */
export const cookRegister = (body) => call('/auth/cook/register', { method: 'POST', body });

/** Step 2 — the emailed code. Signs the cook in on success. */
export const cookVerifyEmail = (body) => call('/auth/cook/verify-email', { method: 'POST', body });

/** The resend button. A 429 here carries `retryAfterSeconds` — the countdown. */
export const cookResendOtp = (email, purpose = 'register') =>
  call('/auth/cook/resend-otp', { method: 'POST', body: { email, purpose } });

/** Returning cooks, by email and password. */
export const cookSignIn = (body) => call('/auth/cook/sign-in', { method: 'POST', body });

/** Forgot password, step 1 — the answer is the same whether or not the email has an account. */
export const cookForgotPassword = (email) =>
  call('/auth/cook/forgot-password', { method: 'POST', body: { email } });

/** Forgot password, step 2 — the code plus the new password. */
export const cookResetPassword = (body) =>
  call('/auth/cook/reset-password', { method: 'POST', body });

/** The document step — both NID faces, an optional portrait, the kitchen gallery. */
export const submitCookDocuments = (token, body) =>
  call('/kitchens/mine/documents', { method: 'POST', token, body });

/** What already landed, for a cook resuming mid-flow. Metadata, no bytes. */
export const fetchCookDocuments = (token) => call('/kitchens/mine/documents', { token });
