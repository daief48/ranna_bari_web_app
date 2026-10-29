import { useCallback, useEffect, useMemo } from 'react';

import { useCart } from './CartContext';
import { useCommerce } from './CommerceContext';
import { useAuth } from './AuthContext';
import { customerKeyOf } from '../lib/ledger';
import { divisionOfDistrict } from '../lib/bd-areas';

/**
 * One cart, over the two stores that actually hold things.
 *
 * Kitchen dishes live on the device (`CartContext`, AsyncStorage) and shop
 * products live on the server (`CommerceContext`, one document per customer).
 * They stay where they are — a shop line copied into local storage would go
 * stale on price and stock the moment it was written — and this is the thin
 * layer that lets every screen talk about "the cart" without knowing which
 * half it is holding.
 *
 * It is pure selection plus two dispatchers. It owns no state of its own, so
 * it cannot drift from either store, and every number it returns is one the
 * stores already computed:
 *
 *   - dishes: the flat delivery and platform fee, once per cart, as before;
 *   - shop products: `delivery` straight from the server's priced cart, which
 *     is per shop and depends on the customer's saved address. Never derived
 *     here — a client-side guess is how a screen ends up showing ৳40 while the
 *     till charges ৳80.
 *
 * Shop products carry no platform fee, and that is the server's rule, not a
 * thing this hook decides.
 */
export function useUnifiedCart() {
  const dish = useCart();
  const shop = useCommerce();
  const { account, isSignedIn } = useAuth();

  const key = customerKeyOf(account);
  const priced = shop.priceCart(key);
  const shopLines = priced.lines ?? [];

  /* ---- shop lines, grouped by the shop they come from ---- */
  const shopGroups = useMemo(() => {
    const byStore = new Map();
    for (const line of shopLines) {
      const id = String(line.storeId ?? 'unknown');
      if (!byStore.has(id)) {
        byStore.set(id, { storeId: id, storeName: line.storeName || '', lines: [] });
      }
      byStore.get(id).lines.push(line);
    }
    return Array.from(byStore.values());
  }, [shopLines]);

  /* The cart line carries a shop's id and name, not its fee rules. The rules
     decide which of a shop's two prices the customer is on, so a shop the
     device has never opened is fetched — once; `ensureStore` is idempotent. */
  const storeIds = shopGroups.map((g) => g.storeId).join('|');
  useEffect(() => {
    for (const g of shopGroups) {
      if (g.storeId !== 'unknown' && !shop.storeById(g.storeId)) shop.ensureStore(g.storeId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeIds]);

  const stores = shopGroups.map((g) => shop.storeById(g.storeId)).filter(Boolean);

  /* Which side of the fee the customer is on, named where the number is. The
     server picks the amount; this only says which rate it was. */
  const splitStore = stores.find(
    (s) => s.deliveryFeeInsideDhaka != null || s.deliveryFeeOutsideDhaka != null,
  );
  const division =
    account?.division ||
    divisionOfDistrict(account?.district) ||
    divisionOfDistrict(account?.area) ||
    '';
  const shopHome = splitStore?.homeDivision || 'Dhaka';
  const shopSide = splitStore && division ? (division === shopHome ? 'inside' : 'outside') : null;

  const hasDish = dish.items.length > 0;
  const hasShop = shopLines.length > 0;

  const shopCount = shopLines.reduce((sum, l) => sum + l.qty, 0);

  const setShopQty = useCallback(
    (lineKey, qty) => shop.setCartQty(key, lineKey, qty),
    [shop, key],
  );
  const removeShopLine = useCallback(
    (lineKey) => shop.removeFromCart(key, lineKey),
    [shop, key],
  );

  return {
    key,
    isSignedIn,
    account,

    hasDish,
    hasShop,
    /** Anything at all, either kind. */
    isEmpty: !hasDish && !hasShop,

    /** Units across both halves — what a badge counts. */
    count: dish.count + shopCount,

    /* ---- kitchen dishes (device) ---- */
    dishItems: dish.items,
    dishSubtotal: dish.subtotal,
    dishDelivery: dish.deliveryFee,
    platformFee: dish.platformFee,
    /** Dish subtotal plus its flat fees. */
    dishTotal: dish.total,
    updateDishQty: dish.updateQty,
    removeDish: dish.remove,
    addDish: dish.add,
    clearDishes: dish.clear,

    /* ---- shop products (server) ---- */
    shopLines,
    shopGroups,
    shopCount,
    shopSubtotal: priced.subtotal ?? 0,
    shopDelivery: priced.delivery ?? 0,
    /** Shop subtotal plus the server's per-shop delivery. */
    shopTotal: priced.total ?? 0,
    hasPreorder: !!priced.hasPreorder,
    /** The lines the server would refuse, in the order it would refuse them. */
    problems: priced.problems ?? [],
    shopSide,
    shopHome,
    division,
    /** True when a shop in the cart prices by region and the address has none. */
    needsDivision: !!splitStore && !division,
    setShopQty,
    removeShopLine,

    /* ---- the two together ---- */
    subtotal: dish.subtotal + (priced.subtotal ?? 0),
    delivery: dish.deliveryFee + (priced.delivery ?? 0),
    total: dish.total + (priced.total ?? 0),
  };
}
