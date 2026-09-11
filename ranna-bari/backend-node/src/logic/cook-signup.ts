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
  const existing = await Account.findOne({
    $or: [{ customerKey: email }, { email }, { phone }],
  });

  if (existing?.emailVerifiedAt) {
    return fail(ERR.ACCOUNT_EXISTS);
  }

  const passwordHash = await hashPassword(input.password);

  if (existing) {
    /* An unverified account is a registration that never finished — an email
       that bounced, an app killed mid-flow. Refusing it would weld the door
       shut behind the first attempt. The form's answers win: the person is
       looking at the fields they just typed. */
    await Account.updateOne(
      { _id: existing._id },
      {
        $set: {
          role: 'cook',
          name: input.name,
          phone,
          email,
          customerKey: existing.customerKey === phone ? existing.customerKey : email,
          kitchenName: input.kitchenName,
          specialty: input.specialties[0] ?? null,
          specialties: input.specialties,
          nid: input.nid,
          passwordHash,
        },
      },
    );
    existing.passwordHash = passwordHash;

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
