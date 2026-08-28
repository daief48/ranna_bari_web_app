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
  Home: 'হোম',
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
};
