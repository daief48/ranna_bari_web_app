/*
 * Agent C: cook withdrawals + wallet-only payments.
 *
 * English key -> Bengali. Merge into `User and Cook App/src/i18n/bn.js`.
 * Placeholders ({n}, {to}, {method}, {last4}, {min}, {max}) are kept as-is.
 * Keys that already exist in bn.js (e.g. 'bKash', 'Edit', 'Total') are
 * included anyway so the merge is safe either way.
 */
module.exports = {
  /* ---- cook Earnings: Withdraw card ---- */
  'Withdraw money': 'টাকা তুলুন',
  'Available to withdraw': 'তোলার জন্য উপলব্ধ',
  '৳{n} is already requested and waiting for payment.': '৳{n} আগেই চাওয়া হয়েছে এবং পরিশোধের অপেক্ষায় আছে।',
  'Sent to': 'পাঠানো হবে',
  'Not set': 'ঠিক করা নেই',
  'Edit': 'বদলান',
  'Add': 'যোগ করুন',
  'Add where to send your money': 'টাকা কোথায় পাঠানো হবে তা যোগ করুন',
  'Your request for ৳{n} is waiting. We will send it to {to} and tell you here.':
    'আপনার ৳{n} তোলার অনুরোধ অপেক্ষায় আছে। আমরা এটি {to}-তে পাঠাব এবং এখানে জানিয়ে দেব।',
  'Cancel request': 'অনুরোধ বাতিল করুন',
  'Amount (৳)': 'পরিমাণ (৳)',
  'Withdraw all': 'সব তুলুন',
  'Withdraw': 'তুলুন',
  'Add payout method': 'পেআউট পদ্ধতি যোগ করুন',
  'Minimum withdrawal ৳{n}. We send it by hand, usually within a day.':
    'সর্বনিম্ন উত্তোলন ৳{n}। আমরা নিজে পাঠাই, সাধারণত এক দিনের মধ্যে।',
  'Withdrawal requested.': 'তোলার অনুরোধ পাঠানো হয়েছে।',
  'Request cancelled.': 'অনুরোধ বাতিল হয়েছে।',
  'Waiting': 'অপেক্ষায়',
  'Paid': 'পরিশোধিত',
  'Declined': 'প্রত্যাখ্যাত',
  'Cancelled': 'বাতিল',
  'bKash': 'বিকাশ',
  'Bank': 'ব্যাংক',
  '{method} · ····{last4}': '{method} · ····{last4}',

  /* ---- wallet: manual top-up ---- */
  'Top-up is not set up yet': 'টপ-আপ এখনো চালু হয়নি',
  'Nagad': 'নগদ',
  '1. Send the money': '১. টাকা পাঠান',
  'Send Money to this {method} number:': 'এই {method} নম্বরে সেন্ড মানি করুন:',
  '2. Tell us what you sent': '২. কত পাঠালেন তা জানান',
  'Transaction id': 'ট্রানজ্যাকশন আইডি',
  'Number you sent from': 'যে নম্বর থেকে পাঠিয়েছেন',
  'Submit for review': 'যাচাইয়ের জন্য পাঠান',
  'Sending…': 'পাঠানো হচ্ছে…',
  'Your balance goes up once we confirm the payment, usually within a few hours.':
    'পেমেন্ট নিশ্চিত হলে আপনার ব্যালেন্স বাড়বে, সাধারণত কয়েক ঘণ্টার মধ্যে।',
  'Request sent. We will add it to your wallet once the payment is confirmed.':
    'অনুরোধ পাঠানো হয়েছে। পেমেন্ট নিশ্চিত হলে আমরা আপনার ওয়ালেটে টাকা যোগ করব।',
  'Your top-up requests': 'আপনার টপ-আপ অনুরোধ',
  'Added': 'যোগ হয়েছে',
  'Enter an amount between ৳{min} and ৳{max}.': '৳{min} থেকে ৳{max}-এর মধ্যে একটি পরিমাণ দিন।',
  'Copy the transaction id from your payment message (letters and numbers only).':
    'পেমেন্টের মেসেজ থেকে ট্রানজ্যাকশন আইডি কপি করুন (শুধু অক্ষর ও সংখ্যা)।',
  'Enter the mobile number you sent the money from.': 'যে মোবাইল নম্বর থেকে টাকা পাঠিয়েছেন সেটি দিন।',

  /* ---- cart ---- */
  'You pay from your wallet at checkout, and the cook is paid once your food arrives.':
    'চেকআউটে ওয়ালেট থেকে পরিশোধ করবেন, আর খাবার পৌঁছালে রাঁধুনি টাকা পাবেন।',

  /* ---- errorText() ---- */
  'The smallest withdrawal is ৳{n}.': 'সর্বনিম্ন উত্তোলন ৳{n}।',
  'You only have ৳{n} available to withdraw.': 'তোলার জন্য আপনার কাছে মাত্র ৳{n} আছে।',
  'Add your bKash number or bank account before withdrawing.':
    'টাকা তোলার আগে আপনার বিকাশ নম্বর বা ব্যাংক অ্যাকাউন্ট যোগ করুন।',
  'You already have a withdrawal waiting. Wait for it or cancel it first.':
    'আপনার একটি উত্তোলন অপেক্ষায় আছে। সেটির জন্য অপেক্ষা করুন অথবা আগে বাতিল করুন।',
  'That withdrawal no longer exists.': 'সেই উত্তোলনটি আর নেই।',
  'That withdrawal has already been decided.': 'সেই উত্তোলনের সিদ্ধান্ত আগেই হয়ে গেছে।',
  'Cash on delivery is no longer available. Pay from your wallet.':
    'ক্যাশ অন ডেলিভারি আর চালু নেই। ওয়ালেট থেকে পরিশোধ করুন।',
  'Wallet top-up is not set up yet. Please try again later.':
    'ওয়ালেট টপ-আপ এখনো চালু হয়নি। পরে আবার চেষ্টা করুন।',
  'That transaction id has already been submitted.': 'এই ট্রানজ্যাকশন আইডি আগেই জমা দেওয়া হয়েছে।',
  'That top-up request no longer exists.': 'সেই টপ-আপ অনুরোধটি আর নেই।',
  'That top-up request has already been decided.': 'সেই টপ-আপ অনুরোধের সিদ্ধান্ত আগেই হয়ে গেছে।',

  /* ---- notification titles filed by the server (translated on read) ---- */
  'Withdrawal declined': 'উত্তোলন প্রত্যাখ্যাত হয়েছে',
  'Top-up declined': 'টপ-আপ প্রত্যাখ্যাত হয়েছে',
  'You have been paid': 'আপনাকে টাকা পাঠানো হয়েছে',
  'Wallet topped up': 'ওয়ালেটে টাকা যোগ হয়েছে',
};
