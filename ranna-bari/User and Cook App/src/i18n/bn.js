/**
 * Bengali strings, keyed by the English original.
 *
 * A missing key falls through to English rather than to a placeholder, so a
 * phrase added to a screen and not yet translated still reads as a sentence.
 *
 * Register: আপনি throughout. This is a marketplace where a customer is
 * talking to someone else's home kitchen, and তুমি would be too familiar for
 * either side of that.
 *
 * Where a sentence had a value spliced into it, the key carries a
 * {placeholder} instead -- Bengali puts the verb last, so a string cut into
 * "…for ৳" + amount cannot be reassembled in the right order.
 */
export const bn = {
  /* ---------------- brand, shell, common actions ---------------- */
  Browse: 'খুঁজুন',
  Map: 'ম্যাপ',
  Cart: 'কার্ট',
  Profile: 'প্রোফাইল',
  Search: 'সার্চ',
  Cancel: 'বাতিল',
  Continue: 'এগিয়ে যান',
  Save: 'সেভ',
  'Save changes': 'পরিবর্তন সেভ করুন',
  Saved: 'সেভ হয়েছে',
  'Saved.': 'সেভ হয়েছে।',
  Add: 'যোগ করুন',
  Remove: 'সরিয়ে ফেলুন',
  Edit: 'সম্পাদনা',
  EDIT: 'সম্পাদনা',
  Open: 'খোলা',
  Find: 'খুঁজুন',
  'Try again': 'আবার চেষ্টা করুন',
  'Never mind': 'থাক',
  'Keep it': 'রেখে দিন',
  'Stay in': 'থেকে যান',
  'Log out': 'লগ আউট',
  'View all': 'সবগুলো দেখুন',
  'See all': 'সব দেখুন',
  Soon: 'শীঘ্রই',
  Total: 'মোট',
  Subtotal: 'উপমোট',
  Rating: 'রেটিং',
  Review: 'রিভিউ',
  Reviews: 'রিভিউ',
  Dishes: 'পদ',
  Phone: 'ফোন',
  Email: 'ইমেইল',
  Area: 'এলাকা',
  Password: 'পাসওয়ার্ড',
  Description: 'বিবরণ',
  Tags: 'ট্যাগ',
  Call: 'কল',
  Customer: 'ক্রেতা',
  Kitchen: 'রান্নাঘর',
  KITCHEN: 'রান্নাঘর',
  Shop: 'দোকান',
  English: 'English',

  /* ---------------- section headings (lead + accent pairs) ---------------- */
  YOUR: 'আপনার',
  DISCOVER: 'খুঁজে নিন',
  ARTISANS: 'রাঁধুনি',
  FEATURED: 'নির্বাচিত',
  CHEFS: 'রাঁধুনি',
  'HOW IT': 'যেভাবে',
  WORKS: 'কাজ করে',
  WHAT: 'যা বলেন',
  FOODIES: 'ভোজনরসিকরা',
  SAY: '',
  CURATED: 'বাছাই করা',
  MENU: 'মেনু',
  CART: 'কার্ট',
  SECURE: 'নিরাপদ',
  CHECKOUT: 'চেকআউট',
  ORDER: 'অর্ডার',
  ORDERS: 'অর্ডার',
  BOARD: 'বোর্ড',
  PROFILE: 'প্রোফাইল',
  EARNINGS: 'আয়',
  BARI: 'বাড়ি',
  RANNA: 'রান্না',

  /* ---------------- home ---------------- */
  '100% Authentic Home Kitchens': '১০০% খাঁটি ঘরোয়া রান্নাঘর',
  'CRAFTED AT': 'ঘরে রাঁধা।',
  'HOME.': 'ঘরে।',
  'DELIVERED TO YOU.': 'আপনার দরজায়।',
  'Experience the finest home-cooked meals from verified culinary artisans in your neighbourhood. Authentic. Fresh. Made with love.':
    'আপনার পাড়ার যাচাই করা রাঁধুনিদের হাতে তৈরি সেরা ঘরোয়া খাবার। খাঁটি। টাটকা। ভালোবেসে রাঁধা।',
  'Enter your area (e.g. Dhanmondi)': 'আপনার এলাকা লিখুন (যেমন ধানমন্ডি)',
  'Find Food': 'খাবার খুঁজুন',
  'What are you craving?': 'কী খেতে ইচ্ছে করছে?',
  Featured: 'নির্বাচিত',
  'Healthy & Keto': 'স্বাস্থ্যকর ও কিটো',
  'Heritage Spices': 'ঐতিহ্যবাহী মশলা',
  'Comfort Stews': 'আরামের ঝোল',
  'Clean Street Food': 'পরিচ্ছন্ন স্ট্রিট ফুড',
  'Sweet Tooth': 'মিষ্টিমুখ',
  'Coastal Catch': 'সাগরের মাছ',
  'Plant-Based': 'নিরামিষ',
  'From their kitchen to your table in 3 simple steps':
    'তাদের রান্নাঘর থেকে আপনার টেবিলে, মাত্র ৩ ধাপে',
  'Pick an Artisan': 'রাঁধুনি বাছুন',
  'Browse curated menus from verified home cooks right in your neighbourhood.':
    'আপনার পাড়ার যাচাই করা রাঁধুনিদের বাছাই করা মেনু দেখুন।',
  'Freshly Prepared': 'টাটকা রান্না',
  'Your meal is cooked to order using fresh, safe, and authentic ingredients.':
    'অর্ডার পাওয়ার পরই টাটকা, নিরাপদ ও খাঁটি উপকরণে আপনার খাবার রাঁধা হয়।',
  'Delivered Hot': 'গরম গরম পৌঁছে যায়',
  'Enjoy doorstep delivery right in time for breakfast, lunch, or dinner.':
    'সকালের নাশতা, দুপুর কিংবা রাতের খাবার — ঠিক সময়ে দরজায়।',
  'The highest-rated culinary artists near you':
    'আপনার কাছের সর্বোচ্চ রেটিং পাওয়া রাঁধুনিরা',
  'Real orders, real kitchens, real neighbours.':
    'সত্যিকারের অর্ডার, সত্যিকারের রান্নাঘর, সত্যিকারের প্রতিবেশী।',
  'verified reviews': 'যাচাই করা রিভিউ',
  '100% Verified Clean': '১০০% যাচাই করা পরিচ্ছন্ন',
  'Verified Kitchens': 'যাচাই করা রান্নাঘর',
  'Our team personally inspects every home kitchen to ensure it meets strict hygiene and cleanliness standards.':
    'আমাদের দল প্রতিটি ঘরোয়া রান্নাঘর নিজে গিয়ে দেখে, যাতে কড়া পরিচ্ছন্নতার মান বজায় থাকে।',
  'Fresh Ingredients': 'টাটকা উপকরণ',
  'Chefs are committed to using locally sourced, fresh ingredients just like they would feed their own families.':
    'রাঁধুনিরা স্থানীয় টাটকা উপকরণ ব্যবহার করেন — ঠিক যেমনটা নিজের পরিবারের জন্য করতেন।',
  'Community Rated': 'সবার রেটিং',
  'Consistent high quality is maintained through real-time ratings and transparent feedback from foodies like you.':
    'আপনার মতো ভোজনরসিকদের রেটিং ও খোলামেলা মতামতেই মান ধরে রাখা হয়।',
  'We take your safety and health seriously. Every home cook on our platform goes through a rigorous vetting process so you can eat with complete peace of mind.':
    'আপনার নিরাপত্তা ও স্বাস্থ্য আমাদের কাছে গুরুত্বপূর্ণ। প্রতিটি রাঁধুনিকে কড়া যাচাইয়ের মধ্য দিয়ে যেতে হয়, যাতে আপনি নিশ্চিন্তে খেতে পারেন।',
  '© 2026 RannaBari. Shaping the future of localized gastronomy with authentic flavor.':
    '© ২০২৬ রান্নাবাড়ি। খাঁটি স্বাদে গড়ে উঠছে ঘরোয়া খাবারের আগামী।',

  /* ---------------- browse ---------------- */
  'Find the perfect meal curated by local chefs.':
    'পাড়ার রাঁধুনিদের বাছাই করা খাবার থেকে পছন্দেরটি নিন।',
  'Search cuisines, chefs, or areas...': 'খাবার, রাঁধুনি বা এলাকা খুঁজুন...',
  'Filter by area, currently': 'এলাকা অনুযায়ী ছাঁকুন, এখন',
  'No artisans found matching your criteria.':
    'আপনার পছন্দ অনুযায়ী কোনো রাঁধুনি পাওয়া যায়নি।',
  'Choose an area': 'একটি এলাকা বাছুন',
  'All Areas': 'সব এলাকা',
  All: 'সব',
  Morning: 'সকাল',
  Lunch: 'দুপুর',
  Evening: 'সন্ধ্যা',
  Healthy: 'স্বাস্থ্যকর',

  /* ---------------- map ---------------- */
  'Nearest to you': 'আপনার সবচেয়ে কাছে',
  'nearest to you': 'আপনার সবচেয়ে কাছে',
  'Search areas or kitchens (e.g. Dhanmondi)':
    'এলাকা বা রান্নাঘর খুঁজুন (যেমন ধানমন্ডি)',
  'Loading kitchens': 'রান্নাঘর আসছে',
  'Map unavailable': 'ম্যাপ পাওয়া যাচ্ছে না',
  'No kitchens have a location on file yet.':
    'এখনো কোনো রান্নাঘরের অবস্থান যোগ করা হয়নি।',
  'No match': 'মিল পাওয়া যায়নি',
  'Location unavailable': 'অবস্থান পাওয়া যাচ্ছে না',
  'Your location could not be determined right now.':
    'এই মুহূর্তে আপনার অবস্থান বের করা যাচ্ছে না।',
  'Location permission was blocked. Allow it in your device settings, then try again.':
    'অবস্থানের অনুমতি বন্ধ আছে। ফোনের সেটিংসে অনুমতি দিয়ে আবার চেষ্টা করুন।',
  'Use my location': 'আমার অবস্থান নিন',
  'See who is cooking near you': 'কাছাকাছি কে রাঁধছে দেখুন',
  'Kitchen map': 'রান্নাঘরের ম্যাপ',

  /* ---------------- chef page ---------------- */
  'Return to artisans': 'রাঁধুনিদের তালিকায় ফিরুন',
  'Kitchen not found': 'রান্নাঘর পাওয়া যায়নি',
  'That kitchen is no longer listed.': 'এই রান্নাঘরটি আর তালিকায় নেই।',
  'Browse artisans': 'রাঁধুনি দেখুন',
  'This kitchen has not published a menu yet.':
    'এই রান্নাঘর এখনো কোনো মেনু দেয়নি।',
  'Add to cart': 'কার্টে যোগ করুন',
  'Kitchen closed': 'রান্নাঘর বন্ধ',
  'Top Artisan': 'সেরা রাঁধুনি',
  'Verified Kitchen': 'যাচাই করা রান্নাঘর',
  'New kitchen': 'নতুন রান্নাঘর',
  'View menu': 'মেনু দেখুন',
  '{name} is not taking orders right now. The menu is here for when they open again.':
    '{name} এখন অর্ডার নিচ্ছে না। আবার খুললে এই মেনু থেকেই নিতে পারবেন।',

  /* ---------------- cart ---------------- */
  'Your cart': 'আপনার কার্ট',
  'Your cart is empty': 'আপনার কার্ট খালি',
  'Empty right now': 'এখন খালি',
  'Pick a kitchen and the dishes you add will show up here.':
    'একটি রান্নাঘর বাছুন — যোগ করা পদগুলো এখানে দেখা যাবে।',
  'Browse more kitchens': 'আরও রান্নাঘর দেখুন',
  'Proceed to checkout': 'চেকআউটে যান',
  'Order Summary': 'অর্ডারের হিসাব',
  'Order summary': 'অর্ডারের হিসাব',
  'Delivery Fee': 'ডেলিভারি চার্জ',
  'Platform Fee': 'প্ল্যাটফর্ম চার্জ',
  'Delivery instructions': 'ডেলিভারির নির্দেশনা',
  'Add delivery instructions (optional)': 'ডেলিভারির নির্দেশনা দিন (ইচ্ছে হলে)',
  'Gate code, landmark, ring twice…': 'গেটের কোড, চেনা জায়গা, দুবার বেল…',
  'AI Pairing Suggestion': 'সঙ্গে নিতে পারেন',
  'Goes well with your order:': 'আপনার অর্ডারের সাথে ভালো যাবে:',
  'From:': 'যেখান থেকে:',
  'Increase quantity': 'সংখ্যা বাড়ান',
  'Decrease quantity': 'সংখ্যা কমান',
  'Delivery and fees at checkout': 'ডেলিভারি ও চার্জ চেকআউটে',
  'View cart': 'কার্ট দেখুন',
  '{n} items waiting': '{n}টি পদ অপেক্ষায়',
  '{n} item waiting': '{n}টি পদ অপেক্ষায়',

  /* ---------------- checkout ---------------- */
  'Deliver to': 'যেখানে পৌঁছাবে',
  'Delivering to': 'পৌঁছে দেওয়া হবে',
  'Full name': 'পুরো নাম',
  'Who should the rider ask for?': 'রাইডার কার নাম বলবে?',
  'House / road / flat': 'বাসা / রোড / ফ্ল্যাট',
  'House 12, Road 7, Flat 4B': 'বাসা ১২, রোড ৭, ফ্ল্যাট ৪বি',
  'Dhanmondi, Dhaka': 'ধানমন্ডি, ঢাকা',
  'Save this address as': 'ঠিকানাটি সেভ করুন',
  "How you'll pay": 'কীভাবে দেবেন',
  'Cash on Delivery': 'ক্যাশ অন ডেলিভারি',
  'Cash on delivery': 'ক্যাশ অন ডেলিভারি',
  'Pay the rider in cash when your food arrives.':
    'খাবার পৌঁছালে রাইডারকে নগদ টাকা দেবেন।',
  'bKash / Card': 'বিকাশ / কার্ড',
  'Online payment is not switched on for this kitchen yet.':
    'এই রান্নাঘরের জন্য অনলাইন পেমেন্ট এখনো চালু হয়নি।',
  'No card needed. You pay the rider in cash at your door.':
    'কার্ড লাগবে না। দরজায় রাইডারকে নগদে দিলেই হলো।',
  'Add a dish before checking out.': 'চেকআউটের আগে একটি পদ যোগ করুন।',
  'We need a name, a phone number and a street address to deliver.':
    'পৌঁছে দিতে নাম, ফোন নম্বর আর ঠিকানা লাগবে।',
  'That phone number looks too short for the rider to call.':
    'রাইডারের কল করার জন্য নম্বরটি ছোট মনে হচ্ছে।',
  'Place order · ৳{total}': 'অর্ডার দিন · ৳{total}',
  'Keep ৳{total} in cash ready. Riders carry limited change, so exact notes help.':
    '৳{total} নগদ প্রস্তুত রাখুন। রাইডারের কাছে খুচরা কম থাকে, তাই সঠিক নোট দিলে সুবিধা।',
  Office: 'অফিস',
  Other: 'অন্য',

  /* ---------------- orders (customer) ---------------- */
  'Your orders': 'আপনার অর্ডার',
  'Nothing ordered yet': 'এখনো কিছু অর্ডার করা হয়নি',
  'Every meal you order shows up here.':
    'আপনার অর্ডার করা প্রতিটি খাবার এখানে দেখা যাবে।',
  'No orders yet': 'এখনো কোনো অর্ডার নেই',
  'Pick a kitchen, add a dish, and pay the rider in cash when it lands at your door.':
    'একটি রান্নাঘর বাছুন, পদ যোগ করুন, আর দরজায় পৌঁছালে রাইডারকে নগদে দিন।',
  'Order placed': 'অর্ডার দেওয়া হয়েছে',
  'Order placed.': 'অর্ডার দেওয়া হয়েছে।',
  'Kitchen accepted': 'রান্নাঘর নিয়েছে',
  'Cooking now': 'রান্না চলছে',
  'On the way': 'পথে আছে',
  Delivered: 'পৌঁছে গেছে',
  'Delivered.': 'পৌঁছে গেছে।',
  Cancelled: 'বাতিল',
  Declined: 'ফিরিয়ে দেওয়া হয়েছে',
  'Order status': 'অর্ডারের অবস্থা',
  'What happened': 'যা হয়েছে',
  'Order cancelled': 'অর্ডার বাতিল',
  'The kitchen could not take this': 'রান্নাঘর এটি নিতে পারেনি',
  'This order is complete.': 'এই অর্ডার সম্পন্ন।',
  'The kitchen moves this along as they cook. You will see it update here.':
    'রান্না এগোনোর সাথে সাথে রান্নাঘর এটি এগিয়ে নেবে। এখানেই দেখতে পাবেন।',
  'ready for the rider': 'রাইডারের জন্য প্রস্তুত',
  'paid to the rider': 'রাইডারকে দেওয়া হয়েছে',
  'Cancel this order': 'অর্ডার বাতিল করুন',
  'Cancel order': 'অর্ডার বাতিল',
  'Cancel this order? The kitchen may already have started cooking.':
    'অর্ডার বাতিল করবেন? রান্নাঘর হয়তো রান্না শুরু করে দিয়েছে।',
  'Order not found': 'অর্ডার পাওয়া যায়নি',
  'Loading your order…': 'আপনার অর্ডার আসছে…',
  'See all your orders': 'সব অর্ডার দেখুন',
  'Ordered from': 'যেখান থেকে অর্ডার',
  'Nothing was charged — cash orders are only paid on delivery.':
    'কোনো টাকা কাটা হয়নি — নগদ অর্ডারের টাকা ডেলিভারিতেই দেওয়া হয়।',
  '{kitchen} has your order. You pay when it arrives.':
    '{kitchen} আপনার অর্ডার পেয়েছে। পৌঁছালেই টাকা দেবেন।',
  '{kitchen} cooked this one. Hope it was good.':
    '{kitchen} এটি রেঁধেছে। আশা করি ভালো লেগেছে।',
  '{kitchen} turned this one down. Nothing was charged — cash orders are only paid on delivery.':
    '{kitchen} এই অর্ডারটি নিতে পারেনি। কোনো টাকা কাটা হয়নি — নগদ অর্ডারের টাকা ডেলিভারিতেই দেওয়া হয়।',
  'You cancelled this order on {date}.':
    'আপনি {date} তারিখে অর্ডারটি বাতিল করেছেন।',
  '{kitchen} could not take this order on {date}.':
    '{kitchen} {date} তারিখে অর্ডারটি নিতে পারেনি।',
  'We could not find an order with the code {code}.':
    '{code} কোডের কোনো অর্ডার পাওয়া যায়নি।',
  'Cash on delivery — the rider collects ৳{total} at the door, including delivery and platform fees.':
    'ক্যাশ অন ডেলিভারি — রাইডার দরজায় ৳{total} নেবে, ডেলিভারি ও প্ল্যাটফর্ম চার্জসহ।',
  '{n} in progress': '{n}টি চলছে',
  '{n} past orders': '{n}টি আগের অর্ডার',
  '{n} past order': '{n}টি আগের অর্ডার',
  '{n} orders so far': 'এ পর্যন্ত {n}টি অর্ডার',
  '{n} order so far': 'এ পর্যন্ত {n}টি অর্ডার',
  Cash: 'নগদ',
  'Pay on delivery': 'ডেলিভারিতে পেমেন্ট',

  /* ---------------- profile ---------------- */
  'Your account, your kitchens, your orders.':
    'আপনার অ্যাকাউন্ট, আপনার রান্নাঘর, আপনার অর্ডার।',
  'Sign in to order, or open your own kitchen.':
    'অর্ডার করতে সাইন ইন করুন, কিংবা নিজের রান্নাঘর খুলুন।',
  'You are browsing as a customer. Your kitchen is one tap away.':
    'আপনি ক্রেতা হিসেবে দেখছেন। এক চাপেই আপনার রান্নাঘরে ফিরতে পারবেন।',
  'You’re browsing as a guest': 'আপনি অতিথি হিসেবে দেখছেন',
  'Create an account to save your address, track orders, and get kitchens ranked by how close they are to your door.':
    'অ্যাকাউন্ট খুললে ঠিকানা সেভ থাকবে, অর্ডার দেখতে পারবেন, আর কাছের রান্নাঘরগুলো আগে দেখানো হবে।',
  'Sign in or join': 'সাইন ইন বা যোগ দিন',
  'Edit profile': 'প্রোফাইল সম্পাদনা',
  'Photo, contact details and address': 'ছবি, যোগাযোগ ও ঠিকানা',
  'Details, address, or open your own kitchen':
    'তথ্য, ঠিকানা, কিংবা নিজের রান্নাঘর খুলুন',
  'Become a cook': 'রাঁধুনি হোন',
  'Turn your kitchen into a business': 'রান্নাঘরকে ব্যবসায় রূপ দিন',
  'Your kitchen': 'আপনার রান্নাঘর',
  'As a customer': 'ক্রেতা হিসেবে',
  Account: 'অ্যাকাউন্ট',
  'Light mode': 'দিনের আলো',
  'Midnight dining': 'রাতের খাওয়া',
  'Washi paper and shari rice': 'ওয়াশি কাগজ আর সাদা ভাত',
  'Nori over sumi ink': 'কালির ওপর নরি',
  'Home cook': 'ঘরোয়া রাঁধুনি',
  'RannaBari member': 'রান্নাবাড়ির সদস্য',
  Orders: 'অর্ডার',
  'In progress': 'চলছে',
  'Log out of {who}? Your cart and past orders stay on this device.':
    '{who} থেকে লগ আউট করবেন? আপনার কার্ট ও আগের অর্ডার এই ডিভাইসেই থাকবে।',
  'Log out of {who}? Your menu and orders stay on this device.':
    '{who} থেকে লগ আউট করবেন? আপনার মেনু ও অর্ডার এই ডিভাইসেই থাকবে।',
  'this account': 'এই অ্যাকাউন্ট',
  'Orders, menu and earnings': 'অর্ডার, মেনু ও আয়',
  'Closed · not taking orders': 'বন্ধ · অর্ডার নেওয়া হচ্ছে না',
  'Open · {n} dishes live': 'খোলা · {n}টি পদ চালু',
  'Open · {n} dish live': 'খোলা · {n}টি পদ চালু',
  '{n} orders waiting to be accepted': '{n}টি অর্ডার গ্রহণের অপেক্ষায়',
  '{n} order waiting to be accepted': '{n}টি অর্ডার গ্রহণের অপেক্ষায়',
  '{n} orders in the pass': '{n}টি অর্ডার রান্নায়',
  '{n} order in the pass': '{n}টি অর্ডার রান্নায়',

  /* ---------------- auth ---------------- */
  'Sign in': 'সাইন ইন',
  'Create account': 'অ্যাকাউন্ট খুলুন',
  'Create an account': 'অ্যাকাউন্ট খুলুন',
  'Welcome back.': 'আবার স্বাগতম।',
  'Sign in to order dinner, or to open your kitchen for the day.':
    'রাতের খাবার অর্ডার করতে, কিংবা দিনের জন্য রান্নাঘর খুলতে সাইন ইন করুন।',
  'Email or phone': 'ইমেইল বা ফোন',
  'you@example.com or +880 1XXXXXXXXX': 'you@example.com বা +৮৮০ ১XXXXXXXXX',
  'Your password': 'আপনার পাসওয়ার্ড',
  'Keep me signed in': 'সাইন ইন রাখুন',
  'Forgot password?': 'পাসওয়ার্ড ভুলে গেছেন?',
  'or continue with': 'অথবা এগিয়ে যান',
  'New to RannaBari?': 'রান্নাবাড়িতে নতুন?',
  'Back to RannaBari': 'রান্নাবাড়িতে ফিরুন',
  'Join RannaBari.': 'রান্নাবাড়িতে যোগ দিন।',
  'Almost there.': 'প্রায় হয়ে গেছে।',
  'Three short steps.': 'তিনটি ছোট ধাপ।',
  'Three short steps. The last one puts you on the map — literally.':
    'তিনটি ছোট ধাপ। শেষটিতে আপনি সত্যিই ম্যাপে উঠে যাবেন।',
  'What brings you here?': 'কী কারণে এসেছেন?',
  "I'm here to eat": 'আমি খেতে এসেছি',
  "I'm here to cook": 'আমি রাঁধতে এসেছি',
  'Order home-cooked meals from kitchens on your street.':
    'আপনার পাড়ার রান্নাঘর থেকে ঘরোয়া খাবার অর্ডার করুন।',
  'Turn your kitchen into a business. Cook, list, deliver.':
    'রান্নাঘরকে ব্যবসায় রূপ দিন। রাঁধুন, তালিকায় দিন, পৌঁছে দিন।',
  'You can always add the other side later from your profile.':
    'অন্য দিকটি পরে প্রোফাইল থেকে যোগ করতে পারবেন।',
  'Your details': 'আপনার তথ্য',
  'Your kitchen details': 'আপনার রান্নাঘরের তথ্য',
  'At least 8 characters': 'কমপক্ষে ৮টি অক্ষর',
  'Kitchen name': 'রান্নাঘরের নাম',
  "e.g. Fatema's Heritage Kitchen": 'যেমন ফাতেমার ঐতিহ্য রান্নাঘর',
  'As you want cooks to see it': 'ক্রেতারা যেভাবে দেখবেন',
  'National ID': 'জাতীয় পরিচয়পত্র',
  'National ID (encrypted)': 'জাতীয় পরিচয়পত্র (সুরক্ষিত)',
  '10 or 17 digit NID': '১০ বা ১৭ সংখ্যার এনআইডি',
  'Encrypted at rest and used once, for the verification badge. It is never shown to customers.':
    'সুরক্ষিতভাবে রাখা হয় এবং কেবল যাচাইয়ের ব্যাজের জন্য একবার ব্যবহার হয়। ক্রেতাদের কখনো দেখানো হয় না।',
  'I agree to the Terms and the Privacy Policy.':
    'আমি শর্তাবলি ও গোপনীয়তা নীতিতে সম্মত।',
  'Where do you cook?': 'আপনি কোথায় রাঁধেন?',
  'Where should we deliver?': 'কোথায় পৌঁছে দেব?',
  'Default address': 'ডিফল্ট ঠিকানা',
  'Your schedule': 'আপনার সময়',
  'You’re in.': 'আপনি ঢুকে গেছেন।',
  'Your account is ready and your pin is on the map.':
    'আপনার অ্যাকাউন্ট প্রস্তুত, আর ম্যাপে আপনার পিন বসে গেছে।',
  'Go to my kitchen': 'আমার রান্নাঘরে যাই',
  'Start exploring': 'ঘুরে দেখুন',
  'Enter your email or phone and your password.':
    'ইমেইল বা ফোন এবং পাসওয়ার্ড দিন।',
  'Google': 'গুগল',
  'Phone OTP': 'ফোন ওটিপি',
  'Continue with': 'এগিয়ে যান',
  'Protected by reCAPTCHA. Read our Privacy Policy and Terms of Service.':
    'reCAPTCHA দ্বারা সুরক্ষিত। আমাদের গোপনীয়তা নীতি ও সেবার শর্ত পড়ুন।',
  'Every plate here was cooked by somebody’s hands.':
    'এখানকার প্রতিটি প্লেট কারও হাতে রাঁধা।',
  'Tonight, eat something made, not manufactured.':
    'আজ রাতে কারখানার নয়, হাতে বানানো কিছু খান।',
  'Order in 2 taps': '২ চাপে অর্ডার',
  'YOUR KITCHEN, YOUR BUSINESS': 'আপনার রান্নাঘর, আপনার ব্যবসা',
  'The recipe is already yours. We bring the customers.':
    'রেসিপি তো আপনারই। ক্রেতা আমরা এনে দিচ্ছি।',

  /* ---------------- become a cook ---------------- */
  'ELEVATE YOUR KITCHEN.': 'রান্নাঘরকে এগিয়ে নিন।',
  'OWN YOUR BUSINESS.': 'নিজের ব্যবসা গড়ুন।',
  'Join an elite network of culinary artisans. No upfront costs. Ultimate flexibility. Connect directly with food lovers who crave authenticity.':
    'দক্ষ রাঁধুনিদের দলে যোগ দিন। আগাম কোনো খরচ নেই। পুরো স্বাধীনতা। খাঁটি স্বাদের খোঁজে থাকা মানুষদের সাথে সরাসরি যুক্ত হোন।',
  Onboarding: 'শুরু করা',
  'Step 1 of 3: Verification': '৩ ধাপের ১: যাচাই',
  'Full legal name': 'পুরো আইনি নাম',
  'As it appears on your ID': 'পরিচয়পত্রে যেভাবে আছে',
  'Secure phone number': 'নিরাপদ ফোন নম্বর',
  'Primary cooking location': 'মূল রান্নার জায়গা',
  'Primary cooking location, currently': 'মূল রান্নার জায়গা, এখন',
  'Select your zone': 'আপনার এলাকা বাছুন',
  'Enter NID for secure verification': 'যাচাইয়ের জন্য এনআইডি দিন',
  'Fill in every field so we can start verification.':
    'যাচাই শুরু করতে সবগুলো ঘর পূরণ করুন।',
  'Keep 85%': '৮৫% আপনার',
  'Industry-leading payouts processed weekly directly to your bank or bKash.':
    'সেরা হারে প্রতি সপ্তাহে সরাসরি আপনার ব্যাংক বা বিকাশে টাকা।',
  'Full Control': 'পুরো নিয়ন্ত্রণ',
  "Set your own schedule. Accept orders when you want, pause when you don't.":
    'নিজের সময় নিজে ঠিক করুন। ইচ্ছেমতো অর্ডার নিন, ইচ্ছে না হলে বিরতি দিন।',
  'Eco Packaging': 'পরিবেশবান্ধব মোড়ক',
  'We provide heavily discounted, sustainable packaging to all our verified partners.':
    'যাচাই করা সব সঙ্গীকে আমরা অনেক কম দামে পরিবেশবান্ধব মোড়ক দিই।',
  'Mirpur, Dhaka': 'মিরপুর, ঢাকা',
  'Gulshan, Dhaka': 'গুলশান, ঢাকা',
  'Uttara, Dhaka': 'উত্তরা, ঢাকা',

  /* ---------------- edit profile ---------------- */
  'Everything you gave us when you joined, yours to change.':
    'যোগ দেওয়ার সময় যা দিয়েছিলেন, সবই বদলাতে পারবেন।',
  'About you': 'আপনার সম্পর্কে',
  About: 'সম্পর্কে',
  'Choose photo': 'ছবি বাছুন',
  Camera: 'ক্যামেরা',
  'How you use RannaBari': 'রান্নাবাড়ি কীভাবে ব্যবহার করেন',
  'I eat': 'আমি খাই',
  'I cook': 'আমি রাঁধি',
  'What you cook best': 'যা সবচেয়ে ভালো রাঁধেন',
  'What you cook best, currently': 'যা সবচেয়ে ভালো রাঁধেন, এখন',
  'Choose a specialty': 'বিশেষত্ব বাছুন',
  /* The specialty picker, rebuilt for a list of twenty-four. */
  'Choose what you cook best': 'যা ভালো রাঁধেন বাছুন',
  'Search specialties': 'বিশেষত্ব খুঁজুন',
  'Clear search': 'খোঁজা মুছুন',
  '{first} and {n} more': '{first} এবং আরও {n}টি',
  'Nothing matches “{q}”': '“{q}” এর সাথে কিছু মিলছে না',
  'Ask RannaBari to add it and it will appear here.': 'রান্নাবাড়িকে যোগ করতে বলুন, এখানে চলে আসবে।',
  'Tap a chip to make it the one shown on your kitchen card.': 'কোনটি আপনার রান্নাঘরের কার্ডে দেখাবে, সেটি বাছতে ট্যাপ করুন।',
  'shown on your card': 'আপনার কার্ডে দেখাচ্ছে',
  'Make {name} your main specialty': '{name} কে আপনার প্রধান বিশেষত্ব করুন',
  'Remove {name}': '{name} সরান',
  'Sign in first': 'আগে সাইন ইন করুন',
  'Your profile details live with your account.':
    'আপনার প্রোফাইলের তথ্য অ্যাকাউন্টের সাথেই থাকে।',
  'Checkout starts from this address. Drag the map to move your pin — the area fills itself in.':
    'চেকআউট এই ঠিকানা থেকেই শুরু হয়। পিন সরাতে ম্যাপ টানুন — এলাকা নিজেই বসে যাবে।',
  'Saved as': 'সেভ হয়েছে',
  'Your kitchen needs a name for customers to find it.':
    'ক্রেতারা খুঁজে পেতে রান্নাঘরের একটি নাম দরকার।',
  'Traditional Heritage': 'ঐতিহ্যবাহী',
  'Coastal Seafood': 'সাগরের মাছ',
  'Street & Snacks': 'স্ট্রিট ফুড ও নাশতা',
  'Biryani & Rice': 'বিরিয়ানি ও ভাত',
  'Vegetarian & Bhorta': 'নিরামিষ ও ভর্তা',
  'Desserts & Pitha': 'মিষ্টি ও পিঠা',

  /* ---------------- location picker ---------------- */
  'Search an area, e.g. Dhanmondi 27': 'এলাকা খুঁজুন, যেমন ধানমন্ডি ২৭',
  'Searching…': 'খোঁজা হচ্ছে…',
  'Nothing found. Try a nearby landmark.':
    'কিছু পাওয়া যায়নি। কাছের কোনো চেনা জায়গা লিখুন।',
  'Search is unavailable right now — drag the map instead.':
    'এখন সার্চ কাজ করছে না — ম্যাপ টেনে পিন বসান।',
  'Drop your pin on the map so we know where to find you.':
    'ম্যাপে পিন বসান, যাতে আমরা জায়গাটা জানি।',

  /* ---------------- cook panel: shell + dashboard ---------------- */
  Today: 'আজ',
  Menu: 'মেনু',
  Earnings: 'আয়',
  Closed: 'বন্ধ',
  'Open for orders': 'অর্ডারের জন্য খোলা',
  'Tap to start taking orders': 'অর্ডার নিতে চাপ দিন',
  'Setting up your kitchen…': 'আপনার রান্নাঘর তৈরি হচ্ছে…',
  'Orders today': 'আজকের অর্ডার',
  'Earned today': 'আজকের আয়',
  'No orders right now': 'এখন কোনো অর্ডার নেই',
  'Your kitchen is closed': 'আপনার রান্নাঘর বন্ধ',
  'You are listed and taking orders. This fills up as they come in.':
    'আপনি তালিকায় আছেন এবং অর্ডার নিচ্ছেন। অর্ডার এলেই এখানে দেখা যাবে।',
  'Open the kitchen above and your dishes go live on the map.':
    'উপরে রান্নাঘর খুললেই আপনার পদগুলো ম্যাপে চালু হয়ে যাবে।',
  'Add a dish': 'পদ যোগ করুন',
  'List something new on your menu': 'মেনুতে নতুন কিছু যোগ করুন',
  'Your menu': 'আপনার মেনু',
  '{name} is taking orders.': '{name} অর্ডার নিচ্ছে।',
  '{name} is closed. Nothing can be ordered.':
    '{name} বন্ধ আছে। এখন কিছু অর্ডার করা যাবে না।',
  '{n} dishes listed right now': 'এখন {n}টি পদ তালিকায় আছে',
  '{n} dish listed right now': 'এখন {n}টি পদ তালিকায় আছে',
  '{n} waiting on you': '{n}টি আপনার অপেক্ষায়',
  '{n} in the pass': '{n}টি রান্নায়',
  '{dishes} dishes, {live} available': '{dishes}টি পদ, {live}টি চালু',
  'A customer': 'একজন ক্রেতা',
  'Out for delivery': 'পৌঁছে দিতে বেরিয়েছে',
  Accepted: 'গ্রহণ করা হয়েছে',

  /* ---------------- cook panel: orders ---------------- */
  'Order board': 'অর্ডার বোর্ড',
  New: 'নতুন',
  Cooking: 'রান্না',
  Delivering: 'পথে',
  History: 'ইতিহাস',
  'Everything that comes through your kitchen.':
    'আপনার রান্নাঘরে আসা সব কিছু।',
  'No new orders': 'নতুন কোনো অর্ডার নেই',
  'Nothing finished yet': 'এখনো কিছু শেষ হয়নি',
  'Nothing on the stove': 'চুলায় কিছু নেই',
  'Nothing out for delivery': 'পৌঁছে দিতে কিছু বেরোয়নি',
  'Your kitchen is open. New orders land here first.':
    'আপনার রান্নাঘর খোলা। নতুন অর্ডার এখানেই আগে আসবে।',
  'Your kitchen is closed, so nothing can come in.':
    'আপনার রান্নাঘর বন্ধ, তাই কিছু আসবে না।',
  'Orders move through here as you work them.':
    'কাজ এগোনোর সাথে সাথে অর্ডারগুলো এখান দিয়ে যাবে।',
  'Accept order': 'অর্ডার নিন',
  'Start cooking': 'রান্না শুরু',
  'Hand to rider': 'রাইডারকে দিন',
  'Mark delivered': 'পৌঁছেছে বলে চিহ্নিত করুন',
  Accept: 'নিন',
  Reject: 'ফিরিয়ে দিন',
  Rejected: 'ফিরিয়ে দেওয়া হয়েছে',
  'Reject this order': 'এই অর্ডার ফিরিয়ে দিন',
  'Why are you turning this down?': 'কেন ফিরিয়ে দিচ্ছেন?',
  'The customer sees your reason, so pick the true one.':
    'ক্রেতা আপনার কারণটি দেখবে, তাই সত্যিটাই বাছুন।',
  'Out of an ingredient for this dish': 'এই পদের একটি উপকরণ শেষ',
  'Too many orders in the pass right now': 'এখন অনেক অর্ডার রান্নায় আছে',
  'The address is outside my delivery radius':
    'ঠিকানাটি আমার ডেলিভারির সীমার বাইরে',
  'Closing for the day': 'আজকের মতো বন্ধ করছি',
  'The kitchen could not take this order.': 'রান্নাঘর এই অর্ডারটি নিতে পারেনি।',
  'Your cut': 'আপনার অংশ',
  '{n} orders waiting to be accepted.': '{n}টি অর্ডার গ্রহণের অপেক্ষায়।',
  '{n} order waiting to be accepted.': '{n}টি অর্ডার গ্রহণের অপেক্ষায়।',
  '{n} items': '{n}টি পদ',
  '{n} item': '{n}টি পদ',

  /* ---------------- cook panel: order detail ---------------- */
  'To cook': 'যা রাঁধতে হবে',
  Progress: 'অগ্রগতি',
  'Back to the board': 'বোর্ডে ফিরুন',
  'You turned this order down': 'আপনি এই অর্ডারটি ফিরিয়ে দিয়েছেন',
  'The customer cancelled this order': 'ক্রেতা অর্ডারটি বাতিল করেছেন',
  'Food total': 'খাবারের মোট',
  'You receive': 'আপনি পাবেন',
  'Platform share ({pct}%)': 'প্ল্যাটফর্মের অংশ ({pct}%)',

  /* ---------------- cook panel: menu + dish editor ---------------- */
  'An empty menu': 'মেনু খালি',
  'A kitchen with nothing listed cannot take an order. Add a dish and it goes live the moment you open.':
    'তালিকায় কিছু না থাকলে অর্ডার নেওয়া যায় না। একটি পদ যোগ করুন — রান্নাঘর খুললেই সেটি চালু হবে।',
  'Nothing listed yet. Add your first dish.':
    'এখনো কিছু তালিকায় নেই। প্রথম পদটি যোগ করুন।',
  'Available today': 'আজ পাওয়া যাচ্ছে',
  'Sold out': 'শেষ',
  'Your kitchen is closed, so none of this is orderable. Open it from the bar above.':
    'আপনার রান্নাঘর বন্ধ, তাই এখান থেকে কিছু অর্ডার করা যাবে না। উপরের বার থেকে খুলুন।',
  'Edit dish': 'পদ সম্পাদনা',
  'Dish not found': 'পদ পাওয়া যায়নি',
  'It may have been removed from your menu.':
    'হয়তো এটি আপনার মেনু থেকে সরানো হয়েছে।',
  'Back to menu': 'মেনুতে ফিরুন',
  'It goes live on your listing as soon as you save.':
    'সেভ করলেই এটি আপনার তালিকায় চালু হয়ে যাবে।',
  'Changes reach customers immediately.':
    'পরিবর্তন সাথে সাথেই ক্রেতাদের কাছে পৌঁছায়।',
  'Add a photo': 'ছবি যোগ করুন',
  'Change photo': 'ছবি বদলান',
  'Dish name': 'পদের নাম',
  'One line on what makes it yours': 'এক লাইনে বলুন এটি কেন আলাদা',
  'Price in taka': 'দাম, টাকায়',
  'Customers filter by these. Pick every one that fits.':
    'ক্রেতারা এগুলো দিয়েই ছাঁকেন। যেগুলো মেলে সবই বাছুন।',
  'Add to menu': 'মেনুতে যোগ করুন',
  'Remove from menu': 'মেনু থেকে সরান',
  'Give the dish a name.': 'পদটির একটি নাম দিন।',
  'Set a price above zero, in taka.': 'টাকায় শূন্যের বেশি দাম দিন।',
  'Pick at least one tag so customers can find it.':
    'ক্রেতারা যাতে খুঁজে পান, অন্তত একটি ট্যাগ বাছুন।',
  'Cooked to order.': 'অর্ডার পেয়ে রাঁধা।',
  'Remove {name} from your menu? Orders already placed for it are not affected.':
    '{name} মেনু থেকে সরাবেন? আগে দেওয়া অর্ডারগুলোতে কোনো প্রভাব পড়বে না।',
  '{live} of {total} available to order right now.':
    'এখন {total}টির মধ্যে {live}টি অর্ডার করা যাচ্ছে।',

  /* ---------------- cook panel: earnings ---------------- */
  'Payable to you': 'আপনাকে দেওয়া হবে',
  'Food sales': 'খাবার বিক্রি',
  'Your payout': 'আপনার প্রাপ্য',
  'Payouts run every Sunday to your bank or bKash.':
    'প্রতি রোববার আপনার ব্যাংক বা বিকাশে টাকা পাঠানো হয়।',
  'Last 7 days': 'গত ৭ দিন',
  'Per order': 'প্রতি অর্ডারে',
  'This week': 'এই সপ্তাহ',
  'Recent payouts': 'সাম্প্রতিক প্রাপ্তি',
  'Nothing delivered yet': 'এখনো কিছু পৌঁছে দেওয়া হয়নি',
  'An order counts toward your payout the moment you mark it delivered.':
    'পৌঁছেছে বলে চিহ্নিত করলেই অর্ডারটি আপনার প্রাপ্যে যোগ হয়।',
  'You keep {pct}% of every dish you sell.':
    'বিক্রি করা প্রতিটি পদের {pct}% আপনার।',
  'From {n} delivered orders': '{n}টি পৌঁছে দেওয়া অর্ডার থেকে',
  'From {n} delivered order': '{n}টি পৌঁছে দেওয়া অর্ডার থেকে',
  '{n} orders': '{n}টি অর্ডার',

  /* ---------------- cook panel: kitchen profile ---------------- */
  'How customers see you, and what you deliver.':
    'ক্রেতারা আপনাকে কীভাবে দেখেন, আর আপনি কী পৌঁছে দেন।',
  'Change cover': 'কভার বদলান',
  'Live dishes': 'চালু পদ',
  'Kitchen details': 'রান্নাঘরের তথ্য',
  'What customers see on the map': 'ম্যাপে ক্রেতারা যা দেখেন',
  'About your cooking': 'আপনার রান্না সম্পর্কে',
  'One or two lines customers read first':
    'এক-দুই লাইন, ক্রেতারা প্রথমে এটাই পড়েন',
  'Delivery radius': 'ডেলিভারির সীমা',
  'Saved. Your listing is live.': 'সেভ হয়েছে। আপনার তালিকা চালু।',
  'Preview your listing': 'আপনার তালিকা দেখুন',
  'See exactly what a customer sees': 'ক্রেতা ঠিক যা দেখেন তা দেখুন',
  'Switch to ordering': 'অর্ডার করায় যান',
  'Browse and order as a customer': 'ক্রেতা হিসেবে দেখুন ও অর্ডার করুন',
  'Browse and order from other kitchens':
    'অন্য রান্নাঘর থেকে দেখুন ও অর্ডার করুন',
  'Back to your kitchen': 'আপনার রান্নাঘরে ফিরুন',
  'Account details': 'অ্যাকাউন্টের তথ্য',
  'Your contact and address': 'আপনার যোগাযোগ ও ঠিকানা',
  'Only customers inside this circle will see your kitchen. Start small — you can widen it any time.':
    'কেবল এই বৃত্তের ভেতরের ক্রেতারা আপনার রান্নাঘর দেখবেন। ছোট দিয়ে শুরু করুন — যেকোনো সময় বাড়াতে পারবেন।',
  'RannaBari needs photo access to change your kitchen picture.':
    'রান্নাঘরের ছবি বদলাতে রান্নাবাড়ির ছবির অনুমতি দরকার।',
  'RannaBari needs photo access to set a dish photo.':
    'পদের ছবি দিতে রান্নাবাড়ির ছবির অনুমতি দরকার।',

  /* ---------------- validation and transient notes ---------------- */
  'Pick one to continue.': 'এগোতে একটি বাছুন।',
  'Fill in the highlighted fields to continue.':
    'এগোতে চিহ্নিত ঘরগুলো পূরণ করুন।',
  'That email address does not look right.': 'ইমেইল ঠিকানাটি ঠিক মনে হচ্ছে না।',
  'Use at least 8 characters for your password.':
    'পাসওয়ার্ডে অন্তত ৮টি অক্ষর দিন।',
  'Please accept the Terms and Privacy Policy.':
    'শর্তাবলি ও গোপনীয়তা নীতিতে সম্মতি দিন।',
  'Camera permission was blocked. Allow it in your device settings.':
    'ক্যামেরার অনুমতি বন্ধ আছে। ফোনের সেটিংসে অনুমতি দিন।',
  'Photo permission was blocked. Allow it in your device settings.':
    'ছবির অনুমতি বন্ধ আছে। ফোনের সেটিংসে অনুমতি দিন।',
  'Loading…': 'আসছে…',
  'Placing…': 'পাঠানো হচ্ছে…',

  /* ---------------- odds and ends ---------------- */
  Order: 'অর্ডার',
  'The kitchen': 'রান্নাঘর',
  'Nothing here yet': 'এখানে এখনো কিছু নেই',
  'Add more items': 'আরও পদ যোগ করুন',
  'Cash on delivery. Pay the rider at your door.':
    'ক্যাশ অন ডেলিভারি। দরজায় রাইডারকে দিয়ে দেবেন।',
  'Allergies, favourite spice level, anything a cook should know':
    'অ্যালার্জি, ঝালের মাত্রা, রাঁধুনির জানা দরকার এমন যেকোনো কিছু',
  'Where should we find you?': 'আপনাকে কোথায় পাব?',
  'Drag the map so the pin sits on your kitchen. This decides who can order from you.':
    'ম্যাপ টেনে পিনটি আপনার রান্নাঘরে বসান। এটিই ঠিক করবে কারা আপনার কাছে অর্ডার করতে পারবে।',
  'Drag the map so the pin sits on your door. This decides which kitchens you see.':
    'ম্যাপ টেনে পিনটি আপনার দরজায় বসান। এটিই ঠিক করবে কোন রান্নাঘরগুলো দেখবেন।',
  'you@example.com': 'you@example.com',

  /* ---------------- values that reach t() from a variable ---------------- */
  // Address labels
  Home: 'হোম',
  Work: 'অফিস',

  // Weekday initials on the earnings chart
  Sun: 'রবি',
  Mon: 'সোম',
  Tue: 'মঙ্গল',
  Wed: 'বুধ',
  Thu: 'বৃহঃ',
  Fri: 'শুক্র',
  Sat: 'শনি',

  // Dish tags — also the browse filters
  breakfast: 'সকাল',
  lunch: 'দুপুর',
  dinner: 'রাত',
  snacks: 'নাশতা',
  healthy: 'স্বাস্থ্যকর',
  vegan: 'নিরামিষ',
  spicy: 'ঝাল',
  sweet: 'মিষ্টি',
  comfort: 'আরামের',
  budget: 'সাশ্রয়ী',
  heritage: 'ঐতিহ্য',
  seafood: 'সামুদ্রিক',
  street: 'স্ট্রিট ফুড',
  dessert: 'মিষ্টি',

  // The auth aside eyebrow, which follows the chosen path
  'Home kitchens, near you': 'আপনার কাছের ঘরোয়া রান্নাঘর',
  'Dinner is three streets away': 'রাতের খাবার তিন গলি দূরে',
  'Your kitchen, your business': 'আপনার রান্নাঘর, আপনার ব্যবসা',

  // The auth aside sentence and the one word it emphasises. The Bengali
  // emphasis must be a literal substring of the Bengali title, or the split
  // that paints it in the accent face finds nothing.
  'somebody’s': 'কারও',
  made: 'হাতে বানানো',
  yours: 'আপনারই',

  Pinned: 'পিন বসানো',
  // Two lines under the "50+" stat, same as the English lockup.
  'Verified Artisans': 'যাচাই করা\nরাঁধুনি',

  'Demo account is pre-filled — just tap {button}.':
    'ডেমো অ্যাকাউন্ট আগেই ভরা আছে — শুধু {button} চাপুন।',

  // The rest of the tag vocabulary the seeded kitchens use
  asian: 'এশিয়ান',
  bakery: 'বেকারি',
  biryani: 'বিরিয়ানি',
  diabetic: 'ডায়াবেটিক',
  fusion: 'ফিউশন',
  grill: 'গ্রিল',
  iftar: 'ইফতার',
  meat: 'মাংস',
  office: 'অফিস',
  sylheti: 'সিলেটি',
  vegetarian: 'নিরামিষ',

  // Sourcing badges on a kitchen card
  'Eco-Packaging': 'পরিবেশবান্ধব মোড়ক',
  'Responsibly Sourced': 'দায়িত্বশীল উৎস',
  'Organic Veggies': 'অর্গানিক সবজি',
  'Safe Packaging': 'নিরাপদ মোড়ক',

  // Specialties carried by the seeded kitchens
  'Wellness & Keto': 'সুস্থতা ও কিটো',
  'Biryani & Polao': 'বিরিয়ানি ও পোলাও',
  'Old Dhaka Kacchi': 'পুরান ঢাকার কাচ্চি',
  'Pitha & Desserts': 'পিঠা ও মিষ্টি',
  'Chittagong Mezban': 'চট্টগ্রামের মেজবান',
  'Bhorta & Vegetarian': 'ভর্তা ও নিরামিষ',
  'Breakfast & Tiffin': 'নাশতা ও টিফিন',
  'Grill & Kebab': 'গ্রিল ও কাবাব',
  'Sylheti Home Style': 'সিলেটি ঘরোয়া',
  'Bakes & Continental': 'বেক ও কন্টিনেন্টাল',
  'Thai & Pan-Asian': 'থাই ও প্যান-এশিয়ান',
  'Diabetic-Friendly': 'ডায়াবেটিক-বান্ধব',
  'Fusion Rice Bowls': 'ফিউশন রাইস বোল',
  'Iftar & Ramadan Specials': 'ইফতার ও রমজান স্পেশাল',
  'Deshi Fish Curry': 'দেশি মাছের ঝোল',
  'Office Lunch Boxes': 'অফিস লাঞ্চ বক্স',

  'Name, specialty, description and delivery radius':
    'নাম, বিশেষত্ব, বিবরণ ও ডেলিভারির সীমা',

  /* ---------------- search ---------------- */
  'Search a dish, kitchen or area…': 'পদ, রান্নাঘর বা এলাকা খুঁজুন…',
  /* The short form, for a 320px field where the long one is cut off. */
  'Search food or kitchens…': 'খাবার বা রান্নাঘর খুঁজুন…',
  'Clear search': 'খোঁজা মুছুন',
  From: 'যেখান থেকে',
  '{n} dish': '{n}টি পদ',
  '{n} dishes': '{n}টি পদ',
  '{n} kitchen': '{n}টি রান্নাঘর',
  '{n} kitchens': '{n}টি রান্নাঘর',
  'See {n} more': 'আরও {n}টি দেখুন',

  /* ---------------- dish page ---------------- */
  Back: 'ফিরুন',
  'From this kitchen': 'যে রান্নাঘরের',
  'More from {name}': '{name}-এর আরও পদ',
  'It may have been removed from the menu.': 'হয়তো এটি মেনু থেকে সরানো হয়েছে।',

  // Distance. The unit follows the number in Bengali too.
  '{n} km': '{n} কিমি',
  '{n} m': '{n} মি',
  '{d} away': '{d} দূরে',
  Nearby: 'খুব কাছে',

  // The cook panel, reduced to four tabs.
  'LISTINGS': 'তালিকা',
  'BUSINESS': 'ব্যবসা',
  'Listings': 'তালিকা',
  'Business': 'ব্যবসা',
  'Everything you have out there, and what it is doing.': 'আপনি যা যা দিয়েছেন, আর সেগুলোর অবস্থা।',
  'What you are owed, and how customers find you.': 'আপনি কত পাবেন, আর কাস্টমার আপনাকে কীভাবে খুঁজে পায়।',
  '{live} of {total} available to order': '{total}-এর মধ্যে {live}টি অর্ডারের জন্য আছে',
  '{n} taking orders': '{n}টি অর্ডার নিচ্ছে',
  'Plan tomorrow’s meal tonight': 'আজ রাতেই কালকের মিল ঠিক করুন',
  '৳{n} released to you': '৳{n} আপনাকে দেওয়া হয়েছে',
  'Payouts run every Sunday': 'প্রতি রোববার পেআউট হয়',
  'Closed — nothing can be ordered': 'বন্ধ — কিছুই অর্ডার করা যাবে না',

  // The shelf basket, now a section of the Cart.
  'From the shelf': 'তাক থেকে',
  'Paid from your wallet, and held until it reaches you.': 'ওয়ালেট থেকে কাটা, আর আপনার কাছে পৌঁছানো পর্যন্ত জমা থাকবে।',
  'Place shop order': 'দোকানের অর্ডার দিন',
  'Item': 'পণ্য',

  // Profile section headings.
  'Activity': 'কার্যক্রম',
  'Money': 'টাকা',

  // The live order strip above the tab bar.
  'The kitchen has it': 'রান্নাঘর পেয়েছে',
  'Cooking': 'রান্না হচ্ছে',
  'Ready': 'তৈরি',
  'Did it arrive?': 'পৌঁছেছে কি?',
  '+{n} more': '+আরও {n}',
  '{name}, {state}. Open your order.': '{name}, {state}। অর্ডার খুলুন।',

  // Meals and Shops search.
  'Search a shop or something they sell…': 'দোকান বা তারা যা বেচে খুঁজুন…',
  'Search a meal or a cook…': 'মিল বা রাঁধুনি খুঁজুন…',
  'Clear filters': 'ফিল্টার মুছুন',
  'Nothing matches that': 'এমন কিছু পাওয়া যায়নি',
  'Try a different word, or clear the filters.': 'অন্য শব্দ চেষ্টা করুন, বা ফিল্টার মুছে দিন।',
  'Collection': 'কালেকশন',
  'on': 'চালু',

  // Outcomes announced by useAction.
  'Kitchen is open for orders.': 'রান্নাঘর এখন অর্ডার নিচ্ছে।',
  'Kitchen closed.': 'রান্নাঘর বন্ধ করা হয়েছে।',
  'Shop is open.': 'দোকান খোলা হয়েছে।',
  'Shop closed.': 'দোকান বন্ধ করা হয়েছে।',
  'Order rejected.': 'অর্ডার বাতিল করা হয়েছে।',
  'Order cancelled.': 'অর্ডার বাতিল হয়েছে।',

  'No delivery address on file.': 'কোনো ডেলিভারি ঠিকানা দেওয়া নেই।',

  'Check the {field} and try again.': '{field} ঠিক আছে কিনা দেখে আবার চেষ্টা করুন।',
  'Something in that was not valid. Try again.': 'কিছু একটা ঠিক ছিল না। আবার চেষ্টা করুন।',

  'Your account is ready, but we could not save your details. Open Profile to add them.': 'আপনার অ্যাকাউন্ট তৈরি হয়েছে, তবে বিস্তারিত সেভ করা যায়নি। প্রোফাইল থেকে যোগ করুন।',

  // The sheet behind the distance chip on every detail page.
  'Distance': 'দূরত্ব',
  'Distance: {d}. Tap for details.': 'দূরত্ব: {d}। বিস্তারিত দেখতে চাপ দিন।',
  'Show how far away this is': 'এটি কত দূরে দেখুন',
  'No address yet': 'ঠিকানা দেওয়া নেই',
  'Not on the map yet': 'এখনো ম্যাপে নেই',
  'in a straight line from your delivery address': 'আপনার ডেলিভারি ঠিকানা থেকে সরলরেখায়',
  'Add your delivery address and this will show how far away it is.': 'আপনার ডেলিভারি ঠিকানা যোগ করলে এটি কত দূরে তা দেখা যাবে।',
  '{name} has not pinned a location yet.': '{name} এখনো ম্যাপে অবস্থান দেয়নি।',
  'Your address': 'আপনার ঠিকানা',
  'This place': 'এই জায়গা',
  'Within their {r} km delivery range.': 'তাদের {r} কিমি ডেলিভারি সীমার মধ্যে।',
  'Outside their {r} km delivery range.': 'তাদের {r} কিমি ডেলিভারি সীমার বাইরে।',
  'Add address': 'ঠিকানা যোগ করুন',
  'Change address': 'ঠিকানা বদলান',
  'See on map': 'ম্যাপে দেখুন',

  'Type an area': 'এলাকার নাম লিখুন',
  'No area matches that.': 'ওই নামে কোনো এলাকা নেই।',
  Close: 'বন্ধ',

  /* ---------------- browse chips ----------------
     The display labels on the chip row. The lowercase tags above are the
     same words as they appear on a card; these are how the filter names
     them, and the two are translated separately because a chip is a
     command and a tag is a description. */
  Biryani: 'বিরিয়ানি',
  Heritage: 'ঐতিহ্য',
  Comfort: 'ঘরোয়া',
  'Street food': 'স্ট্রিট ফুড',
  Seafood: 'সামুদ্রিক',
  Grill: 'গ্রিল',
  Snacks: 'নাস্তা',
  Sweet: 'মিষ্টি',
  Bakery: 'বেকারি',
  Spicy: 'ঝাল',
  Meat: 'মাংস',
  Sylheti: 'সিলেটি',
  Asian: 'এশিয়ান',
  Fusion: 'ফিউশন',
  'Office lunch': 'অফিস লাঞ্চ',
  Iftar: 'ইফতার',
  Budget: 'সাশ্রয়ী',

  /* ---------------- filter sheet ---------------- */
  Filters: 'ফিল্টার',
  'Sort by': 'সাজান',
  'Nearest first': 'কাছেরটা আগে',
  'Top rated': 'সেরা রেটিং',
  'Cheapest first': 'কম দামেরটা আগে',
  'Most expensive': 'বেশি দামেরটা আগে',
  Availability: 'খোলা আছে কি না',
  'Open now': 'এখন খোলা',
  'Some map tiles did not load.': 'ম্যাপের কিছু অংশ লোড হয়নি।',
  'Price per dish': 'পদপ্রতি দাম',
  'Any price': 'যেকোনো দাম',
  'Under ৳200': '৳২০০-এর নিচে',
  '৳200 – ৳400': '৳২০০ – ৳৪০০',
  '৳400 – ৳800': '৳৪০০ – ৳৮০০',
  '৳800+': '৳৮০০+',
  Dietary: 'খাদ্যাভ্যাস',
  Vegetarian: 'নিরামিষ',
  Vegan: 'ভেগান',
  'Diabetic-friendly': 'ডায়াবেটিস-বান্ধব',
  'Kitchen rating': 'রান্নাঘরের রেটিং',
  'Any rating': 'যেকোনো রেটিং',
  'Clear all': 'সব মুছুন',
  'Show {n} result': '{n}টি ফল দেখুন',
  'Show {n} results': '{n}টি ফল দেখুন',
  'No matches': 'কিছু মেলেনি',
  'Add a delivery address to sort and filter by distance.':
    'দূরত্ব দিয়ে সাজাতে ও ছাঁকতে হলে ঠিকানা যোগ করুন।',

  /* ---------------- recent searches, and empty results ---------------- */
  'Recent searches': 'সাম্প্রতিক খোঁজ',
  Clear: 'মুছুন',
  'Search again': 'আবার খুঁজুন',
  'Try removing': 'সরিয়ে দেখুন',
  '+{n}': '+{n}',
  '{n} kitchen does not deliver to your address.':
    '{n}টি রান্নাঘর আপনার ঠিকানায় পৌঁছায় না।',
  '{n} kitchens do not deliver to your address.':
    '{n}টি রান্নাঘর আপনার ঠিকানায় পৌঁছায় না।',

  /* ---------------- relative time ---------------- */
  'just now': 'এইমাত্র',
  '{n} min ago': '{n} মিনিট আগে',
  '{n} hr ago': '{n} ঘণ্টা আগে',
  '{n} days ago': '{n} দিন আগে',
  '{n} day ago': '{n} দিন আগে',

  /* ---------------- meal system: shared vocabulary ---------------- */
  Meals: 'খাবার',
  MEALS: 'খাবার',
  'TOMORROW’S': 'আগামীকালের',
  UPDATES: 'খবর',
  WALLET: 'ওয়ালেট',
  Tomorrow: 'আগামীকাল',
  Breakfast: 'সকালের নাশতা',
  Dinner: 'রাতের খাবার',
  Sitting: 'বেলা',
  Day: 'দিন',
  Meal: 'খাবার',
  'a meal': 'একটি খাবার',
  'per plate': 'প্রতি প্লেট',
  plates: 'প্লেট',
  'plate confirmed': 'প্লেট নিশ্চিত',
  'plates confirmed': 'প্লেট নিশ্চিত',
  confirmed: 'নিশ্চিত',
  Interested: 'আগ্রহী',
  Confirmed: 'নিশ্চিত',
  Left: 'বাকি',
  Held: 'জমা',
  Prepare: 'রাঁধতে হবে',
  Delivery: 'ডেলিভারি',
  Collection: 'নিজে নেবেন',
  Handover: 'কীভাবে পৌঁছাবে',
  Amount: 'পরিমাণ',
  Payment: 'পেমেন্ট',
  Served: 'পরিবেশন',
  Booked: 'বুক করা হয়েছে',
  'Order code': 'অর্ডার কোড',
  paid: 'পরিশোধিত',
  'At the kitchen': 'রান্নাঘরে',

  /* ---------------- meal system: order lifecycle ---------------- */
  'Order confirmed': 'অর্ডার নিশ্চিত',
  Preparing: 'রান্না হচ্ছে',
  Ready: 'তৈরি',
  Completed: 'সম্পন্ন',
  Collected: 'নেওয়া হয়েছে',
  'Confirm receipt': 'পেয়েছেন কি না জানান',
  'Being prepared': 'রান্না চলছে',
  'Payment held': 'টাকা জমা আছে',
  'Paid out': 'পরিশোধ হয়েছে',
  Refunded: 'ফেরত দেওয়া হয়েছে',
  'Held by RannaBari': 'রান্নাবাড়ির কাছে জমা',
  'Released to the cook': 'রাঁধুনিকে দেওয়া হয়েছে',
  'Refunded to your wallet': 'আপনার ওয়ালেটে ফেরত',
  'Mark all ready': 'সবগুলো তৈরি',
  'Send all out': 'সবগুলো পাঠান',
  'Mark all delivered': 'সবগুলো পৌঁছেছে',
  'Move on': 'পরের ধাপে',
  'Waiting for the customer to confirm they got it.':
    'ক্রেতা পেয়েছেন কি না জানানোর অপেক্ষা।',

  /* ---------------- meal system: customer screens ---------------- */
  'Home cooks near you are planning tomorrow. Book your plate tonight.':
    'আপনার কাছের রাঁধুনিরা আগামীকালের রান্না ঠিক করছেন। আজ রাতেই প্লেট বুক করুন।',
  'Tomorrow’s meals near you': 'আপনার কাছে আগামীকালের খাবার',
  'Tomorrow’s meals': 'আগামীকালের খাবার',
  'Coming up': 'সামনে যা আছে',
  Earlier: 'আগের',
  '{n} meals': '{n}টি খাবার',
  '{n} left': 'আর {n}টি',
  '{n} interested': '{n} জন আগ্রহী',
  '{n} min left': 'আর {n} মিনিট',
  '{n} hr left': 'আর {n} ঘণ্টা',
  '{n} days left': 'আর {n} দিন',
  'Orders closed': 'অর্ডার বন্ধ',
  'Orders close': 'অর্ডার বন্ধ হবে',
  'No deadline': 'কোনো সময়সীমা নেই',
  'No meals planned near you yet': 'আপনার কাছে এখনো কোনো খাবার ঠিক হয়নি',
  'Cooks publish tomorrow’s meals the evening before. Check back tonight, or browse kitchens cooking to order right now.':
    'রাঁধুনিরা আগের সন্ধ্যায় আগামীকালের খাবার দেন। আজ রাতে আবার দেখুন, নয়তো এখনই যারা রাঁধছে তাদের দেখুন।',
  'Browse kitchens': 'রান্নাঘর দেখুন',
  'Add a delivery address so we can show only the kitchens that reach you.':
    'ঠিকানা যোগ করুন, তাহলে যারা আপনার কাছে পৌঁছাতে পারে শুধু তাদেরই দেখাব।',
  'Sign in to book a meal and use your wallet.':
    'খাবার বুক করতে ও ওয়ালেট ব্যবহার করতে সাইন ইন করুন।',
  'Meal not found': 'খাবারটি পাওয়া যায়নি',
  'Delivered to your address.': 'আপনার ঠিকানায় পৌঁছে দেওয়া হবে।',
  'Collect from the kitchen.': 'রান্নাঘর থেকে নিয়ে যাবেন।',
  'I’m interested': 'আমি আগ্রহী',
  'Interested ✓': 'আগ্রহী ✓',
  'Confirm order · ৳{n}': 'অর্ডার নিশ্চিত করুন · ৳{n}',
  'Top up to confirm': 'নিশ্চিত করতে টপ আপ করুন',
  'Your payment is held until you confirm the food arrived.':
    'খাবার পেয়েছেন জানানোর আগ পর্যন্ত টাকা জমা থাকবে।',
  'You have booked this meal.': 'আপনি এই খাবারটি বুক করেছেন।',
  'Track your order': 'অর্ডার দেখুন',
  'Confirm this meal?': 'এই খাবারটি নিশ্চিত করবেন?',
  'Balance after': 'পরে ব্যালেন্স',
  Confirm: 'নিশ্চিত করুন',
  'Confirming…': 'নিশ্চিত হচ্ছে…',
  '৳{n} leaves your wallet now and is held by RannaBari. The cook is paid only after you confirm the food arrived.':
    'এখন ৳{n} আপনার ওয়ালেট থেকে কেটে রান্নাবাড়ির কাছে জমা থাকবে। খাবার পেয়েছেন জানানোর পরই রাঁধুনি টাকা পাবেন।',

  /* ---------------- meal system: order tracking ---------------- */
  'Did your food arrive?': 'খাবার কি পৌঁছেছে?',
  'Food received': 'খাবার পেয়েছি',
  'Confirming closes this order. ৳{n} stays held until RannaBari releases it to {cook}.':
    'নিশ্চিত করলে অর্ডারটি সম্পন্ন হবে। ৳{n} জমা থাকবে, রান্নাবাড়ি {cook}-কে পরে দেবে।',
  'Confirm you received the food?': 'খাবার পেয়েছেন নিশ্চিত করছেন?',
  'This completes the order and cannot be undone. ৳{n} stays held until RannaBari releases it to {cook}.':
    'এতে অর্ডারটি সম্পন্ন হবে, আর ফেরানো যাবে না। ৳{n} জমা থাকবে, রান্নাবাড়ি {cook}-কে পরে দেবে।',
  'Yes, it arrived': 'হ্যাঁ, পেয়েছি',
  'Thank you — this order is complete.': 'ধন্যবাদ — অর্ডারটি সম্পন্ন হয়েছে।',
  'Cancel this order?': 'এই অর্ডারটি বাতিল করবেন?',
  '৳{n} goes back to your wallet, and the cook is told.':
    '৳{n} আপনার ওয়ালেটে ফিরে যাবে, আর রাঁধুনিকে জানানো হবে।',
  '৳{n} has been refunded to your wallet.': '৳{n} আপনার ওয়ালেটে ফেরত এসেছে।',
  '৳{n} was refunded to your wallet.': '৳{n} আপনার ওয়ালেটে ফেরত দেওয়া হয়েছে।',

  /* ---------------- meal system: wallet ---------------- */
  Wallet: 'ওয়ালেট',
  'Wallet balance': 'ওয়ালেট ব্যালেন্স',
  'Available balance': 'যা খরচ করা যাবে',
  'Held for meals in progress': 'চলমান খাবারের জন্য জমা',
  'Meals are paid for from here, and held until the food arrives.':
    'খাবারের টাকা এখান থেকেই যায়, আর খাবার পৌঁছানো পর্যন্ত জমা থাকে।',
  'Top up': 'টপ আপ',
  'Other amount': 'অন্য পরিমাণ',
  'Demo top-up: no payment gateway is connected, so the balance is added straight away.':
    'ডেমো টপ আপ: কোনো পেমেন্ট গেটওয়ে যুক্ত নেই, তাই ব্যালেন্স সঙ্গে সঙ্গেই যোগ হয়।',
  '৳{n} added to your wallet.': '৳{n} আপনার ওয়ালেটে যোগ হয়েছে।',
  'Transaction history': 'লেনদেনের তালিকা',
  Transaction: 'লেনদেন',
  'Wallet top up': 'ওয়ালেট টপ আপ',
  'Held for {title}': '{title}-এর জন্য জমা',
  Refund: 'ফেরত',
  'Refund · {title}': 'ফেরত · {title}',
  'No transactions yet': 'এখনো কোনো লেনদেন নেই',
  'Top up your wallet to book tomorrow’s meals.':
    'আগামীকালের খাবার বুক করতে ওয়ালেটে টাকা যোগ করুন।',
  '৳{n} available': '৳{n} আছে',
  '৳{n} available · ৳{held} held': '৳{n} আছে · ৳{held} জমা',
  'Enter a valid amount.': 'সঠিক একটি পরিমাণ লিখুন।',
  'Insufficient balance. Top up ৳{n} to confirm this meal.':
    'ব্যালেন্স যথেষ্ট নয়। এই খাবারটি নিশ্চিত করতে ৳{n} টপ আপ করুন।',

  /* ---------------- meal system: cook screens ---------------- */
  'Plan a meal': 'খাবার ঠিক করুন',
  'Publish meal': 'খাবার প্রকাশ করুন',
  'Your meals': 'আপনার খাবার',
  'No meals planned yet': 'এখনো কোনো খাবার ঠিক করা হয়নি',
  'Plan tomorrow’s meal tonight and let people book a plate.':
    'আজ রাতেই আগামীকালের খাবার ঠিক করুন, মানুষ প্লেট বুক করুক।',
  'Publish tomorrow’s meal and every customer in your delivery radius sees it tonight. They book a plate, you find out how much to cook.':
    'আগামীকালের খাবার প্রকাশ করলে আপনার ডেলিভারি এলাকার সব ক্রেতা আজ রাতেই দেখবেন। তাঁরা প্লেট বুক করবেন, আপনি জানবেন কতটা রাঁধতে হবে।',
  '{n} plates confirmed for tomorrow.': 'আগামীকালের জন্য {n}টি প্লেট নিশ্চিত।',
  'Prepare {n} plates tomorrow': 'আগামীকাল {n}টি প্লেট রাঁধতে হবে',
  'Plan tomorrow’s meal': 'আগামীকালের খাবার ঠিক করুন',
  'Publish tonight and let people book a plate':
    'আজ রাতে প্রকাশ করুন, মানুষ প্লেট বুক করুক',
  '{n} interested, {c} confirmed': '{n} জন আগ্রহী, {c}টি নিশ্চিত',
  'Customers inside your delivery radius see it as soon as you publish.':
    'প্রকাশ করা মাত্রই আপনার ডেলিভারি এলাকার ক্রেতারা দেখতে পাবেন।',
  'Start from your menu': 'আপনার মেনু থেকে শুরু করুন',
  'Meal name': 'খাবারের নাম',
  'Chicken Biryani': 'চিকেন বিরিয়ানি',
  'What is in it, and how much': 'কী কী আছে, কতটা',
  'Price per plate': 'প্রতি প্লেটের দাম',
  'Plates (optional)': 'কত প্লেট (ইচ্ছে হলে)',
  'No limit': 'সীমা নেই',
  'Handover note (optional)': 'পৌঁছানোর নোট (ইচ্ছে হলে)',
  'Collect between 1 and 2pm.': 'দুপুর ১টা থেকে ২টার মধ্যে নিয়ে যাবেন।',
  'Delivered by 1:30pm.': 'দুপুর ১:৩০-এর মধ্যে পৌঁছে যাবে।',
  'Orders close a few hours before the sitting — {when}.':
    'বেলার কয়েক ঘণ্টা আগে অর্ডার বন্ধ হয় — {when}।',
  'already closed': 'ইতিমধ্যেই বন্ধ',
  'Give the meal a name.': 'খাবারটির একটি নাম দিন।',
  'Leave the quantity blank for no limit, or set it above zero.':
    'সীমা না চাইলে খালি রাখুন, নয়তো শূন্যের বেশি দিন।',
  'That service has already closed. Pick a later date or sitting.':
    'ওই বেলা ইতিমধ্যেই বন্ধ। পরের দিন বা বেলা বাছুন।',
  'Set your kitchen up first.': 'আগে আপনার রান্নাঘর ঠিক করুন।',
  'RannaBari needs photo access to set a meal photo.':
    'খাবারের ছবি দিতে রান্নাবাড়ির ছবির অনুমতি লাগবে।',
  '{n} confirmed orders': '{n}টি নিশ্চিত অর্ডার',
  '{n} people are interested. They pay to confirm.':
    '{n} জন আগ্রহী। টাকা দিলেই নিশ্চিত হবে।',
  'Nobody has booked this meal yet.': 'এখনো কেউ এই খাবারটি বুক করেননি।',
  '{n} orders moved on.': '{n}টি অর্ডার পরের ধাপে গেছে।',
  'Stop taking orders': 'অর্ডার নেওয়া বন্ধ করুন',
  'Stop taking orders?': 'অর্ডার নেওয়া বন্ধ করবেন?',
  'Stop orders': 'অর্ডার বন্ধ',
  'The meal stays visible but nobody new can book it. Orders already placed are unaffected.':
    'খাবারটি দেখা যাবে, কিন্তু নতুন কেউ বুক করতে পারবেন না। আগের অর্ডারগুলো ঠিকই থাকবে।',
  'Closed. Existing orders are unaffected.': 'বন্ধ হয়েছে। আগের অর্ডারগুলো ঠিকই আছে।',
  'Cancel this meal': 'এই খাবারটি বাতিল করুন',
  'Cancel this meal?': 'এই খাবারটি বাতিল করবেন?',
  'Cancel meal': 'খাবার বাতিল',
  'All {n} confirmed orders are cancelled and ৳{amount} goes back to the customers. This cannot be undone.':
    '{n}টি নিশ্চিত অর্ডারই বাতিল হবে আর ৳{amount} ক্রেতাদের কাছে ফেরত যাবে। এটি আর ফেরানো যাবে না।',
  'Order cancelled. ৳{n} refunded.': 'অর্ডার বাতিল হয়েছে। ৳{n} ফেরত দেওয়া হয়েছে।',
  'Cancelled. ৳{n} refunded to customers.':
    'বাতিল হয়েছে। ক্রেতাদের ৳{n} ফেরত দেওয়া হয়েছে।',
  '৳{n} released to your wallet from this meal.':
    'এই খাবার থেকে ৳{n} আপনার ওয়ালেটে এসেছে।',
  '{n} plates to cook': '{n}টি প্লেট রাঁধতে হবে',

  /* ---------------- meal system: cook wallet ---------------- */
  'Meal wallet': 'খাবারের ওয়ালেট',
  'Released to you': 'আপনাকে দেওয়া হয়েছে',
  'Held until customers confirm delivery': 'ক্রেতারা নিশ্চিত করা পর্যন্ত জমা',
  'Meal payment': 'খাবারের পেমেন্ট',
  'Nothing released yet. Payment lands here when a customer confirms they got their meal.':
    'এখনো কিছু আসেনি। ক্রেতা খাবার পেয়েছেন জানালেই টাকা এখানে আসবে।',

  /* ---------------- meal system: notifications ---------------- */
  Notifications: 'নোটিফিকেশন',
  '{n} unread': '{n}টি অপঠিত',
  '{n} to confirm': '{n}টি নিশ্চিত করার আছে',
  'Nothing new': 'নতুন কিছু নেই',
  'Meals near you, and your order updates': 'কাছের খাবার আর আপনার অর্ডারের খবর',
  'Meals near you, and where your orders have got to.':
    'কাছের খাবার, আর আপনার অর্ডার কোথায় পৌঁছাল।',
  'Interest, orders and payouts from your meals.':
    'আপনার খাবারে আগ্রহ, অর্ডার আর টাকা।',
  'Interest, orders and payouts': 'আগ্রহ, অর্ডার আর টাকা',
  'When a cook near you plans tomorrow’s meal, it lands here.':
    'কাছের কোনো রাঁধুনি আগামীকালের খাবার ঠিক করলে এখানে আসবে।',
  'Publish a meal and you will hear the moment someone books it.':
    'খাবার প্রকাশ করুন, কেউ বুক করলেই জানতে পারবেন।',
  'New meal near you': 'কাছেই নতুন খাবার',
  '{title} from {cook} — ৳{price}': '{cook}-এর {title} — ৳{price}',
  'Someone is interested': 'কেউ আগ্রহ দেখিয়েছেন',
  '{n} interested in {title}': '{title}-এ {n} জন আগ্রহী',
  'New confirmed order': 'নতুন নিশ্চিত অর্ডার',
  '{customer} confirmed {title}. Prepare {n}.':
    '{customer} {title} নিশ্চিত করেছেন। {n}টি রাঁধতে হবে।',
  '৳{amount} is held until you confirm the food arrived.':
    'খাবার পেয়েছেন জানানো পর্যন্ত ৳{amount} জমা থাকবে।',
  '{title} is being cooked.': '{title} রান্না হচ্ছে।',
  '{title} is ready.': '{title} তৈরি।',
  '{title} is out for delivery.': '{title} পথে আছে।',
  'Confirm you received {title} to complete the order.':
    'অর্ডার শেষ করতে {title} পেয়েছেন কি না জানান।',
  'Payment released': 'টাকা ছাড়া হয়েছে',
  '৳{amount} for {title} is in your wallet.': '{title}-এর ৳{amount} আপনার ওয়ালেটে।',
  'Order completed': 'অর্ডার সম্পন্ন',
  '৳{amount} has been released to the cook.': '৳{amount} রাঁধুনিকে দেওয়া হয়েছে।',
  '{title} was cancelled. ৳{amount} was refunded.':
    '{title} বাতিল হয়েছে। ৳{amount} ফেরত দেওয়া হয়েছে।',
  'Meal cancelled': 'খাবার বাতিল',
  '{title} was cancelled. ৳{amount} is back in your wallet.':
    '{title} বাতিল হয়েছে। ৳{amount} আপনার ওয়ালেটে ফিরে এসেছে।',
  'Wallet topped up': 'ওয়ালেটে টাকা যোগ হয়েছে',
  '৳{amount} added to your wallet.': '৳{amount} আপনার ওয়ালেটে যোগ হয়েছে।',
  'Confirm {title} so the cook can be paid.':
    '{title} নিশ্চিত করুন, তাহলেই রাঁধুনি টাকা পাবেন।',

  /* ---------------- meal system: errors ---------------- */
  'That meal is no longer listed.': 'খাবারটি আর তালিকায় নেই।',
  'This meal is no longer taking orders.': 'এই খাবারে আর অর্ডার নেওয়া হচ্ছে না।',
  'Orders for this meal have closed.': 'এই খাবারের অর্ডার বন্ধ হয়ে গেছে।',
  'This meal is sold out.': 'এই খাবার শেষ হয়ে গেছে।',
  'You have already booked this meal.': 'আপনি এই খাবারটি আগেই বুক করেছেন।',
  'That order no longer exists.': 'ওই অর্ডারটি আর নেই।',
  'That cannot be done at this stage of the order.':
    'অর্ডারের এই ধাপে এটি করা যাবে না।',
  'This order has already been settled.': 'এই অর্ডারের হিসাব আগেই মিটে গেছে।',
  'Something went wrong. Try again.': 'কিছু একটা সমস্যা হয়েছে। আবার চেষ্টা করুন।',

  /* ---------------- cook stores: shared vocabulary ---------------- */
  SHOP: 'দোকান',
  SHOPS: 'দোকান',
  HOME: 'ঘরোয়া',
  BASKET: 'ঝুড়ি',
  'Your shop': 'আপনার দোকান',
  'Home shops': 'ঘরোয়া দোকান',
  'That photo could not be saved. Try again.': 'ছবিটি সংরক্ষণ করা যায়নি। আবার চেষ্টা করুন।',
  'RannaBari — your kitchen': 'রান্নাবাড়ি — আপনার রান্নাঘর',
  /* Adding items to a custom request. */
  'Add this item': 'এই আইটেমটি যোগ করুন',
  'Remove {name}': '{name} সরান',
  /* The map, searching everything it shows. */
  'Dish, kitchen, shop or area': 'পদ, রান্নাঘর, দোকান বা এলাকা',
  '{n} places': '{n}টি জায়গা',
  'Nothing found. Try a dish, a kitchen, a shop or an area.': 'কিছু পাওয়া যায়নি। একটি পদ, রান্নাঘর, দোকান বা এলাকা লিখে দেখুন।',
  'Nothing on the map has a location on file yet.': 'মানচিত্রে এখনো কোনো কিছুর অবস্থান দেওয়া নেই।',
  /* The address book. */
  'Delivery addresses': 'ডেলিভারি ঠিকানা',
  '{n} saved · delivering to {label}': '{n}টি সংরক্ষিত · {label}-এ যাচ্ছে',
  'Add where your food should go': 'খাবার কোথায় যাবে যোগ করুন',
  'ADDRESSES': 'ঠিকানা',
  'ADDRESS': 'ঠিকানা',
  'Orders go to the one marked delivering. Tap another to switch.': 'যেটিতে “এখানে যাচ্ছে” লেখা, অর্ডার সেখানেই যাবে। বদলাতে অন্যটিতে চাপ দিন।',
  'Delivering here': 'এখানে যাচ্ছে',
  'Deliver here instead': 'এখানে পাঠান',
  'Delivering to {label} from now on.': 'এখন থেকে {label}-এ যাবে।',
  'No addresses yet': 'এখনো কোনো ঠিকানা নেই',
  'Add where you want food delivered. You can keep more than one.': 'খাবার কোথায় চান যোগ করুন। একাধিক রাখতে পারেন।',
  'Add an address': 'ঠিকানা যোগ করুন',
  'Save address': 'ঠিকানা সংরক্ষণ করুন',
  'Address saved.': 'ঠিকানা সংরক্ষিত হয়েছে।',
  'Remove {label}?': '{label} সরাবেন?',
  'This only removes the address. Your past orders keep the one they were sent to.': 'শুধু ঠিকানাটি সরবে। আগের অর্ডারগুলো যেখানে গিয়েছিল সেখানেই থাকবে।',
  'No street given': 'কোনো রাস্তা দেওয়া নেই',
  'Note for the rider (optional)': 'রাইডারের জন্য নোট (ঐচ্ছিক)',
  'The pin is what decides which kitchens can reach you.': 'কোন রান্নাঘর আপনার কাছে পৌঁছাতে পারবে তা এই পিনই ঠিক করে।',
  'Give a street or an area so a rider can find you.': 'রাইডার যেন খুঁজে পায় — একটি রাস্তা বা এলাকা দিন।',
  'Sign in to save addresses': 'ঠিকানা সংরক্ষণ করতে সাইন ইন করুন',
  'Your addresses follow your account, so they are there on any device.': 'ঠিকানা আপনার অ্যাকাউন্টের সাথে থাকে, তাই যেকোনো ডিভাইসে পাবেন।',
  'Saving…': 'সংরক্ষণ হচ্ছে…',
  'NEW': 'নতুন',
  /* Where a cook stands with verification. */
  'Verification in progress': 'যাচাই চলছে',
  'Verification needs your attention': 'যাচাইয়ে আপনার নজর দরকার',
  'You can take orders now. The verified badge appears on your listing once we have checked your details.': 'আপনি এখনই অর্ডার নিতে পারেন। তথ্য যাচাই হলে আপনার তালিকায় ভেরিফাইড ব্যাজ দেখা যাবে।',
  'We could not verify your kitchen. Message us and we will sort it out.': 'আপনার রান্নাঘর যাচাই করা যায়নি। আমাদের বার্তা দিন, আমরা সমাধান করে দেব।',
  'Message support': 'সাপোর্টে বার্তা দিন',
  /* The shop's own pin and reach. */
  'Where the shop is': 'দোকান কোথায়',
  'Customers see this pin and measure delivery from it.': 'ক্রেতারা এই পিন দেখে এবং এখান থেকেই ডেলিভারি মাপা হয়।',
  'Using your kitchen’s location. Move the pin to set its own.': 'আপনার রান্নাঘরের অবস্থান ব্যবহার হচ্ছে। আলাদা করতে পিন সরান।',
  /* Saved shops, and searching inside one. */
  'Saved shops': 'সংরক্ষিত দোকান',
  'Save this shop': 'এই দোকানটি সংরক্ষণ করুন',
  'Saved — tap to remove': 'সংরক্ষিত — সরাতে চাপ দিন',
  '{name} saved. Find it in your profile.': '{name} সংরক্ষিত হয়েছে। প্রোফাইলে পাবেন।',
  '{name} removed from your saved shops.': '{name} সংরক্ষিত দোকান থেকে সরানো হয়েছে।',
  'Keep the shops you buy from again': 'যে দোকান থেকে আবার কিনবেন সেগুলো রাখুন',
  '{n} kept': '{n}টি রাখা আছে',
  'No saved shops yet': 'এখনো কোনো দোকান সংরক্ষিত নেই',
  'Tap the star on any shop to keep it here.': 'যেকোনো দোকানের তারায় চাপ দিলে এখানে জমা হবে।',
  'The shops you kept, in the order you kept them.': 'আপনার রাখা দোকানগুলো, যে ক্রমে রেখেছেন।',
  'Sign in to keep shops': 'দোকান সংরক্ষণ করতে সাইন ইন করুন',
  'Your saved shops follow your account, so they are there on any device.': 'সংরক্ষিত দোকান আপনার অ্যাকাউন্টের সাথে থাকে, তাই যেকোনো ডিভাইসে পাবেন।',
  'SAVED': 'সংরক্ষিত',
  'Search in this shop…': 'এই দোকানে খুঁজুন…',
  '{n} found': '{n}টি পাওয়া গেছে',
  /* The bottom tab. One word, because seven labels share a phone's width
     and the long form truncates to something unreadable. */
  Shops: 'দোকান',
  'All shops': 'সব দোকান',
  'Browse shops': 'দোকান দেখুন',
  Products: 'পণ্য',
  products: 'পণ্য',
  'Product name': 'পণ্যের নাম',
  Category: 'ক্যাটাগরি',
  Categories: 'ক্যাটাগরি',
  Name: 'নাম',
  Price: 'দাম',
  Stock: 'স্টক',
  'In stock': 'স্টকে আছে',
  'Out of stock': 'স্টকে নেই',
  Hidden: 'লুকানো',
  Unavailable: 'পাওয়া যাচ্ছে না',
  'On sale': 'বিক্রিতে',
  'Pre-order': 'প্রি-অর্ডার',
  'Pre-orders': 'প্রি-অর্ডার',
  'Pre-orderable': 'প্রি-অর্ডারযোগ্য',
  'Shop open': 'দোকান খোলা',
  'Shop closed': 'দোকান বন্ধ',
  'Shop basket': 'দোকানের ঝুড়ি',
  'Shop orders': 'দোকানের অর্ডার',
  'Shop settings': 'দোকানের সেটিংস',
  'Shop name': 'দোকানের নাম',
  Items: 'যা যা আছে',
  Free: 'ফ্রি',
  'Free delivery': 'ফ্রি ডেলিভারি',
  'Delivery fee': 'ডেলিভারি ফি',
  Preparation: 'তৈরির সময়',
  'Preparation time': 'তৈরির সময়',
  Photo: 'ছবি',
  'Cover photo': 'কভার ছবি',
  Icon: 'আইকন',
  Manage: 'পরিচালনা',
  Never: 'কখনো নয়',
  More: 'বাড়ান',
  Fewer: 'কমান',
  'Move up': 'উপরে নিন',
  'Move down': 'নিচে নিন',
  Rename: 'নাম বদলান',
  Delete: 'মুছুন',
  Decline: 'ফিরিয়ে দিন',
  'and up': 'থেকে শুরু',
  'Active orders': 'চলমান অর্ডার',
  'Your catalogue': 'আপনার তালিকা',
  'Held for you': 'আপনার জন্য জমা',
  'Waiting for the cook': 'রাঁধুনির উত্তরের অপেক্ষায়',
  'Pre-order declined': 'প্রি-অর্ডার ফিরিয়ে দেওয়া হয়েছে',

  /* ---------------- cook stores: the storefront ---------------- */
  'Cakes, pitha, achar and everything else cooks make to keep.':
    'কেক, পিঠা, আচার — রাঁধুনিরা যা যা বানিয়ে রাখেন।',
  'Cakes, pitha, achar and gifts': 'কেক, পিঠা, আচার আর উপহার',
  'Home shops near you': 'আপনার কাছের ঘরোয়া দোকান',
  'No shops near you yet': 'আপনার কাছে এখনো কোনো দোকান নেই',
  'Cooks near you have not opened a shop yet. If you cook, yours can be the first.':
    'আপনার কাছের রাঁধুনিরা এখনো দোকান খোলেননি। আপনি রাঁধলে আপনারটাই প্রথম হতে পারে।',
  'Shop not found': 'দোকান পাওয়া যায়নি',
  'That shop is no longer listed.': 'দোকানটি আর তালিকায় নেই।',
  'This shop is closed right now.': 'দোকানটি এখন বন্ধ।',
  '{name} is closed. The shelves are here for when they open again.':
    '{name} এখন বন্ধ। আবার খুললে এখান থেকেই নিতে পারবেন।',
  '{name} is closed right now.': '{name} এখন বন্ধ।',
  'This shop has not listed anything yet.': 'এই দোকানে এখনো কিছু দেওয়া হয়নি।',
  'This category is empty. Try another one.': 'এই ক্যাটাগরি খালি। অন্যটা দেখুন।',
  '{n} products': '{n}টি পণ্য',
  '{n} in basket': 'ঝুড়িতে {n}টি',
  'Delivery ৳{fee}': 'ডেলিভারি ৳{fee}',
  'Delivery ৳{fee} · free over ৳{over}': 'ডেলিভারি ৳{fee} · ৳{over}-এর বেশি হলে ফ্রি',
  '৳{fee}': '৳{fee}',
  '৳{fee}, free over ৳{over}': '৳{fee}, ৳{over}-এর বেশি হলে ফ্রি',
  '{name} added to your basket.': '{name} ঝুড়িতে যোগ হয়েছে।',
  '{name} added as a pre-order.': '{name} প্রি-অর্ডার হিসেবে যোগ হয়েছে।',

  /* ---------------- cook stores: a product ---------------- */
  'Product not found': 'পণ্য পাওয়া যায়নি',
  'That product is no longer listed.': 'পণ্যটি আর তালিকায় নেই।',
  '{name} is out of stock.': '{name} স্টকে নেই।',
  '{name} is not on sale right now.': '{name} এখন বিক্রি হচ্ছে না।',
  'Only {n} left of {name}.': '{name} আর মাত্র {n}টি আছে।',
  'The kitchen sells this in larger quantities.':
    'রাঁধুনি এটি আরও বেশি পরিমাণে বিক্রি করেন।',
  'You can order at most {n} of this.': 'এটি সর্বোচ্চ {n}টি নেওয়া যাবে।',
  'minimum {n}': 'সর্বনিম্ন {n}টি',
  'Pre-order only': 'শুধু প্রি-অর্ডার',
  'This is out of stock, but {cook} makes it to order. Your payment is held while they decide, and returned in full if they cannot take it.':
    'এটি স্টকে নেই, তবে {cook} অর্ডার পেলে বানিয়ে দেন। তাঁরা সিদ্ধান্ত না নেওয়া পর্যন্ত টাকা জমা থাকবে, নিতে না পারলে পুরোটাই ফেরত।',
  'Add to basket': 'ঝুড়িতে যোগ করুন',
  'Buy now': 'এখনই কিনুন',
  'Pre-order · ৳{n}': 'প্রি-অর্ডার · ৳{n}',

  /* ---------------- cook stores: the basket ---------------- */
  'Your basket is empty': 'আপনার ঝুড়ি খালি',
  'Your basket is empty.': 'আপনার ঝুড়ি খালি।',
  'Anything you add from a shop lands here.': 'দোকান থেকে যা যোগ করবেন এখানে আসবে।',
  'Paid from your wallet, and held until the food reaches you.':
    'ওয়ালেট থেকে টাকা যায়, আর খাবার না পৌঁছানো পর্যন্ত জমা থাকে।',
  'Some of this is a pre-order': 'এর কিছু অংশ প্রি-অর্ডার',
  'Pre-ordered items go to the cook as a request and are billed separately from the rest. If the cook cannot take them, that part is refunded in full.':
    'প্রি-অর্ডারের জিনিসগুলো রাঁধুনির কাছে অনুরোধ হিসেবে যায় আর আলাদা বিল হয়। তাঁরা নিতে না পারলে ওই অংশ পুরোটাই ফেরত।',
  'Place order · ৳{n}': 'অর্ডার দিন · ৳{n}',
  'Fix the basket to continue': 'এগোতে ঝুড়ি ঠিক করুন',
  'Top up to continue': 'এগোতে টপ আপ করুন',
  'Top up ৳{n} to place this order': 'এই অর্ডার দিতে ৳{n} টপ আপ করুন',
  '৳{n} left after this order': 'এই অর্ডারের পর ৳{n} থাকবে',
  'The cook is paid only after you confirm the food arrived.':
    'আপনি খাবার পেয়েছেন জানানোর পরই রাঁধুনি টাকা পান।',
  '{n} items · ৳{total} · paid from your wallet':
    '{n}টি জিনিস · ৳{total} · ওয়ালেট থেকে',
  'No kitchen dishes yet': 'রান্নাঘরের কোনো পদ নেই',
  'Withdraw pre-order': 'প্রি-অর্ডার তুলে নিন',
  'Withdraw this pre-order?': 'প্রি-অর্ডারটি তুলে নেবেন?',
  '{cook} has not answered yet. ৳{n} is held, and comes straight back if they decline.':
    '{cook} এখনো উত্তর দেননি। ৳{n} জমা আছে, তাঁরা না নিলে সঙ্গে সঙ্গেই ফেরত।',

  /* ---------------- cook stores: the cook’s shop ---------------- */
  'Sell cakes, pitha, achar — anything you make that keeps.':
    'কেক, পিঠা, আচার — যা যা বানিয়ে রাখা যায়, বিক্রি করুন।',
  'You have not opened a shop yet': 'আপনি এখনো দোকান খোলেননি',
  'A shop is your own storefront: your categories, your products, your stock. It sits alongside your kitchen, not instead of it.':
    'দোকান হলো আপনার নিজের দোকানঘর: আপনার ক্যাটাগরি, আপনার পণ্য, আপনার স্টক। এটি রান্নাঘরের বদলে নয়, পাশাপাশি চলে।',
  'Open your shop': 'দোকান খুলুন',
  'Opening…': 'খোলা হচ্ছে…',
  '{name} is open.': '{name} খোলা আছে।',
  '{name} is closed. Nothing can be bought.': '{name} বন্ধ। কিছু কেনা যাবে না।',
  'Tap to open your shop': 'দোকান খুলতে ট্যাপ করুন',
  'Tap to start selling': 'বিক্রি শুরু করতে ট্যাপ করুন',
  '{n} products on sale': '{n}টি পণ্য বিক্রিতে',
  'Name, price, stock and photos': 'নাম, দাম, স্টক আর ছবি',
  'Products and stock': 'পণ্য ও স্টক',
  '{n} listed, {out} out of stock': '{n}টি আছে, {out}টি স্টকে নেই',
  '{n} categories, in your own order': '{n}টি ক্যাটাগরি, আপনার সাজানো ক্রমে',
  '{n} waiting for your answer': '{n}টি আপনার উত্তরের অপেক্ষায়',
  'Nothing waiting': 'অপেক্ষায় কিছু নেই',
  'Name, photos, delivery and contact': 'নাম, ছবি, ডেলিভারি আর যোগাযোগ',
  'View your shop': 'আপনার দোকান দেখুন',
  'See it the way a customer does': 'ক্রেতা যেভাবে দেখেন সেভাবে দেখুন',
  'Products, stock and shop orders': 'পণ্য, স্টক আর দোকানের অর্ডার',
  'Open a shop for the things you make to keep':
    'যা বানিয়ে রাখেন তার জন্য দোকান খুলুন',
  'Closed — nothing in it can be bought. Tap to open.':
    'বন্ধ — ভেতরের কিছুই কেউ কিনতে পারছে না। খুলতে চাপ দিন।',
  '{n} pre-orders waiting for your answer': '{n}টি প্রি-অর্ডার আপনার উত্তরের অপেক্ষায়',

  /* ---------------- cook stores: settings and categories ---------------- */
  'This is the first thing a customer sees. Changes are live at once.':
    'ক্রেতা সবার আগে এটাই দেখেন। পরিবর্তন সঙ্গে সঙ্গেই কার্যকর হয়।',
  'Change cover photo': 'কভার ছবি বদলান',
  'Change shop logo': 'দোকানের লোগো বদলান',
  'Tap either photo to change it.': 'যেকোনো ছবিতে ট্যাপ করে বদলান।',
  'One line about the shop': 'দোকান নিয়ে এক লাইন',
  'Cakes, pitha and achar, made at home': 'ঘরে বানানো কেক, পিঠা আর আচার',
  'What you make, and how you make it': 'কী বানান, আর কীভাবে বানান',
  'Free over (optional)': 'কত টাকার বেশি হলে ফ্রি (ইচ্ছে হলে)',
  'Charged once per order, however many things are in the basket.':
    'ঝুড়িতে যতই থাকুক, প্রতি অর্ডারে একবারই নেওয়া হয়।',
  'RannaBari needs photo access to set a shop photo.':
    'দোকানের ছবি দিতে রান্নাবাড়ির ছবির অনুমতি লাগবে।',
  'Your own shelves, in the order customers will see them.':
    'আপনার নিজের তাক, ক্রেতারা যে ক্রমে দেখবেন সেভাবেই।',
  'New category': 'নতুন ক্যাটাগরি',
  'Start from a common one': 'কমন একটি থেকে শুরু করুন',
  'Add category': 'ক্যাটাগরি যোগ করুন',
  Cake: 'কেক',
  'No categories yet': 'এখনো কোনো ক্যাটাগরি নেই',
  'Add the first one above. Products go under them.':
    'উপরে প্রথমটি যোগ করুন। পণ্য এগুলোর নিচেই থাকে।',
  'Move or delete its {n} products first.': 'আগে এর {n}টি পণ্য সরান বা মুছুন।',
  'Give it a name.': 'একটি নাম দিন।',

  /* ---------------- cook stores: products ---------------- */
  'Add a product': 'পণ্য যোগ করুন',
  'Add product': 'পণ্য যোগ করুন',
  'Edit product': 'পণ্য সম্পাদনা',
  'Delete product': 'পণ্য মুছুন',
  'Tap again to delete': 'মুছতে আবার ট্যাপ করুন',
  'Remove photo': 'ছবি সরান',
  'It appears in your shop as soon as you save.':
    'সেভ করলেই এটি আপনার দোকানে দেখা যাবে।',
  'Change stock here. Tap a product to edit everything else.':
    'স্টক এখানেই বদলান। বাকি সব বদলাতে পণ্যে ট্যাপ করুন।',
  'No products yet': 'এখনো কোনো পণ্য নেই',
  'Add the first thing you sell. It goes live as soon as you save.':
    'যা বিক্রি করবেন তার প্রথমটি যোগ করুন। সেভ করলেই চালু।',
  'Nothing in this view': 'এই ভিউতে কিছু নেই',
  'Try another filter.': 'অন্য ফিল্টার দেখুন।',
  'Hide from the shop': 'দোকান থেকে লুকান',
  'Put back on sale': 'আবার বিক্রিতে দিন',
  'How it sells': 'কীভাবে বিক্রি হবে',
  'Allow pre-orders': 'প্রি-অর্ডার চালু রাখুন',
  'When stock hits zero this keeps selling, as a request you accept or decline.':
    'স্টক শূন্য হলেও এটি বিক্রি চলবে — অনুরোধ হিসেবে, যা আপনি নেবেন বা ফিরিয়ে দেবেন।',
  'Turn this off to hide it without deleting it.': 'না মুছে লুকাতে এটি বন্ধ করুন।',
  'Minimum order': 'সর্বনিম্ন অর্ডার',
  'Maximum (optional)': 'সর্বোচ্চ (ইচ্ছে হলে)',
  '24 hours': '২৪ ঘণ্টা',
  'Delivery note (optional)': 'ডেলিভারির নোট (ইচ্ছে হলে)',
  'Delivered chilled, same day': 'একই দিনে ঠান্ডা অবস্থায় পৌঁছাবে',
  'What is in it, and how it is made': 'কী দিয়ে বানানো, কীভাবে বানানো',
  'Chocolate Cake': 'চকলেট কেক',
  'Make a category first — products live under them.':
    'আগে একটি ক্যাটাগরি বানান — পণ্য এগুলোর নিচেই থাকে।',
  'RannaBari needs photo access to set a product photo.':
    'পণ্যের ছবি দিতে রান্নাবাড়ির ছবির অনুমতি লাগবে।',

  /* ---------------- cook stores: orders and pre-orders ---------------- */
  'You are paid when the customer confirms the parcel arrived.':
    'ক্রেতা পার্সেল পেয়েছেন জানালেই আপনি টাকা পাবেন।',
  'No shop orders yet': 'এখনো কোনো দোকানের অর্ডার নেই',
  'When somebody buys from your shop it lands here.':
    'কেউ আপনার দোকান থেকে কিনলে এখানে আসবে।',
  'Answer this pre-order': 'এই প্রি-অর্ডারের উত্তর দিন',
  'Start packing': 'প্যাক করা শুরু',
  'Mark ready': 'তৈরি বলে চিহ্নিত করুন',
  'Send out': 'পাঠিয়ে দিন',
  '{n} person is waiting to hear from you.': '{n} জন আপনার উত্তরের অপেক্ষায়।',
  '{n} people are waiting to hear from you.': '{n} জন আপনার উত্তরের অপেক্ষায়।',
  'Requests for things you were out of land here.':
    'যেগুলো স্টকে ছিল না, তার অনুরোধ এখানে আসে।',
  'Turn on pre-orders for a product and customers can still ask for it when it sells out.':
    'কোনো পণ্যে প্রি-অর্ডার চালু রাখলে শেষ হয়ে গেলেও ক্রেতারা চাইতে পারবেন।',
  'Already answered': 'উত্তর দেওয়া হয়েছে',
  '৳{n} is held. Declining returns it in full.':
    '৳{n} জমা আছে। ফিরিয়ে দিলে পুরোটাই ফেরত যাবে।',
  'Accepted. {customer} has been told.':
    'গ্রহণ করা হয়েছে। {customer}-কে জানানো হয়েছে।',
  'Declined. ৳{n} went back to {customer}.':
    'ফিরিয়ে দেওয়া হয়েছে। ৳{n} {customer}-এর কাছে ফেরত গেছে।',

  /* ---------------- cook stores: notifications ---------------- */
  'New store order': 'দোকানে নতুন অর্ডার',
  '{customer} ordered {title} — ৳{amount}.':
    '{customer} {title} অর্ডার করেছেন — ৳{amount}।',
  'New pre-order request': 'নতুন প্রি-অর্ডারের অনুরোধ',
  '{customer} asked to pre-order {title}. Accept or decline.':
    '{customer} {title} প্রি-অর্ডার করতে চেয়েছেন। নিন বা ফিরিয়ে দিন।',
  'Pre-order sent': 'প্রি-অর্ডার পাঠানো হয়েছে',
  '৳{amount} is held while {cook} decides. You get it back if they decline.':
    '{cook} সিদ্ধান্ত নেওয়া পর্যন্ত ৳{amount} জমা থাকবে। না নিলে ফেরত পাবেন।',
  'Pre-order accepted': 'প্রি-অর্ডার গ্রহণ করা হয়েছে',
  '{cook} accepted your pre-order for {title}.':
    '{cook} আপনার {title}-এর প্রি-অর্ডার নিয়েছেন।',
  '{cook} could not take {title}. ৳{amount} is back in your wallet.':
    '{cook} {title} নিতে পারেননি। ৳{amount} আপনার ওয়ালেটে ফিরে এসেছে।',
  'Interest, orders and payouts from your kitchen and shop.':
    'আপনার রান্নাঘর ও দোকানে আগ্রহ, অর্ডার আর টাকা।',
  'Meals and shops near you, and where your orders have got to.':
    'কাছের খাবার ও দোকান, আর আপনার অর্ডার কোথায় পৌঁছাল।',

  /* ---------------- food requests: shared vocabulary ---------------- */
  FOOD: 'খাবারের',
  REQUESTS: 'অনুরোধ',
  'Food requests': 'খাবারের অনুরোধ',
  'Your requests': 'আপনার অনুরোধ',
  'Request not found': 'অনুরোধ পাওয়া যায়নি',
  'That request no longer exists.': 'ওই অনুরোধটি আর নেই।',
  Offers: 'অফার',
  'Other offers': 'অন্যান্য অফার',
  'Your offers': 'আপনার অফার',
  'No offers yet': 'এখনো কোনো অফার নেই',
  '{n} offers': '{n}টি অফার',
  Lowest: 'সবচেয়ে কম',
  'no price yet': 'এখনো দাম দেননি',
  'from ৳{n}': '৳{n} থেকে',
  'around ৳{n}': 'প্রায় ৳{n}',
  '{n} portions': '{n} জনের',
  'Agreed price': 'রাজি হওয়া দাম',
  You: 'আপনি',
  'the customer': 'ক্রেতা',
  'your price': 'আপনার দাম',
  'Your price': 'আপনার দাম',
  'Your cook': 'আপনার রাঁধুনি',
  Send: 'পাঠান',
  Withdraw: 'তুলে নিন',
  'One cook': 'একজন রাঁধুনি',
  'Sent to you': 'আপনাকে পাঠানো',
  'Open to every cook': 'সব রাঁধুনির জন্য খোলা',

  /* ---------------- food requests: statuses ---------------- */
  'Taking offers': 'অফার নেওয়া হচ্ছে',
  'Pay to confirm': 'নিশ্চিত করতে টাকা দিন',
  Ordered: 'অর্ডার হয়েছে',
  Withdrawn: 'তুলে নেওয়া হয়েছে',
  'Price submitted': 'দাম দেওয়া হয়েছে',
  Negotiating: 'দরদাম চলছে',
  Agreed: 'রাজি',
  'Not selected': 'বাছাই হয়নি',

  /* ---------------- food requests: the customer ---------------- */
  'Ask for something': 'কিছু চেয়ে নিন',
  'Ask for something nobody has listed, and let cooks name their price.':
    'তালিকায় নেই এমন কিছু চান, রাঁধুনিরা নিজেরাই দাম বলবেন।',
  'Nothing asked for yet': 'এখনো কিছু চাওয়া হয়নি',
  'Wanted a two-pound chocolate cake for Friday and could not find one? Describe it, and every cook who could make it can offer you a price.':
    'শুক্রবারের জন্য দুই পাউন্ডের চকলেট কেক দরকার কিন্তু পাচ্ছেন না? লিখে দিন, যাঁরা বানাতে পারেন তাঁরাই দাম বলবেন।',
  'Describe what you want. Cooks answer with their own price, and you pick.':
    'কী চান লিখুন। রাঁধুনিরা নিজেদের দাম বলবেন, আপনি বেছে নেবেন।',
  'Who should see this': 'কে দেখবে',
  'Every cook who can reach you': 'যাঁরা আপনার কাছে পৌঁছাতে পারেন সবাই',
  '{n} kitchens right now. You compare their prices.':
    'এখন {n}টি রান্নাঘর। আপনি দাম মিলিয়ে দেখবেন।',
  'Pick a kitchen below': 'নিচে থেকে রান্নাঘর বাছুন',
  'What do you want?': 'কী চান?',
  '2 pound chocolate cake': '২ পাউন্ড চকলেট কেক',
  'Anything the cook should know': 'রাঁধুনির যা জানা দরকার',
  'No nuts. Written on top: Happy Birthday.':
    'বাদাম দেবেন না। উপরে লেখা থাকবে: শুভ জন্মদিন।',
  'How many': 'কতটি',
  'Budget (optional)': 'বাজেট (ইচ্ছে হলে)',
  'Leave blank': 'খালি রাখুন',
  'When do you need it': 'কবে লাগবে',
  'Ask every cook': 'সব রাঁধুনিকে জিজ্ঞেস করুন',
  'Send the request': 'অনুরোধ পাঠান',
  'Say what you are looking for.': 'কী খুঁজছেন লিখুন।',
  'Nothing is charged until you agree a price and pay.':
    'দামে রাজি হয়ে টাকা না দেওয়া পর্যন্ত কিছুই কাটা হবে না।',
  'Ask cooks for something nobody has listed':
    'তালিকায় নেই এমন কিছু রাঁধুনিদের কাছে চান',
  '{n} taking offers': '{n}টিতে অফার আসছে',

  /* ---------------- food requests: comparing and choosing ---------------- */
  'Cooks who can make this will answer with their own price.':
    'যাঁরা এটি বানাতে পারেন তাঁরা নিজেদের দাম বলবেন।',
  'Choose {who}': '{who}-কে বাছুন',
  'You picked {who}. The other cooks were told.':
    'আপনি {who}-কে বেছেছেন। বাকি রাঁধুনিদের জানানো হয়েছে।',
  '{n} offers · ৳{low}': '{n}টি অফার · ৳{low}',
  '{n} offers · ৳{low} – ৳{high}': '{n}টি অফার · ৳{low} – ৳{high}',
  '{n} more interested, price to come': 'আরও {n} জন আগ্রহী, দাম আসছে',
  'Negotiating with {who}': '{who}-এর সাথে দরদাম চলছে',
  'Paid and on its way': 'টাকা দেওয়া হয়েছে, পথে আছে',
  'You withdrew this': 'আপনি এটি তুলে নিয়েছেন',
  'Agreed at ৳{n} — pay to confirm': '৳{n}-এ রাজি — নিশ্চিত করতে টাকা দিন',

  /* ---------------- food requests: negotiation ---------------- */
  'How the price moved': 'দাম যেভাবে বদলাল',
  'You offered': 'আপনি বলেছেন',
  '{who} offered': '{who} বলেছেন',
  '{who} agreed': '{who} রাজি হয়েছেন',
  '৳{n} is on the table': 'এখন ৳{n} বলা হয়েছে',
  'Accept it, or name a different price.': 'রাজি হন, নয়তো অন্য দাম বলুন।',
  'Waiting on {who}': '{who}-এর উত্তরের অপেক্ষা',
  'They have your ৳{n}. You will be told when they answer.':
    'আপনার বলা ৳{n} তাঁদের কাছে আছে। উত্তর দিলেই জানানো হবে।',
  'Accept ৳{n}': '৳{n}-এ রাজি',
  'Offer less': 'কম বলুন',
  'Meet in the middle': 'মাঝামাঝি বলুন',
  'Agreed at ৳{n}': '৳{n}-এ রাজি হয়েছেন',
  'Agreed at ৳{n}. Pay to confirm.': '৳{n}-এ রাজি। নিশ্চিত করতে টাকা দিন।',
  'Agreed at ৳{n}. Waiting for payment.': '৳{n}-এ রাজি। টাকার অপেক্ষায়।',
  'Pay to confirm the order. Nothing is charged until you do.':
    'অর্ডার নিশ্চিত করতে টাকা দিন। তার আগে কিছুই কাটা হবে না।',
  'Waiting for the customer to pay.': 'ক্রেতার টাকা দেওয়ার অপেক্ষায়।',

  /* ---------------- food requests: paying ---------------- */
  'Pay ৳{n}': '৳{n} দিন',
  'Pay ৳{n}?': '৳{n} দেবেন?',
  'Pay now': 'এখনই দিন',
  '৳{n} leaves your wallet now and is held by RannaBari. {cook} is paid only after you confirm the food arrived.':
    'এখন ৳{n} আপনার ওয়ালেট থেকে কেটে রান্নাবাড়ির কাছে জমা থাকবে। খাবার পেয়েছেন জানানোর পরই {cook} টাকা পাবেন।',
  'Ordered at ৳{n}': '৳{n}-এ অর্ডার হয়েছে',
  'Track it, and confirm when the food arrives.': 'দেখতে থাকুন, খাবার এলে জানিয়ে দিন।',
  'Withdraw this request': 'এই অনুরোধটি তুলে নিন',
  'Withdraw this request?': 'অনুরোধটি তুলে নেবেন?',
  'Every offer on it closes. Nothing has been charged, so nothing is refunded.':
    'এর সব অফার বন্ধ হয়ে যাবে। কিছুই কাটা হয়নি, তাই ফেরতেরও কিছু নেই।',

  /* ---------------- food requests: the cook ---------------- */
  'Customers asking for things nobody has listed.':
    'তালিকায় নেই এমন কিছু ক্রেতারা চাইছেন।',
  'Customers asking for things nobody has listed':
    'তালিকায় নেই এমন কিছু ক্রেতারা চাইছেন',
  '{n} people are looking for something you could make.':
    '{n} জন এমন কিছু খুঁজছেন যা আপনি বানাতে পারেন।',
  '{n} waiting for your price': '{n}টি আপনার দামের অপেক্ষায়',
  'Waiting for your price': 'আপনার দামের অপেক্ষায়',
  'When somebody near you wants something they cannot find, it lands here and you can name your price.':
    'আপনার কাছের কেউ না পাওয়া কিছু চাইলে সেটি এখানে আসবে, আর আপনি দাম বলতে পারবেন।',
  'What would you charge?': 'আপনি কত নেবেন?',
  'How long you need': 'আপনার কত সময় লাগবে',
  'A note to the customer (optional)': 'ক্রেতার জন্য নোট (ইচ্ছে হলে)',
  'I make these to order, fresh on the day.': 'অর্ডার পেলে সেদিনই টাটকা বানিয়ে দিই।',
  'Send my price': 'আমার দাম পাঠান',
  'Update my offer': 'আমার অফার বদলান',
  'Change your price': 'দাম বদলান',
  'Just register interest': 'শুধু আগ্রহ জানান',
  'Your price is with the customer.': 'আপনার দাম ক্রেতার কাছে গেছে।',
  'You are on the list. Add a price when you know it.':
    'আপনি তালিকায় আছেন। দাম ঠিক হলে যোগ করুন।',
  'Other cooks cannot see your price, and you cannot see theirs.':
    'অন্য রাঁধুনিরা আপনার দাম দেখতে পান না, আপনিও তাঁদেরটা দেখবেন না।',
  'Withdraw my offer': 'আমার অফার তুলে নিন',
  'The order': 'অর্ডারটি',
  'Open the order': 'অর্ডারটি খুলুন',
  'The customer went with another cook': 'ক্রেতা অন্য রাঁধুনিকে বেছেছেন',
  'The customer withdrew this request': 'ক্রেতা অনুরোধটি তুলে নিয়েছেন',
  'Nothing more to do here.': 'এখানে আর কিছু করার নেই।',

  /* ---------------- food requests: notifications ---------------- */
  'New food request': 'নতুন খাবারের অনুরোধ',
  '{customer} is looking for {title}. Name your price.':
    '{customer} {title} খুঁজছেন। আপনার দাম বলুন।',
  'Request withdrawn': 'অনুরোধ তুলে নেওয়া হয়েছে',
  '{customer} withdrew the request for {title}.':
    '{customer} {title}-এর অনুরোধ তুলে নিয়েছেন।',
  'A cook is interested': 'একজন রাঁধুনি আগ্রহী',
  '{cook} is interested in {title}.': '{cook} {title}-এ আগ্রহী।',
  'New offer': 'নতুন অফার',
  '{cook} offered ৳{amount} for {title}.': '{cook} {title}-এর জন্য ৳{amount} বলেছেন।',
  'Offer withdrawn': 'অফার তুলে নেওয়া হয়েছে',
  '{cook} pulled out of {title}.': '{cook} {title} থেকে সরে গেছেন।',
  'You were chosen': 'আপনাকে বাছাই করা হয়েছে',
  '{customer} picked your offer for {title}.':
    '{customer} {title}-এর জন্য আপনার অফার নিয়েছেন।',
  'Offer not selected': 'অফার বাছাই হয়নি',
  '{customer} went with another cook for {title}.':
    '{customer} {title}-এর জন্য অন্য রাঁধুনিকে বেছেছেন।',
  'Counter offer': 'পাল্টা দাম',
  '৳{amount} for {title}. Accept it or name another price.':
    '{title}-এর জন্য ৳{amount}। রাজি হন, নয়তো অন্য দাম বলুন।',
  'Price agreed': 'দামে রাজি',
  '৳{amount} agreed with {cook}. Pay to confirm the order.':
    '{cook}-এর সাথে ৳{amount}-এ রাজি। অর্ডার নিশ্চিত করতে টাকা দিন।',
  '৳{amount} agreed for {title}. Waiting for payment.':
    '{title}-এর জন্য ৳{amount}-এ রাজি। টাকার অপেক্ষায়।',
  '{customer} paid ৳{amount} for {title}. Start when you are ready.':
    '{customer} {title}-এর জন্য ৳{amount} দিয়েছেন। প্রস্তুত হলেই শুরু করুন।',

  /* ---------------- food requests: errors ---------------- */
  'This request is no longer taking offers.': 'এই অনুরোধে আর অফার নেওয়া হচ্ছে না।',
  'You were not asked for this one.': 'এটির জন্য আপনাকে বলা হয়নি।',
  'That offer no longer stands.': 'ওই অফারটি আর নেই।',
  'This offer is closed.': 'এই অফারটি বন্ধ।',
  'That cook has not named a price yet.': 'ওই রাঁধুনি এখনো দাম বলেননি।',
  'It is the other side’s turn.': 'এখন অন্য পক্ষের পালা।',
  'Agree a price first.': 'আগে দামে রাজি হন।',

  /* ---------------- food requests: declining and walking away ---------------- */
  'Just interested': 'শুধু আগ্রহী',
  'Not interested': 'আগ্রহী নই',
  'Choose a different cook': 'অন্য রাঁধুনি বাছুন',
  'Choose a different cook?': 'অন্য রাঁধুনি বাছবেন?',
  'This negotiation closes and the other offers come back. Your request stays open.':
    'এই দরদাম বন্ধ হবে আর বাকি অফারগুলো ফিরে আসবে। আপনার অনুরোধ খোলা থাকবে।',
  'Go back to the offers': 'অফারগুলোয় ফিরুন',
  'Back to the other offers.': 'বাকি অফারগুলোয় ফেরা হলো।',

  /* ---------------- food requests: the fuller status set ---------------- */
  Selected: 'বাছাই করা',
  'Turned down': 'নেওয়া হয়নি',
  Expired: 'সময় পেরিয়ে গেছে',
  'The cook passed': 'রাঁধুনি নেননি',
  'They cannot take {title}. Try asking every cook instead.':
    'তাঁরা {title} নিতে পারছেন না। সব রাঁধুনিকে জিজ্ঞেস করে দেখুন।',
  'Offer turned down': 'অফার নেওয়া হয়নি',
  '{customer} did not take your price for {title}.':
    '{customer} {title}-এর জন্য আপনার দাম নেননি।',
  '{n} cooks have offered': '{n} জন রাঁধুনি দাম দিয়েছেন',
  'The lowest so far is ৳{low} for {title}.':
    '{title}-এর জন্য এখন পর্যন্ত সবচেয়ে কম ৳{low}।',
};
