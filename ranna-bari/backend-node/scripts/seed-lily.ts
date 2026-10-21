/**
 * Seed one fully-loaded cook — **Lily Sweet Kitchen** — so the redesigned
 * dashboard can be judged with real data on it.
 *
 * Creates (idempotently, re-runnable):
 *   - a cook account   lily@rannabari.test  /  password: lily1234
 *   - the kitchen (KYC approved, verified, open, Banani, radius 5 km)
 *   - six dishes, one shop with five products (some out, one pre-orderable)
 *   - an active meal service + a published menu for the current month
 *   - four customers who order from her
 *   - ~28 orders across the last seven days — lunch and dinner spikes, the
 *     mix of kinds, today's pipeline in all its stages, held money
 *   - nine reviews (spread 5→2) and the kitchen's recomputed score
 *   - the ledger entries those orders imply
 *
 * Re-running wipes only Lily's own previous demo rows first. Other kitchens'
 * data is never touched.
 *
 *   npx tsx scripts/seed-lily.ts
 */
import { connect, disconnect } from '../src/config/db.js';
import { hashPassword } from '../src/auth/admin-auth.js';
import { Kitchen, LedgerEntry, MealPlan, MealService, Order, Review, Store, Product, StoreCategory, Account, Dish } from '../src/models/index.js';
import { post } from '../src/logic/ledger.js';
import { tx } from '../src/config/db.js';

const EMAIL = 'lily@rannabari.test';
const PHONE = '+8801755500111';
const PASSWORD = 'lily1234';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** A Date `days` back, set to hour:minute local. */
const at = (daysBack: number, hour: number, minute = 0) => {
  const d = new Date(Date.now() - daysBack * DAY);
  d.setHours(hour, minute, 0, 0);
  return d;
};

/** Dhaka 'YYYY-MM-DD' of a Date. */
const dhakaDate = (d: Date) =>
  new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Dhaka' }))
    .toISOString()
    .slice(0, 10);

const todayDhaka = () => dhakaDate(new Date());

const code = (prefix: string) =>
  `${prefix}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

const img = (id: string) => `https://images.unsplash.com/photo-${id}?w=600&h=400&fit=crop`;

await connect();

await (async () => {
  /* ---------------------------------------------------------------- *
   * the cook
   * ---------------------------------------------------------------- */
  const passwordHash = await hashPassword(PASSWORD);

  let account = await Account.findOne({ customerKey: EMAIL });
  if (!account) {
    account = await Account.create({
      customerKey: EMAIL,
      role: 'cook',
      name: 'Lily Rahman',
      phone: PHONE,
      email: EMAIL,
      emailVerifiedAt: new Date(),
      nid: '1990123456789',
      kitchenName: 'Lily Sweet Kitchen',
      specialty: 'Street & Snacks',
      specialties: ['Street & Snacks', 'Biryani & Rice', 'Desserts & Pitha'],
      area: 'Banani',
      lat: 23.7925,
      lng: 90.4078,
      deliveryRadiusKm: 5,
      passwordHash,
    });
    console.log('account created');
  } else {
    await Account.updateOne(
      { _id: account._id },
      { $set: { role: 'cook', passwordHash, emailVerifiedAt: account.emailVerifiedAt ?? new Date() } },
    );
    console.log('account exists — refreshed password');
  }
  const accountId = String(account._id);

  /* ---------------------------------------------------------------- *
   * the kitchen
   * ---------------------------------------------------------------- */
  const kitchenFields = {
    name: 'Lily Sweet Kitchen',
    ownerName: 'Lily Rahman',
    avatar:
      'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400&h=400&fit=crop',
    coverImage: img('1556910103-1c02745aae4d'),
    photos: [img('1556909114-f6e7ad7d3136'), img('1466637574441-749b8f19452f'), img('1504674900247-0877df9cc836')],
    specialty: 'Street & Snacks',
    specialties: ['Street & Snacks', 'Biryani & Rice', 'Desserts & Pitha'],
    description:
      'Fuchka, chotpoti and home-style biryani from a Banani kitchen. Cooked to order, packed the minute it is ready.',
    area: 'Banani',
    lat: 23.7925,
    lng: 90.4078,
    deliveryRadiusKm: 5,
    isOpen: true,
    isVerified: true,
    kycStatus: 'approved',
    documentsSubmittedAt: new Date(Date.now() - 40 * DAY),
    payoutMethod: 'bkash',
    payoutAccount: '01712345678',
  };

  let kitchen: any = await Kitchen.findOne({ accountId });
  if (kitchen) {
    await Kitchen.updateOne({ _id: kitchen._id }, kitchenFields);
    kitchen = await Kitchen.findById(kitchen._id).lean();
    console.log('kitchen updated');
  } else {
    kitchen = await Kitchen.create({ accountId, ...kitchenFields });
    kitchen = kitchen.toObject();
    console.log('kitchen created');
  }
  const kitchenId = String(kitchen._id);

  /* ---------------------------------------------------------------- *
   * the menu
   * ---------------------------------------------------------------- */
  const DISHES: [string, number, string][] = [
    ['Fuchka (8 pieces) — Tetul Jol', 80, img('1606491956689-2ea866880c84')],
    ['Chotpoti — Extra Spicy', 120, img('1547592180-85f173990554')],
    ['Kacchi Biryani (single)', 260, img('1633945889872-3e7d8c4a4b3a')],
    ['Beef Tehari', 220, img('1596797038530-2c107229654b')],
    ['Shahi Jorda', 90, img('1601303517594-9b5c2c5b3a1a')],
    ['Chicken Roll (2 pieces)', 140, img('1601050690597-df0568f70950')],
  ];

  const existingDishes = await Dish.find({ kitchenId });
  const dishMap = new Map(existingDishes.map((d) => [d.name, d]));
  for (const [name, price, image] of DISHES) {
    const found = dishMap.get(name);
    if (found) {
      await Dish.updateOne({ _id: found._id }, { $set: { price, image, available: true } });
    } else {
      await Dish.create({ kitchenId, name, description: 'Cooked to order.', price, image, tags: ['lunch', 'dinner'], available: true });
    }
  }
  console.log('dishes seeded:', DISHES.length);

  /* ---------------------------------------------------------------- *
   * the shop — one store, five products
   * ---------------------------------------------------------------- */
  let store = await Store.findOne({ kitchenId });
  if (!store) {
    store = await Store.create({
      kitchenId,
      name: "Lily's Achar & Pitha Ghor",
      tagline: 'Achar, jorda and pitha — made to keep',
      description: 'Everything here keeps for weeks.',
      logo: kitchen.avatar,
      cover: kitchen.photos[0],
      phone: PHONE,
      area: 'Banani',
      lat: 23.7925,
      lng: 90.4078,
      deliveryRadiusKm: 6,
      deliveryFee: 40,
      freeDeliveryOver: 500,
      isOpen: true,
    });
    console.log('store created');
  }
  const storeId = String(store._id);

  let category = await StoreCategory.findOne({ storeId });
  if (!category) {
    category = await StoreCategory.create({ storeId, name: 'Achar & Sweets', emoji: '🌶', order: 0 });
  }

  const PRODUCTS: [string, number, number, boolean][] = [
    ['Aam Achar (500g jar)', 220, 12, false],
    ['Chalti Achar (300g jar)', 180, 0, true], // out, pre-orderable
    ['Shahi Jorda Box (1kg)', 450, 6, false],
    ['Nokshi Pitha Pack', 350, 0, false], // out, no preorder
    ['Ghee Biscuit Tin', 280, 9, false],
  ];
  for (const [name, price, stock, preorder] of PRODUCTS) {
    const existing = await Product.findOne({ storeId, name });
    if (existing) {
      await Product.updateOne(
        { _id: existing._id },
        { $set: { price, stock, preorder, active: true, images: [img('1606787366850-de6330128645')] } },
      );
    } else {
      await Product.create({
        storeId,
        categoryId: String(category._id),
        name,
        description: 'Homemade, sealed, labelled with the date.',
        price,
        stock,
        minQty: 1,
        images: [img('1606787366850-de6330128645')],
        active: true,
        preorder,
      });
    }
  }
  console.log('products seeded:', PRODUCTS.length);

  /* ---------------------------------------------------------------- *
   * the meal system — service + this month's published menu
   * ---------------------------------------------------------------- */
  const month = todayDhaka().slice(0, 7);
  const service = await MealService.findOne({ kitchenId });
  if (!service) {
    await MealService.create({
      kitchenId,
      categoryKey: 'lunch',
      rate: 75,
      minMeals: 1,
      maxMeals: 3,
      active: true,
      cookName: kitchen.name,
    });
    console.log('meal service created');
  } else {
    await MealService.updateOne(
      { _id: service._id },
      { $set: { active: true, rate: 75, cookName: kitchen.name, categoryKey: 'lunch' } },
    );
    console.log('meal service refreshed');
  }

  const monthDays = [];
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const LUNCH = ['Kacchi Biryani', 'Beef Tehari', 'Chicken Roast & Polao', 'Khichuri & Beef'];
  const DINNER = ['Fuchka & Chotpoti', 'Chicken Roll', 'Paratha & Bhaji', 'Fried Rice & Chicken'];
  for (let day = 1; day <= lastDay; day += 1) {
    const date = `${month}-${String(day).padStart(2, '0')}`;
    monthDays.push({
      date,
      lunch: LUNCH[day % LUNCH.length] ?? '',
      dinner: DINNER[day % DINNER.length] ?? '',
      breakfast: '',
    });
  }
  await MealPlan.findOneAndUpdate(
    { scope: 'cook', categoryKey: 'lunch', month, kitchenId },
    { $set: { days: monthDays, status: 'published', updatedBy: kitchenId } },
    { upsert: true },
  );
  console.log('meal plan published for', month);

  /* ---------------------------------------------------------------- *
   * customers
   * ---------------------------------------------------------------- */
  const CUSTOMERS: [string, string, string, string][] = [
    ['Rafi Ahmed', '+8801755500101', 'customer+lily1@rannabari.test', 'Banani'],
    ['Nusrat Jahan', '+8801755500102', 'customer+lily2@rannabari.test', 'Mohakhali'],
    ['Tanvir Hasan', '+8801755500103', 'customer+lily3@rannabari.test', 'Gulshan'],
    ['Sumaiya Islam', '+8801755500104', 'customer+lily4@rannabari.test', 'Banani'],
  ];
  const customers: any[] = [];
  for (const [name, phone, email, area] of CUSTOMERS) {
    let c = await Account.findOne({ customerKey: email });
    if (!c) {
      c = await Account.create({
        customerKey: email,
        role: 'user',
        name,
        phone,
        email,
        emailVerifiedAt: new Date(),
        area,
      });
    }
    customers.push({ ...c.toObject(), area });
  }

  /* ---------------------------------------------------------------- *
   * clear this kitchen's previous demo rows, so re-running is safe
   * ---------------------------------------------------------------- */
  const oldOrders = await Order.find({ kitchenId }).select({ _id: 1 }).lean();
  const oldIds = oldOrders.map((o) => String(o._id));
  if (oldIds.length) {
    await Order.deleteMany({ _id: { $in: oldIds } });
    // The ledger is append-only by schema; the maintenance bypass is the raw
    // collection — the same door scripts/delete-all-users.ts uses.
    await LedgerEntry.collection.deleteMany({ orderId: { $in: oldIds } });
    await Review.deleteMany({ kitchenId });
    console.log('cleared previous demo rows:', oldIds.length, 'orders');
  }

  /* ---------------------------------------------------------------- *
   * the orders — a week that looks like a week
   * ---------------------------------------------------------------- */
  const address = (c: any) => ({
    label: 'Home',
    line: `Road ${5 + (c.name.length % 10)}`,
    area: c.area,
  });
  const hourAt = (daysBack: number, hour: number, minute: number) =>
    at(daysBack, hour, minute).toISOString();

  let made = 0;
  const makeOrder = async (spec: any) => {
    const customer = spec.customer;
    const isCod = spec.kind === 'cod';
    const settled = spec.status === 'completed' || spec.status === 'delivered';
    const cancelled = spec.status === 'cancelled' || spec.status === 'rejected';
    const payment = isCod ? 'cod' : settled ? 'released' : cancelled ? 'refunded' : 'held';
    const rate = spec.kind === 'store' ? 0.12 : spec.kind === 'meal' ? 0.15 : 0.15;
    const platformAmount = settled ? Math.round(spec.amount * rate) : 0;
    const cookAmount = settled ? spec.amount - platformAmount : 0;

    const order = await Order.create({
      code: code('RB'),
      kind: spec.kind,
      storeId: spec.storeId ?? null,
      kitchenId,
      cookName: kitchen.name,
      title: spec.title,
      image: spec.image ?? '',
      customerKey: customer.customerKey,
      customerName: customer.name,
      phone: customer.phone,
      address: { ...address(customer) },
      handover: 'delivery',
      serveDate: spec.serveDate ?? null,
      slot: spec.slot ?? null,
      lines: spec.lines ?? [],
      subtotal: spec.amount,
      deliveryFee: 0,
      platformFee: 0,
      price: spec.amount,
      amount: spec.amount,
      status: spec.status,
      payment,
      cookAmount,
      platformAmount,
      history: [{ status: spec.status, at: spec.createdAt.toISOString() }],
      deliveredAt: spec.delivered ?? null,
      completedAt: settled ? spec.createdAt : null,
      createdAt: spec.createdAt,
    });
    made += 1;

    if (!isCod) {
      await tx(async (session) => {
        await post(session, {
          kind: 'hold',
          amount: spec.amount,
          from: 'customer',
          to: 'held',
          fromRef: customer.customerKey,
          orderId: String(order._id),
          idemKey: `hold:${String(order._id)}`,
          note: `Held for ${spec.title}`,
        });
        if (settled) {
          await post(session, {
            kind: 'release',
            amount: cookAmount,
            from: 'held',
            to: 'cook',
            toRef: kitchenId,
            orderId: String(order._id),
            idemKey: `release:${String(order._id)}`,
            note: `Released for ${spec.title}`,
          });
          if (platformAmount > 0) {
            await post(session, {
              kind: 'commission',
              amount: platformAmount,
              from: 'held',
              to: 'platform',
              orderId: String(order._id),
              idemKey: `commission:${String(order._id)}`,
              note: `Commission on ${spec.title}`,
            });
          }
        } else if (cancelled) {
          await post(session, {
            kind: 'refund',
            amount: spec.amount,
            from: 'held',
            to: 'customer',
            toRef: customer.customerKey,
            orderId: String(order._id),
            idemKey: `refund:${String(order._id)}`,
            note: `Refund for ${spec.title}`,
          });
        }
      });
    }
    return order;
  };

  const dishRows = await Dish.find({ kitchenId }).lean();
  const pickDish = (): any => {
    const d = dishRows[Math.floor(Math.random() * dishRows.length)];
    const qty = 1 + Math.floor(Math.random() * 2);
    return { title: d.name, image: d.image, amount: d.price * qty, lines: [{ id: String(d._id), name: d.name, price: d.price, qty }] };
  };

  /* Days 6..1 — the settled past. Lunch (12–14) and dinner (19–21) spikes. */
  for (let daysBack = 6; daysBack >= 1; daysBack -= 1) {
    const lunchCount = 1 + (daysBack % 2);
    const dinnerCount = 2;
    for (let i = 0; i < lunchCount + dinnerCount; i += 1) {
      const lunch = i < lunchCount;
      const customer = customers[Math.floor(Math.random() * customers.length)];
      const dish = pickDish();
      const isStore = daysBack % 2 === 0 && i === lunchCount; // one store order on even days
      const createdAt = lunch ? at(daysBack, 12, 10 + i * 25) : at(daysBack, 19, 15 + i * 20);
      await makeOrder({
        kind: isStore ? 'store' : i === lunchCount + 1 && daysBack % 3 === 0 ? 'meal' : 'wallet',
        storeId: isStore ? storeId : null,
        customer,
        title: isStore ? 'Aam Achar (500g jar)' : dish.title,
        image: isStore ? img('1606787366850-de6330128645') : dish.image,
        amount: isStore ? 220 : dish.amount,
        lines: isStore ? [] : dish.lines,
        status: 'completed',
        createdAt,
        delivered: new Date(new Date(createdAt).getTime() + 2 * HOUR).toISOString(),
      });
    }
  }

  /* Today — a day mid-flight: the full pipeline + held money + tonight's plates. */
  const today = customers[0];
  const c2 = customers[1];
  const c3 = customers[2];

  // yesterday evening — two delivered, wallet, one still held (customer hasn't confirmed)
  const yHold = await makeOrder({
    kind: 'wallet', customer: c2, title: 'Kacchi Biryani (single)', image: dishRows[2]?.image ?? '',
    amount: 260, lines: [], status: 'delivered',
    createdAt: at(0, 20, 30), delivered: new Date(Date.now() - 3 * HOUR).toISOString(),
  });
  await Order.updateOne({ _id: yHold._id }, { $set: { payment: 'held' } });

  await makeOrder({
    kind: 'wallet', customer: c3, title: 'Fuchka (8 pieces) — Tetul Jol', image: dishRows[0]?.image ?? '',
    amount: 160, lines: [], status: 'completed',
    createdAt: at(0, 19, 5), delivered: new Date(Date.now() - 4 * HOUR).toISOString(),
  });

  // today — the live pipeline
  await makeOrder({
    kind: 'cod', customer: today, title: 'Chotpoti — Extra Spicy', image: dishRows[1]?.image ?? '',
    amount: 240, lines: [], status: 'placed',
    createdAt: at(0, 11, 40),
  });
  await makeOrder({
    kind: 'wallet', customer: c2, title: 'Beef Tehari', image: dishRows[3]?.image ?? '',
    amount: 220, lines: [], status: 'accepted',
    createdAt: at(0, 12, 5),
  });
  const cooking = await makeOrder({
    kind: 'wallet', customer: c3, title: 'Chicken Roll (2 pieces)', image: dishRows[5]?.image ?? '',
    amount: 280, lines: [], status: 'cooking',
    createdAt: at(0, 12, 30),
  });
  await Order.updateOne({ _id: cooking._id }, { $set: { payment: 'held' } });
  await makeOrder({
    kind: 'wallet', customer: today, title: 'Shahi Jorda', image: dishRows[4]?.image ?? '',
    amount: 180, lines: [], status: 'on_the_way',
    createdAt: at(0, 12, 55),
  });
  await makeOrder({
    kind: 'cod', customer: c2, title: 'Kacchi Biryani (single)', image: dishRows[2]?.image ?? '',
    amount: 520, lines: [], status: 'delivered',
    createdAt: at(0, 9, 30), delivered: new Date(Date.now() - 1 * HOUR).toISOString(),
  });

  // tonight's meal plates — confirmed, so the gauge and the meals panel have a day
  for (const [i, c] of [today, c2, c3].entries()) {
    await makeOrder({
      kind: 'meal', customer: c,
      title: i === 0 ? 'Kacchi Biryani' : i === 1 ? 'Beef Tehari' : 'Chicken Roast & Polao',
      image: img('1633945889872-3e7d8c4a4b3a'),
      amount: 75, lines: [], status: 'confirmed',
      serveDate: todayDhaka(), slot: 'dinner',
      createdAt: at(1, 10, 0),
    });
  }
  // yesterday's plates — delivered
  await makeOrder({
    kind: 'meal', customer: today,
    title: 'Khichuri & Beef', image: img('1596797038530-2c107229654b'),
    amount: 75, lines: [], status: 'delivered',
    serveDate: dhakaDate(at(1, 13, 0)), slot: 'lunch',
    createdAt: at(2, 10, 0), delivered: at(1, 14, 0).toISOString(),
  });

  console.log('orders created:', made);

  /* ---------------------------------------------------------------- *
   * reviews — the spread behind the score
   * ---------------------------------------------------------------- */
  const REVIEWS = [
    ['Rafi Ahmed', 5, 'Fuchka-r jol ta ekdom thik chilo. Ei jaygay abar o nibo.', 6],
    ['Nusrat Jahan', 5, 'Best kacchi in Banani, hands down. Arrived hot.', 5],
    ['Tanvir Hasan', 4, 'Tehari khub shundor, ektu beshi oil chilo.', 5],
    ['Sumaiya Islam', 5, 'Jorda ta amazing! Puro family khub pochondo korse.', 4],
    ['Rafi Ahmed', 4, 'Delivery 15 min late, but the food made up for it.', 4],
    ['Nusrat Jahan', 5, 'Roll gulo crisp chilo. Highly recommended.', 3],
    ['Tanvir Hasan', 3, 'Beshi torka chilo amar jonno. Onno der jonno bhalo hote pare.', 3],
    ['Sumaiya Islam', 2, 'Order e onek deri hoyeche. Khabar thik chilo kintu.', 2],
    ['Rafi Ahmed', 5, 'Achar jar ta outstanding — order korbo abar.', 1],
  ];
  const reviewDocs: any[] = [];
  for (const [name, rating, text, daysBack] of REVIEWS as [string, number, string, number][]) {
    const c: any = customers.find((x) => x.name === name) ?? customers[0];
    reviewDocs.push({
      kitchenId,
      orderId: null,
      customerKey: c.customerKey,
      name: c.name,
      avatar: '',
      area: c.area,
      rating,
      text,
      createdAt: at(daysBack, 15, 0),
    });
  }
  await Review.create(reviewDocs);

  const all = await Review.find({ kitchenId }).lean();
  const mean = all.reduce((s, r) => s + r.rating, 0) / all.length;
  await Kitchen.updateOne(
    { _id: kitchen._id },
    { $set: { rating: Math.round(mean * 10) / 10, reviewCount: all.length } },
  );
  console.log('reviews seeded:', all.length, '— score', Math.round(mean * 10) / 10);

  console.log('\n✅ Lily Sweet Kitchen ready.');
  console.log('   sign in (cook, email + password):');
  console.log('   ' + EMAIL + '  /  ' + PASSWORD);
  process.exit(0);
})()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => disconnect());
