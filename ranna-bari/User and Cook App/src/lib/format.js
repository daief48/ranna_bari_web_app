/**
 * Numbers, as typed.
 *
 * `n()` in the language context turns the app's numbers into Bengali
 * numerals for display. Nothing did the reverse. A phone with its keyboard
 * set to Bengali types ০১৭১২ into the same field, and every parse in the
 * app — `replace(/\D/g, '')`, `replace(/[^0-9]/g, '')`, `Number(value)` —
 * treats those as not digits at all: the phone number came out empty and
 * "too short", the top-up amount became NaN, the OTP field refused its own
 * code. Folding the digits to ASCII before any of that runs is the whole fix,
 * so it lives in one place and every parse calls it first.
 *
 * Only digits are folded. Letters, spaces, the `+` on a dialling code and
 * the Bengali text around a number are left exactly as they were, so this is
 * safe to run over a whole field rather than a number alone.
 */
const BENGALI_DIGITS = '০১২৩৪৫৬৭৮৯';

export function foldDigits(value) {
  const s = value == null ? '' : String(value);
  return s.replace(/[০-৯]/g, (d) => String(BENGALI_DIGITS.indexOf(d)));
}

/** The digits of a string and nothing else, in ASCII — what a phone or an
    OTP field is actually asking for. */
export const digitsOnly = (value) => foldDigits(value).replace(/\D/g, '');
