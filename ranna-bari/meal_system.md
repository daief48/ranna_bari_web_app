# 🍱 Meal Management System — Final Requirement

এই Meal System-এ **Admin → Cook → User**—তিনটি পক্ষের জন্য Category, Monthly Meal Plan, Flexible Meal Selection, Pricing, Advance Payment, Delivery Confirmation এবং Daily Payment Release-এর সম্পূর্ণ ব্যবস্থা থাকবে।

---

# ১. System থেকে Meal Category থাকবে

System/Admin Panel থেকে predefined Meal Category থাকবে:

| Category      | Default Rate |
| ------------- | -----------: |
| Business Meal |         ৳250 |
| Student Meal  |          ৳80 |
| Regular Meal  |          ৳60 |

এই Rate হলো **System Default Rate**।

Cook যেকোনো একটি Category নির্বাচন করে সেই Category-এর Meal Service চালু করতে পারবে।

---

# ২. Cook Category নির্বাচন

উদাহরণ:

Cook **Business Meal** নির্বাচন করল।

তাহলে সে Business Meal-এর:

* Default Price
* Full Monthly Meal Calendar
* Breakfast
* Lunch
* Dinner

দেখতে পারবে।

System Default:

**Business Meal = ৳250 / Meal**

Cook চাইলে এই Rate ব্যবহার করবে অথবা নিজের Rate সেট করবে।

উদাহরণ:

**System Rate = ৳250**

Cook সেট করল:

**Cook Rate = ৳300**

তাহলে User-এর জন্য Final Rate হবে:

**৳300 / Meal**

---

# ৩. Monthly Meal Calendar

প্রতিটি Meal Category-এর জন্য System থেকে একটি Monthly Meal Plan থাকবে।

Calendar-এ প্রতিটি তারিখের Breakfast, Lunch এবং Dinner দেখানো হবে।

উদাহরণ:

### September 1

* Breakfast → ডাল + রুটি
* Lunch → বিরিয়ানি
* Dinner → মাছের তরকারি

### September 2

* Breakfast → খিচুড়ি
* Lunch → মুরগি
* Dinner → লাল শাক

### September 3

* Breakfast → পরোটা + ডিম
* Lunch → গরুর মাংস
* Dinner → সবজি

এভাবে পুরো মাসের প্রতিটি Date-এর Meal Calendar থাকবে।

---

# ৪. Cook System-এর Meal Plan ব্যবহার করতে পারবে

Cook চাইলে System-এর তৈরি Default Meal Plan কোনো পরিবর্তন ছাড়াই ব্যবহার করতে পারবে।

উদাহরণ:

**September 1**

Breakfast → ডাল + রুটি
Lunch → বিরিয়ানি
Dinner → মাছের তরকারি

Cook এই Plan অনুযায়ী সরাসরি Service দিতে পারবে।

---

# ৫. Cook System Meal Plan Override করতে পারবে

Cook চাইলে System-এর Default Meal Plan নিজের মতো করে পরিবর্তন করতে পারবে।

উদাহরণ:

### System Plan

**September 1**

* Breakfast → ডাল + রুটি
* Lunch → বিরিয়ানি
* Dinner → মাছের তরকারি

Cook পরিবর্তন করল:

### Cook Plan

**September 1**

* Breakfast → খিচুড়ি
* Lunch → মুরগি
* Dinner → লাল শাক

Cook যেকোনো:

* Date
* Breakfast
* Lunch
* Dinner
* একাধিক Date
* সম্পূর্ণ মাস

Edit করতে পারবে।

**তবে Cook-এর পরিবর্তন System-এর Original Meal Plan পরিবর্তন করবে না।**

---

# ৬. Cook সম্পূর্ণ নিজের Meal Plan তৈরি করতে পারবে

Cook চাইলে System-এর Plan Edit না করে একদম শুরু থেকে নিজের Monthly Meal Plan তৈরি করতে পারবে।

Flow:

```text
Select Category
      ↓
Select Month
      ↓
Open Calendar
      ↓
Select Date
      ↓
Set Breakfast
      ↓
Set Lunch
      ↓
Set Dinner
      ↓
Save Meal Plan
      ↓
Publish Meal Plan
```

Cook পুরো মাসের প্রতিটি Date অনুযায়ী নিজের Meal Schedule তৈরি করতে পারবে।

---

# ৭. Cook নতুন Meal তৈরি করতে পারবে

Cook System-এ থাকা Meal-এর পাশাপাশি নিজের নতুন Meal তৈরি করতে পারবে।

উদাহরণ:

**Meal Name:** Chicken Khichuri
**Meal Type:** Lunch
**Category:** Business Meal

এরপর Cook Calendar-এর যেকোনো Date-এ এই Meal ব্যবহার করতে পারবে।

---

# ৮. Cook Minimum ও Maximum Meal Quantity সেট করবে

Cook User-এর জন্য কতগুলো Meal নিতে হবে তার একটি Range সেট করতে পারবে।

উদাহরণ:

**Minimum Meal = 3**
**Maximum Meal = 7**

এর অর্থ User-কে অবশ্যই **কমপক্ষে ৩টি এবং সর্বোচ্চ ৭টি Meal** নিতে হবে।

---

# ৯. User নিজের ইচ্ছামতো Meal নির্বাচন করবে

এটি System-এর একটি গুরুত্বপূর্ণ Feature।

User-কে পুরো মাসের প্রতিটি Meal নিতে হবে না।

User Calendar থেকে নিজের প্রয়োজন অনুযায়ী **যেকোনো Date-এর Breakfast, Lunch অথবা Dinner** নির্বাচন করতে পারবে।

অর্থাৎ User-এর Meal Selection হবে **Date + Meal Type ভিত্তিক**।

---

# ১০. User-এর Flexible Meal Selection — Example

ধরা যাক Cook September মাসের জন্য প্রতিদিন ৩টি Meal সেট করেছে:

* Breakfast
* Lunch
* Dinner

এখন User পুরো মাসের সব Meal নিতে বাধ্য নয়।

User নিজের প্রয়োজন অনুযায়ী নির্বাচন করতে পারবে।

### September 1

User নির্বাচন করল:

* Breakfast ✅
* Lunch ✅
* Dinner ❌

**Total = 2 Meals**

---

### September 3

User নির্বাচন করল:

* Breakfast ❌
* Lunch ❌
* Dinner ✅

**Total = 1 Meal**

---

### September 5

User নির্বাচন করল:

* Breakfast ✅
* Lunch ❌
* Dinner ✅

**Total = 2 Meals**

---

### User-এর Total Selection

```text
September 1 → 2 Meals
September 3 → 1 Meal
September 5 → 2 Meals

Total = 5 Meals
```

যদি Cook-এর Rule হয়:

**Minimum = 3**
**Maximum = 7**

তাহলে User-এর **5 Meals valid** হবে।

User Meal Order Confirm করতে পারবে।

---

# ১১. User যেকোনো Date থেকে Meal নিতে পারবে

User চাইলে:

* শুধু ১ সেপ্টেম্বরের Breakfast নিতে পারে
* ১ সেপ্টেম্বরের Breakfast + Lunch নিতে পারে
* ৩ সেপ্টেম্বরের Dinner নিতে পারে
* ৫ সেপ্টেম্বরের Breakfast + Dinner নিতে পারে
* অন্য যেকোনো Date-এর Meal নিতে পারে

তবে সবগুলো Selection-এর **Total Quantity** Cook-এর Min/Max Rule-এর মধ্যে থাকতে হবে।

---

# ১২. Minimum / Maximum Validation

ধরা যাক:

**Minimum = 3**
**Maximum = 7**

User নির্বাচন করল:

```text
Sept 1 → 2 Meals
Sept 3 → 1 Meal
```

Total:

**3 Meals**

✅ Valid

---

User নির্বাচন করল:

```text
Sept 1 → 2 Meals
Sept 3 → 1 Meal
Sept 5 → 2 Meals
```

Total:

**5 Meals**

✅ Valid

---

User নির্বাচন করল:

```text
Sept 1 → 2 Meals
Sept 3 → 1 Meal
Sept 5 → 2 Meals
Sept 7 → 2 Meals
```

Total:

**7 Meals**

✅ Valid

কিন্তু:

```text
Total = 8 Meals
```

❌ Invalid

কারণ Maximum = 7।

একইভাবে:

```text
Total = 2 Meals
```

❌ Invalid

কারণ Minimum = 3।

---

# ১৩. Minimum = Maximum হলে

Cook চাইলে:

**Minimum = 7**
**Maximum = 7**

সেট করতে পারবে।

তাহলে User পুরো মাস থেকে নিজের ইচ্ছামতো Date এবং Meal Type নির্বাচন করতে পারবে, কিন্তু সব Selection মিলিয়ে অবশ্যই:

**Exactly 7 Meals**

হতে হবে।

উদাহরণ:

```text
Sept 1 → 2 Meals
Sept 3 → 1 Meal
Sept 5 → 2 Meals
Sept 8 → 2 Meals

Total = 7 Meals
```

✅ Valid

অর্থাৎ User-কে নির্দিষ্ট ৭টি Meal নিতে হবে, কিন্তু **কোন ৭টি Meal নেবে সেটা User নিজের প্রয়োজন অনুযায়ী নির্বাচন করতে পারবে**।

---

# ১৪. User-এর জন্য Meal Selection Calendar

User Calendar ওপেন করলে প্রতিটি Meal-এর পাশে Select Option থাকবে।

উদাহরণ:

### September 1

| Meal      | Food         | Select |
| --------- | ------------ | ------ |
| Breakfast | ডাল + রুটি   | ☑      |
| Lunch     | বিরিয়ানি    | ☑      |
| Dinner    | মাছের তরকারি | ☐      |

**Selected Meals: 2**

---

### September 3

| Meal      | Food    | Select |
| --------- | ------- | ------ |
| Breakfast | খিচুড়ি | ☐      |
| Lunch     | মুরগি   | ☐      |
| Dinner    | লাল শাক | ☑      |

**Selected Meals: 1**

---

### September 5

| Meal      | Food        | Select |
| --------- | ----------- | ------ |
| Breakfast | পরোটা + ডিম | ☑      |
| Lunch     | গরুর মাংস   | ☐      |
| Dinner    | সবজি        | ☑      |

**Selected Meals: 2**

---

### Order Summary

```text
Total Selected Meals: 5
Meal Rate: ৳300
Total Amount: ৳1,500

Minimum Required: 3
Maximum Allowed: 7

Status: Valid
```

---

# ১৫. Advance Payment বাধ্যতামূলক

User Meal নির্বাচন করার পর Order Confirm করতে হলে অবশ্যই Advance Payment করতে হবে।

User-এর App Wallet-এ আগে টাকা Top-up করতে হবে।

Flow:

```text
Wallet Top-up
      ↓
Select Cook
      ↓
Select Meal Category
      ↓
View Calendar
      ↓
Select Desired Meals
      ↓
System Calculates Total Meals
      ↓
Validate Min/Max
      ↓
Calculate Total Price
      ↓
Advance Payment
      ↓
Meal Confirmed
```

---

# ১৬. Meal Price Calculation

ধরা যাক:

**Cook Meal Rate = ৳300**

User নির্বাচন করল:

**5 Meals**

তাহলে:

**5 × ৳300 = ৳1,500**

User-এর Wallet থেকে:

**৳1,500**

Advance হিসেবে নেওয়া হবে।

তারপর Meal Order:

**Confirmed**

হবে।

---

# ১৭. Advance Payment System

User-এর Advance Payment সরাসরি Cook-এর কাছে যাবে না।

টাকা প্রথমে System-এর **Hold/Escrow Balance**-এ থাকবে।

```text
User Wallet
    ↓
Advance Payment
    ↓
System Hold / Escrow
    ↓
Cook Delivers Meal
    ↓
User Confirms Received
    ↓
Admin Reviews
    ↓
Admin Releases Payment
    ↓
Cook Wallet
```

---

# ১৮. Cook প্রতিটি Meal-এর Payment প্রতিদিন পাবে

User একসাথে ৫টি Meal-এর Advance Payment করলেও Cook একসাথে ৳1,500 পাবে না।

প্রতিটি Meal আলাদাভাবে Process হবে।

উদাহরণ:

| Date   | Meal      | Amount | Payment |
| ------ | --------- | -----: | ------- |
| Sept 1 | Breakfast |   ৳300 | Pending |
| Sept 1 | Lunch     |   ৳300 | Pending |
| Sept 3 | Dinner    |   ৳300 | Pending |
| Sept 5 | Breakfast |   ৳300 | Pending |
| Sept 5 | Dinner    |   ৳300 | Pending |

Total Advance:

**৳1,500**

কিন্তু প্রতিটি Meal-এর Payment আলাদাভাবে Release হবে।

---

# ১৯. Cook Meal Deliver করবে

নির্দিষ্ট Date ও Meal Time-এ Cook User-কে Meal Deliver করবে।

Cook Delivery করার পর:

**Meal Status → Delivered**

করবে।

---

# ২০. User Meal Received Confirm করবে

User Meal হাতে পাওয়ার পর:

**Meal Received**

Button চাপবে।

তখন:

```text
Meal Status:

Scheduled
    ↓
Delivered
    ↓
Meal Received
    ↓
Payment Release Pending
```

---

# ২১. Admin Payment Release করবে

Admin Panel-এর **Order Management** থেকে Admin প্রতিটি Meal-এর Status দেখতে পারবে।

Admin দেখতে পারবে:

* User
* Cook
* Category
* Date
* Meal Type
* Meal Name
* Meal Price
* Delivery Status
* User Confirmation
* Payment Status

উদাহরণ:

```text
Order: #ORD-10025

Date: September 1
Meal: Lunch
Cook: Karim
User: Rahim

Amount: ৳300

Delivery: Delivered
User Confirmation: Meal Received
Payment: Release Pending
```

Admin যাচাই করার পর:

**Release Payment**

button চাপবে।

তারপর:

**৳300 → Cook Wallet**

---

# ২২. প্রতিটি Meal আলাদাভাবে Payment Release হবে

একটি User যদি ৫টি Meal নির্বাচন করে:

```text
Sept 1 Breakfast → ৳300
Sept 1 Lunch     → ৳300
Sept 3 Dinner    → ৳300
Sept 5 Breakfast → ৳300
Sept 5 Dinner    → ৳300
```

তাহলে প্রতিটি Meal-এর:

* Delivery
* User Confirmation
* Admin Approval
* Payment Release

আলাদাভাবে Track হবে।

---

# ২৩. User Wallet

User App-এ Wallet থাকবে।

User Wallet থেকে:

* টাকা Top-up করতে পারবে
* Balance দেখতে পারবে
* Meal Advance Payment করতে পারবে
* Transaction History দেখতে পারবে
* Refund দেখতে পারবে

উদাহরণ:

```text
Wallet Balance: ৳5,000

Meal Advance: -৳1,500

Remaining Balance: ৳3,500
```

---

# ২৪. Cook Wallet

Cook-এরও Wallet থাকবে।

Admin Payment Release করার পর সেই টাকা Cook-এর Wallet-এ যোগ হবে।

উদাহরণ:

```text
Cook Wallet

Previous Balance: ৳2,000

Released Payment: +৳300

Current Balance: ৳2,300
```

Cook পরবর্তীতে Wallet থেকে Withdraw করতে পারবে।

---

# ২৫. Order এবং Payment Status

### Meal Status

```text
Scheduled
   ↓
Preparing
   ↓
Delivered
   ↓
Meal Received
```

### Payment Status

```text
Pending
   ↓
Advance Paid
   ↓
Payment Held
   ↓
Release Pending
   ↓
Released
```

---

# ২৬. Order Price Snapshot

Order তৈরি হওয়ার সময়:

* Meal Rate
* Meal Name
* Meal Category
* Date
* Breakfast/Lunch/Dinner
* Selected Meal

সবকিছুর একটি Snapshot Order-এর মধ্যে Save করতে হবে।

উদাহরণ:

Order তৈরি হওয়ার সময়:

**Meal Rate = ৳300**

পরে Cook Rate পরিবর্তন করে:

**৳350**

করলেও পুরোনো Order-এর Meal Rate:

**৳300**

-ই থাকবে।

এতে পুরোনো Order-এর Financial Data পরিবর্তন হবে না।

---

# ২৭. Complete Example

ধরা যাক:

### Cook Configuration

Category:

**Business Meal**

System Rate:

**৳250**

Cook Custom Rate:

**৳300**

Minimum:

**3 Meals**

Maximum:

**7 Meals**

---

### User Selection

**September 1**

* Breakfast → Selected ✅
* Lunch → Selected ✅
* Dinner → Not Selected ❌

Total = **2 Meals**

**September 3**

* Dinner → Selected ✅

Total = **1 Meal**

**September 5**

* Breakfast → Selected ✅
* Dinner → Selected ✅

Total = **2 Meals**

### Final Selection

```text
Sept 1 → 2 Meals
Sept 3 → 1 Meal
Sept 5 → 2 Meals

Total = 5 Meals
```

Min = 3
Max = 7

তাই:

**5 Meals → Valid ✅**

---

### Payment

Meal Rate:

**৳300**

Total:

**5 × ৳300 = ৳1,500**

User Wallet থেকে:

**৳1,500 Advance Payment**

করা হবে।

Order:

**Confirmed ✅**

---

### Delivery

Sept 1 Breakfast:

**Delivered → User Received → Admin Release → Cook +৳300**

Sept 1 Lunch:

**Delivered → User Received → Admin Release → Cook +৳300**

Sept 3 Dinner:

**Delivered → User Received → Admin Release → Cook +৳300**

Sept 5 Breakfast:

**Delivered → User Received → Admin Release → Cook +৳300**

Sept 5 Dinner:

**Delivered → User Received → Admin Release → Cook +৳300**

শেষে Cook মোট:

**৳1,500**

পাবে।

---

# ২৮. Final Business Logic

এই System-এর মূল Logic হবে:

```text
SYSTEM
  │
  ├── Business → ৳250
  ├── Student  → ৳80
  └── Regular  → ৳60
          │
          ▼
        COOK
          │
          ├── Select Category
          ├── Use System Meal Plan
          ├── Override System Plan
          ├── Create Custom Plan
          ├── Create New Meals
          ├── Set Custom Rate
          ├── Set Minimum Meals
          └── Set Maximum Meals
                  │
                  ▼
                USER
                  │
                  ├── View Full Monthly Calendar
                  ├── Select Any Date
                  ├── Select Breakfast
                  ├── Select Lunch
                  ├── Select Dinner
                  │
                  ▼
           Total Meal Validation
                  │
          ┌───────┴────────┐
          │                │
       Invalid            Valid
          │                │
          ▼                ▼
       Reject          Calculate Price
                           │
                           ▼
                     Wallet Balance
                           │
                           ▼
                     Advance Payment
                           │
                           ▼
                   Meal Confirmed
                           │
                           ▼
                     COOK DELIVERS
                           │
                           ▼
                   USER RECEIVES
                           │
                           ▼
                User → Meal Received
                           │
                           ▼
                         ADMIN
                           │
                           ▼
                   Release Payment
                           │
                           ▼
                     COOK WALLET
```

# ২৯. মূল নিয়মগুলো সংক্ষেপে

1. System থেকে Business, Student এবং Regular Meal Category থাকবে।
2. প্রতিটি Category-এর Default Rate থাকবে।
3. Cook যেকোনো Category নির্বাচন করতে পারবে।
4. প্রতিটি Category-এর Monthly Meal Calendar থাকবে।
5. Calendar-এ প্রতিদিন Breakfast, Lunch এবং Dinner থাকবে।
6. Cook System-এর Default Plan ব্যবহার করতে পারবে।
7. Cook Default Plan Override/Edit করতে পারবে।
8. Cook সম্পূর্ণ Custom Meal Plan তৈরি করতে পারবে।
9. Cook নতুন Meal তৈরি করতে পারবে।
10. Cook নিজের Meal Rate সেট করতে পারবে।
11. Cook Minimum ও Maximum Meal Quantity সেট করতে পারবে।
12. User পুরো মাসের সব Meal নিতে বাধ্য নয়।
13. User নিজের প্রয়োজন অনুযায়ী যেকোনো Date-এর Breakfast/Lunch/Dinner নির্বাচন করতে পারবে।
14. User-এর সব Selected Meal-এর Total Quantity Min/Max-এর মধ্যে থাকতে হবে।
15. Min = Max হলে User-কে ঠিক সেই সংখ্যক Meal নির্বাচন করতে হবে।
16. User Order Confirm করার আগে Wallet-এ পর্যাপ্ত টাকা থাকতে হবে।
17. User-কে সম্পূর্ণ Selected Meal-এর জন্য Advance Payment করতে হবে।
18. Advance Payment System/Escrow-এ Hold থাকবে।
19. Cook প্রতিটি Meal আলাদাভাবে Deliver করবে।
20. User Meal পাওয়ার পর **Meal Received** Confirm করবে।
21. Admin Order যাচাই করে Payment Release করবে।
22. Payment Release হলে সেই Meal-এর টাকা Cook Wallet-এ যাবে।
23. প্রতিটি Meal-এর Payment আলাদাভাবে Track ও Release হবে।
24. একই Payment একাধিকবার Release করা যাবে না।
25. পুরোনো Order-এর Price ও Meal Plan Snapshot হিসেবে সংরক্ষণ করতে হবে।
26. পরবর্তীতে Cook Price বা Meal Plan পরিবর্তন করলেও পুরোনো Order পরিবর্তন হবে না।
27. User এবং Cook উভয়ের Wallet ও Transaction History থাকবে।
28. প্রতিটি Meal-এর Delivery, Confirmation এবং Payment-এর সম্পূর্ণ History রাখতে হবে।
