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
/**
 * The registration form's fields, in the two voices the dialog needs.
 *
 * `FIELD_LABELS` renames the server's paths the way the form captions them;
 * `FIELD_FIX` carries the repair rather than the complaint — "pick 1 to 6"
 * tells a cook what to do where "must be an array of at most 6" only proves
 * the server read their answer.
 */
const FIELD_LABELS = {
  name: 'Full name',
  phone: 'Mobile number',
  email: 'Email',
  password: 'Password',
  kitchenName: 'Kitchen name',
  specialties: 'Specialties',
  nid: 'National ID',
  area: 'Area',
  addressDetail: 'Address details',
  lat: 'Pin location',
  lng: 'Pin location',
  deliveryRadiusKm: 'Delivery radius',
};

const FIELD_FIX = {
  name: 'enter at least 2 characters',
  phone: 'enter a Bangladeshi mobile number, like 01712 345678',
  email: 'that address does not look right',
  password: 'use at least 8 characters',
  kitchenName: 'give it a name of at least 2 characters',
  specialties: 'pick 1 to 6 — remove one to add another',
  nid: 'enter 4 to 30 characters',
  lat: 'drop your pin on the map',
  lng: 'drop your pin on the map',
  deliveryRadiusKm: 'set it between 1 and 50 km',
};

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
    /* The monthly system's one range rule. The server sends the numbers in
       `detail` precisely so this sentence can name them — its own message is
       a template with the braces still in it. */
    case 'meal-count-out-of-range': {
      const { min, max, count } = extra.detail ?? {};
      if (min == null || max == null) return t('That is not a number of meals this cook takes.');
      if (min === max) {
        return t('This cook takes exactly {n} meals a month. You picked {count}.', {
          n: n(min),
          count: n(count ?? 0),
        });
      }
      return t('Pick between {min} and {max} meals. You picked {count}.', {
        min: n(min),
        max: n(max),
        count: n(count ?? 0),
      });
    }
    case 'meal-plan-missing':
      return t('This cook has not published a menu for that month yet.');
    case 'meal-service-inactive':
      return t('This kitchen is not taking meal bookings right now.');
    case 'meal-booking-missing':
      return t('That booking no longer exists.');
    case 'meal-category-missing':
      return t('That meal category is no longer offered.');
    /* The shared refusal for "not your kitchen". Its code and its own message
       are the operator realm's — a customer who wandered onto a cook endpoint
       is not an admin and has no role to be told about. */
    case 'admin-forbidden':
      return t('That is not something this account can do.');
    case 'wallet-low-balance':
      /* The shortfall rides in `detail.short` on every route that refuses
         for this reason — `call()` hands it through as `out.detail`, and
         screens pass `out` whole as `extra`. Reading only `extra.short`
         meant the sentence said "top up ৳0" on every real refusal. The flat
         field is still honoured for the callers that pass it that way. */
      if (extra.what === 'order') {
        return t('Your wallet is ৳{n} short. Top up to pay for this order.', {
          n: n(extra.short ?? extra.detail?.short ?? 0),
        });
      }
      return t('Insufficient balance. Top up ৳{n} to confirm this meal.', {
        n: n(extra.short ?? extra.detail?.short ?? 0),
      });
    case 'order-missing':
      return t('That order no longer exists.');
    case 'order-wrong-state':
      /* Usually not a fault: the order moved on while this screen was looking
         at an older copy (the customer closed it, another tab advanced it).
         Said as that, so it reads as news rather than breakage — and when the
         refusal says where the order is, say that instead of "somewhere". */
      {
        const status = extra.status ?? extra.detail?.status;
        if (status === 'cancelled') return t('This order was cancelled, so there is nothing more to do on it.');
        if (status === 'rejected') return t('This order was declined, so there is nothing more to do on it.');
        if (status === 'pending') return t('This pre-order is still waiting for your answer — accept or decline it first.');
        return t('This order has already moved on, so that step is no longer possible. Check its latest status.');
      }
    case 'order-already-settled':
      return t('This order has already been settled.');
    case 'amount-invalid':
      return t('Enter a valid amount.');
    /* Not an amount — the body carried a field the server could not read, and
       `detail` names it. The register route sends every failing field at once
       as a list of `{ path, code }`, which becomes one line apiece: a cook
       told "check: specialties" three screens from the picker had no idea
       whether to add one, remove one or start over. The paths arrive in the
       server's vocabulary (`kitchenName`, `deliveryRadiusKm`); the labels and
       the repairs are the form's. */
    case 'request-invalid': {
      const issues = Array.isArray(extra.detail) ? extra.detail : null;
      if (issues?.length) {
        return issues
          .map((i) => {
            const field = FIELD_LABELS[i.path] ?? i.path;
            const fix = FIELD_FIX[i.path];
            return fix
              ? t('{field}: {fix}', { field: t(field), fix: t(fix) })
              : t('Check the {field} and try again.', { field: t(field) });
          })
          .join('\n');
      }
      /* A dish order refused on `items` means a line in the basket no longer
         exists on that kitchen's menu, or was taken off it — `detail.id`
         names which. The checkout removes that line; this only has to say
         why the basket changed under the customer. */
      if (extra.detail?.field === 'items') {
        return t('One of these dishes is no longer available.');
      }
      if (extra.detail?.field) {
        return t('Check the {field} and try again.', { field: extra.detail.field });
      }
      return t('Something in that was not valid. Try again.');
    }

    /* ---- cook stores ---- */
    case 'store-missing':
      return t('That shop is no longer listed.');
    case 'too-many-stores':
      return t('That is more shops than one kitchen can run.');
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
      return t('Your cart is empty.');
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
    case 'not-agreed':
    case 'request-not-agreed':
      return t('Agree a price first.');
    /* The paying step's own refusals: the world moved between "agreed" and
       "paid". Each says what happened and what to do, because the money is
       the one thing the customer must never be left guessing about. */
    case 'request-not-payable':
    case 'request-expired':
      return t('This request is no longer waiting for payment. Open it again to see where it stands.');
    case 'request-already-paid':
    case 'already-paid':
      return t('This request has already been paid for. Check your orders.');
    case 'kitchen-not-trading':
    case 'kitchen-closed':
    case 'kitchen-not-approved':
      return t('This kitchen cannot take orders right now. You have not been charged.');
    case 'address-required':
      return t('Add a delivery address before paying.');

    /* ---- the cook's door ----
       Each of these routes the cook somewhere specific — back to the form,
       to the code screen, to sign-in — and each says which. Falling back to
       "something went wrong" here is what sent a cook round the whole loop
       twice for a password the first message had already refused. */
    case 'phone-required':
      return t('Enter a Bangladeshi mobile number, like 01712 345678.');
    case 'password-weak':
      return t('Use at least 8 characters for your password.');
    case 'account-missing':
      return t('No account was found for that email.');
    case 'email-invalid':
      return t('That email address does not look right.');
    case 'email-unverified':
      return t('Verify your email to finish signing in.');
    case 'already-verified':
      return t('That email is already verified. Sign in instead.');
    case 'invalid-credentials':
      return t('That email and password do not match an account.');
    case 'otp-cooldown':
      return t('Please wait a minute before asking for another code.');
    case 'otp-rate-limited':
      return t('Too many codes were requested. Try again in an hour.');
    case 'otp-send-failed':
      return t('We could not send the email right now. Try again in a minute.');
    /* A code to retype, and a code to replace — the two ways an emailed code
       fails, and the two sentences that send the cook to different repairs. */
    case 'otp-invalid':
      return t('That code is wrong or has expired. Check it or send a new one.');
    case 'otp-exhausted':
      return t('Too many wrong tries. Ask for a new code.');
    case 'account-suspended':
      return t('This account is suspended. Contact support.');

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
    /* The generic 404 — a kitchen, order or page id that resolves to nothing.
       The specific codes above (`order-missing`, `kitchen-missing`) are
       preferred where the route knows what it was asked for. */
    case 'not-found':
      return t('We could not find that. It may have been removed.');
    case 'phone-and-code-required':
      return t('Enter your mobile number and the code we sent.');

    /* ---- the platform saying no ----
       Not the customer's fault and not the network's: an operator has
       switched a feature off, a top-up has no gateway behind it yet, or the
       order is frozen while a dispute is looked at. Each needs to read as a
       closed door with a reason, not as "try again". */
    case 'topup-unavailable':
      return t('Top-ups are not open yet. Your balance grows from refunds for now — contact support if you need help.');
    case 'feature-off':
      return t('This part of RannaBari is switched off at the moment. Please try again later.');
    case 'dispute-open':
      return t('This order is under review, so it cannot be changed until the dispute is settled.');
    case 'order-cancel-window':
      return t('The time to cancel this order has passed. The kitchen has already started on it.');

    /* ---- cook withdrawals ----
       Each one names its own repair: raise the amount, lower it, add a
       destination, or wait for the request that is already open. */
    case 'withdrawal-too-low':
      return t('The smallest withdrawal is ৳{n}.', {
        n: n(extra.minimum ?? extra.detail?.minimum ?? 0),
      });
    case 'withdrawal-over-balance':
      return t('You only have ৳{n} available to withdraw.', {
        n: n(extra.available ?? extra.detail?.available ?? 0),
      });
    case 'no-payout-destination':
      return t('Add your bKash number or bank account before withdrawing.');
    case 'withdrawal-open':
      return t('You already have a withdrawal waiting. Wait for it or cancel it first.');
    case 'withdrawal-missing':
      return t('That withdrawal no longer exists.');
    case 'withdrawal-closed':
      return t('That withdrawal has already been decided.');

    /* ---- wallet-only payments ---- */
    case 'cash-not-accepted':
      return t('Cash on delivery is no longer available. Pay from your wallet.');
    case 'topup-not-configured':
      return t('Wallet top-up is not set up yet. Please try again later.');
    case 'topup-txn-used':
      return t('That transaction id has already been submitted.');
    case 'topup-missing':
      return t('That top-up request no longer exists.');
    case 'topup-closed':
      return t('That top-up request has already been decided.');

    default:
      return t('Something went wrong. Try again.');
  }
}
