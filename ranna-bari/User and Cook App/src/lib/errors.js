/**
 * What a refusal reads like, in one place.
 *
 * Lifted out of `MealBits` so the alert layer can use it: that file imports
 * `CommerceContext`, and pulling a store into the component that shows a
 * dialog is a cycle waiting to happen. Nothing here touches React.
 */
/**
 * Turn a refusal code into a sentence.
 *
 * The rules return codes so they stay language-free; this is the one place
 * that decides how each one reads, so the same failure says the same thing
 * on the customer screen and the cook's, and in the store as well as in the
 * meal system.
 */
export function errorText(error, t, n, extra = {}) {
  switch (error) {
    case 'meal-missing':
      return t('That meal is no longer listed.');
    case 'meal-closed':
      return t('This meal is no longer taking orders.');
    case 'meal-deadline-passed':
      return t('Orders for this meal have closed.');
    case 'meal-sold-out':
      return t('This meal is sold out.');
    case 'meal-already-ordered':
      return t('You have already booked this meal.');
    case 'wallet-low-balance':
      return t('Insufficient balance. Top up ৳{n} to confirm this meal.', {
        n: n(extra.short ?? 0),
      });
    case 'order-missing':
      return t('That order no longer exists.');
    case 'order-wrong-state':
      return t('That cannot be done at this stage of the order.');
    case 'order-already-settled':
      return t('This order has already been settled.');
    case 'amount-invalid':
      return t('Enter a valid amount.');
    /* Not an amount — the body carried a field the server could not read, and
       `detail.field` names it. */
    case 'request-invalid':
      return extra.detail?.field
        ? t('Check the {field} and try again.', { field: extra.detail.field })
        : t('Something in that was not valid. Try again.');

    /* ---- cook stores ---- */
    case 'store-missing':
      return t('That shop is no longer listed.');
    case 'store-closed':
      return t('This shop is closed right now.');
    case 'product-missing':
      return t('That product is no longer listed.');
    case 'product-unavailable':
      return t('{name} is not on sale right now.', { name: extra.productName ?? '' });
    case 'product-out-of-stock':
      return t('{name} is out of stock.', { name: extra.productName ?? '' });
    case 'product-not-enough-stock':
      return t('Only {n} left of {name}.', {
        n: n(extra.stock ?? 0),
        name: extra.productName ?? '',
      });
    case 'product-below-minimum':
      return t('The kitchen sells this in larger quantities.');
    case 'product-above-maximum':
      return t('You can order at most {n} of this.', { n: n(extra.max ?? 0) });
    case 'cart-empty':
      return t('Your basket is empty.');
    case 'category-in-use':
      return t('Move or delete its {n} products first.', { n: n(extra.count ?? 0) });
    case 'name-required':
      return t('Give it a name.');

    /* ---- food requests and bidding ---- */
    case 'request-missing':
      return t('That request no longer exists.');
    case 'request-closed':
      return t('This request is no longer taking offers.');
    case 'request-not-eligible':
      return t('You were not asked for this one.');
    case 'offer-missing':
      return t('That offer no longer stands.');
    case 'offer-closed':
      return t('This offer is closed.');
    case 'offer-no-price':
      return t('That cook has not named a price yet.');
    case 'offer-not-your-turn':
      return t('It is the other side’s turn.');
    case 'offer-not-agreed':
      return t('Agree a price first.');

    /* ---- refusals only a server can make ----
       The transitions these come from used to run on the device, where there
       was no network to drop, no session to expire and no kitchen the app had
       not heard of. Now that they run on the server, all three are things a
       customer can actually hit, and each needs its own sentence: "something
       went wrong" tells somebody with no signal to try again forever. */
    case 'network':
      return t('We could not reach the server. Check your connection.');
    case 'unauthenticated':
      return t('Sign in to do that.');
    case 'kitchen-missing':
      return t('That kitchen is no longer listed.');
    case 'duplicate-request':
      return t('You have already sent that.');
    case 'bad-json':
      return t('Something went wrong. Try again.');

    default:
      return t('Something went wrong. Try again.');
  }
}
