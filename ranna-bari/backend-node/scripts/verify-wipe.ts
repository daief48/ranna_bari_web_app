/**
 * One-shot check after the wipe: user collections empty, reference data
 * intact. Not part of the test suite — delete whenever.
 */
import { connect, disconnect } from '../src/config/db.js';
import {
  Account, Kitchen, Order, Cart, Review, ChatThread, ChatMessage, Notification,
  MealPlan, MealBooking, LedgerEntry, Store, Product, Dish, TopUp, AppSession,
  Specialty, Icon, Zone, Promotion, Setting, FeatureFlag, TaxonomyCategory,
  StoreCategory, SearchTerm, AdminUser,
} from '../src/models/index.js';

await connect();

const wiped = {
  Account, Kitchen, Order, Cart, Review, ChatThread, ChatMessage, Notification,
  MealPlan, MealBooking, LedgerEntry, Store, Product, Dish, TopUp, AppSession,
};
const kept = {
  Specialty, Icon, Zone, Promotion, Setting, FeatureFlag, TaxonomyCategory,
  StoreCategory, SearchTerm, AdminUser,
};

console.log('--- user-related (should all be 0) ---');
for (const [name, m] of Object.entries(wiped)) {
  console.log(`${name}: ${await m.countDocuments({})}`);
}
console.log('--- platform reference (should be intact) ---');
for (const [name, m] of Object.entries(kept)) {
  console.log(`${name}: ${await m.countDocuments({})}`);
}

await disconnect();
