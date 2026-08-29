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
/* Sign-in is a phone and a one-time code now, so the demo credential is a
   number rather than an id and a password. */
export const DEMO_CREDENTIALS = {
  phone: '01712345678',
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

/** Topping up the wallet — the amount the field opens on. */
export const DEMO_TOPUP = { amount: '1000' };

/**
 * A food request, ready to post.
 *
 * Specific on purpose. "Cake for Friday" tells a cook nothing and produces a
 * useless bid; the detail here is what a real request looks like when the
 * customer wants the right thing back.
 */
export const DEMO_REQUEST = {
  title: 'Two-pound chocolate truffle cake',
  description:
    'Birthday on Friday evening. Dark chocolate, not too sweet, and "Happy Birthday Ammu" written on top. Collecting at 6pm if that is easier.',
  quantity: '1',
  budget: '2400',
  category: 'cake',
};

/** Publishing tomorrow's meal, cook side. */
export const DEMO_MEAL = {
  title: 'Shorshe Ilish with steamed rice',
  description:
    'Hilsa steamed in raw mustard paste and wrapped in banana leaf, the way it is done at home. Comes with rice and a slice of lemon.',
  price: '520',
  capacity: '12',
  slot: 'dinner',
  handoverNote: 'Delivered warm, or collect from the kitchen door after 7pm.',
};

/** A dish on the menu. */
export const DEMO_DISH = {
  name: 'Heritage Mutton Bhuna',
  description: 'Slow-cooked mutton with grandmother spicing. No shortcuts, no food colour.',
  price: '600',
};

/** A shelf product in the cook's shop. */
export const DEMO_PRODUCT = {
  name: 'Aam er achar (500g)',
  description:
    'Sun-cured green mango pickle in mustard oil. No preservative, so keep it out of the sun and use a dry spoon.',
  price: '320',
  stock: '24',
  minQty: '1',
  maxQty: '6',
  prepTime: '1–2 days',
  deliveryNote: 'Packed in a sealed jar, bubble-wrapped.',
};

/** The cook's shop profile. */
export const DEMO_STORE = {
  name: "Jubair's Pantry",
  tagline: 'Made in the kitchen, sold off the shelf.',
  description:
    'Jars, frozen things and sweets from the same kitchen that cooks your dinner. Everything made in small batches, nothing bought in.',
  phone: '+8801700000000',
  deliveryFee: '40',
  freeDeliveryOver: '800',
};

/** A shelf inside the shop. */
export const DEMO_STORE_CATEGORY = { name: 'Pickles & achar', emoji: '🫙' };

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
