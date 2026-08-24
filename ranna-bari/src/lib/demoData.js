/**
 * Demo seed data.
 *
 * Every form in the app opens pre-filled from here so the whole flow can be
 * clicked through without typing — sign in, the three-step signup, checkout
 * and cook onboarding all land on a valid state and their primary button
 * works on the first tap.
 *
 * This is scaffolding, not product. When a real backend lands, delete this
 * file and the `DEMO.*` defaults that reference it; the validation in each
 * screen is already written against empty fields and needs no changes.
 */

/** The account the Sign in tab opens with. */
export const DEMO_CREDENTIALS = {
  id: 'jubair@example.com',
  password: 'Sup3rSecret!x',
};

/** Step 2 of Create account, customer side. */
export const DEMO_SIGNUP = {
  role: 'user',
  name: 'Jubair Islam',
  phone: '+8801700000000',
  email: 'jubair@example.com',
  password: 'Sup3rSecret!x',
  terms: true,
};

/** The extra block Create account shows when the role is "cook". */
export const DEMO_KITCHEN = {
  kitchen: "Jubair's Heritage Kitchen",
  specialty: 'Traditional Heritage',
  nid: '1990123456789',
};

/** Step 3 — a pin on Dhanmondi, so "Create account" is live immediately. */
export const DEMO_ADDRESS = {
  label: 'Home',
  detail: 'House 12, Road 7, Flat 4B',
  area: 'Dhanmondi, Dhaka',
  lat: 23.7461,
  lng: 90.3742,
};

/** Cook onboarding (become-cook.js), which is a shorter version of the above. */
export const DEMO_COOK_ONBOARDING = {
  name: 'Jubair Islam',
  phone: '+8801700000000',
  zone: 'Dhanmondi, Dhaka',
  nid: '1990123456789',
};

/** Checkout, used only where the signed-in account has nothing to offer. */
export const DEMO_CHECKOUT = {
  name: 'Jubair Islam',
  phone: '+8801700000000',
  line: 'House 12, Road 7, Flat 4B',
  area: 'Dhanmondi, Dhaka',
  label: 'Home',
};

/** The profile a demo sign-in produces. */
export const demoAccount = (id) => ({
  role: 'user',
  name: DEMO_SIGNUP.name,
  email: id.includes('@') ? id.trim() : DEMO_SIGNUP.email,
  phone: id.includes('@') ? DEMO_SIGNUP.phone : id.trim(),
  area: DEMO_ADDRESS.area,
  addressDetail: DEMO_ADDRESS.detail,
  addressLabel: DEMO_ADDRESS.label,
  lat: DEMO_ADDRESS.lat,
  lng: DEMO_ADDRESS.lng,
});
