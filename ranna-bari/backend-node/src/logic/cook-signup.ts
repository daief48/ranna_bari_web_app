import { Account, Kitchen, type AccountDoc } from '../models/index.js';
import { ERR, fail, ok, type Result } from '../lib/domain.js';
import { hashPassword } from '../auth/admin-auth.js';
import { normalisePhone } from '../auth/app-auth.js';
import { normaliseEmail } from '../auth/cook-auth.js';

/**
 * The cook flow's registration write — the form, the email verification and
 * the document step before it are this module's callers.
 *
 * It sits beside `registerKitchen` (sync.ts) rather than replacing it. That
 * one still serves a signed-in cook from the profile editor; this one owns
 * the path that starts with no session at all and must therefore also create
 * the account, hold a password and remember an NID — three things the old
 * path never touched.
 *
 * A kitchen created here arrives exactly as `registerKitchen` makes one:
 * `isVerified: false, kycStatus: 'pending'`. Registration proves a person
 * filled in a form; the KYC queue proves the rest.
 */

export type CookRegistrationInput = {
  name: string;
  phone: string;
  email: string;
  password: string;
  kitchenName: string;
  specialties: string[];
  nid: string;
  area?: string;
  lat?: number;
  lng?: number;
  deliveryRadiusKm?: number;
  addressDetail?: string;
};

export type CookRegistrationResult =
  | Result<{ account: AccountDoc; created: boolean }>
  | { ok: false; error: typeof ERR.ACCOUNT_EXISTS };

/** The kitchen fields this flow may write, shared by create and resume. */
function kitchenFields(input: CookRegistrationInput) {
  const specialty = input.specialties[0] ?? '';
  return {
    name: input.kitchenName,
    ownerName: input.name,
    specialty,
    specialties: input.specialties,
    area: input.area ?? '',
    lat: typeof input.lat === 'number' ? input.lat : 0,
    lng: typeof input.lng === 'number' ? input.lng : 0,
    deliveryRadiusKm: typeof input.deliveryRadiusKm === 'number' ? input.deliveryRadiusKm : 3,
  };
}

export async function registerCook(
  input: CookRegistrationInput,
): Promise<Result<{ account: AccountDoc; created: boolean }>> {
  const phone = normalisePhone(input.phone);
  if (!phone) return fail(ERR.PHONE_REQUIRED);

  const email = normaliseEmail(input.email);
  if (!email) return fail(ERR.EMAIL_INVALID);

  /* One query answers "phone taken", "email taken" and "half-finished
     registration" at once — the three states this form can collide with. */
  const matches = await Account.find({
    $or: [{ customerKey: email }, { email }, { phone }],
  });

  /* Only a registration that *this form* started may be resumed: a cook
     account whose email was never verified and whose phone was never proved at
     a sign-in. Anything else matching the phone or email — a customer who
     signed in by OTP, a verified cook — belongs to somebody who has proved
     they hold it, and typing their phone number into a form proves nothing.
     Resuming it would hand the typist that account's password, role and (via
     the email OTP they then verify) a session on it. */
  const resumable = (a: (typeof matches)[number]) =>
    a.role === 'cook' && !a.emailVerifiedAt && !a.phoneVerifiedAt;

  if (matches.some((a) => !resumable(a)) || matches.length > 1) {
    return fail(ERR.ACCOUNT_EXISTS);
  }

  const existing = matches[0] ?? null;

  if (existing) {
    /*
     * An unverified registration never finished — an email that bounced, an
     * app killed mid-flow. Refusing it would weld the door shut behind the
     * first attempt, so the form's answers for the *kitchen* win: the person
     * is looking at the fields they just typed.
     *
     * The credentials do not. This used to overwrite the password, the phone
     * and the email with whatever the second form said, on the strength of
     * nothing — an unverified account is one nobody has proved they hold,
     * and that cuts both ways. A stranger who knew the email could put their
     * own phone on it and sign in by phone OTP; one who put their own
     * password on it was signed in the moment the real owner verified the
     * code that the stranger's attempt had mailed them. So a resume has to
     * match the account on *both* the email and the phone it was opened
     * with — anything else is somebody else's registration and reads
     * `account-exists`, which routes them to sign-in and the resend button —
     * and the password stays what the first attempt set. A cook who mistyped
     * it has the reset flow, which proves the inbox before it changes a thing.
     */
    if (existing.email !== email || existing.phone !== phone) {
      return fail(ERR.ACCOUNT_EXISTS);
    }

    await Account.updateOne(
      { _id: existing._id },
      {
        $set: {
          name: input.name,
          kitchenName: input.kitchenName,
          specialty: input.specialties[0] ?? null,
          specialties: input.specialties,
          nid: input.nid,
        },
      },
    );

    const kitchen = await Kitchen.findOne({ accountId: String(existing._id) });
    if (kitchen) {
      await Kitchen.updateOne({ _id: kitchen._id }, kitchenFields(input));
    } else {
      await Kitchen.create({
        accountId: String(existing._id),
        ...kitchenFields(input),
        photos: [],
        coverImage: '',
        isVerified: false,
        kycStatus: 'pending',
      });
    }

    return ok({ account: existing, created: false });
  }

  const passwordHash = await hashPassword(input.password);

  const account = await Account.create({
    customerKey: email,
    role: 'cook',
    name: input.name,
    phone,
    email,
    nid: input.nid,
    kitchenName: input.kitchenName,
    specialty: input.specialties[0] ?? null,
    specialties: input.specialties,
    addressDetail: input.addressDetail ?? null,
    area: input.area ?? null,
    lat: typeof input.lat === 'number' ? input.lat : null,
    lng: typeof input.lng === 'number' ? input.lng : null,
    deliveryRadiusKm: typeof input.deliveryRadiusKm === 'number' ? input.deliveryRadiusKm : null,
    passwordHash,
  });

  await Kitchen.create({
    accountId: String(account._id),
    ...kitchenFields(input),
    photos: [],
    coverImage: '',
    isVerified: false,
    kycStatus: 'pending',
  });

  return ok({ account, created: true });
}
