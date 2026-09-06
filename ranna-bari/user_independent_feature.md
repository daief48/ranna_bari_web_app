Smart Mess Meal Management System
পূর্ণ Functional & Product Requirement Document
Mess Meal হিসাব • Multi-user Management • Monthly Settlement • Smart Meal Planner • AI/ML Readiness
Developer-ready system specification
 
ডকুমেন্টের কাঠামো
1. সিস্টেমের উদ্দেশ্য ও Scope
2. Role & Permission Model
3. Registration, Mess Membership ও User Lifecycle
4. User Meal Schedule
5. Daily Meal Entry
6. Bulk Meal Management
7. Monthly Meal Calculation
8. Expense ও Bazar Management
9. Meal Rate Calculation Engine
10. Monthly Settlement ও Month Close
11. Smart Meal Planner
12. Food Database ও Price Intelligence
13. Recipe & Portion Costing
14. Smart Recommendation Engine
15. AI/ML Learning Strategy
16. User Preference ও Personalization
17. Smart Plan Adjustment
18. Kitchen Forecast ও Waste Reduction
19. Dashboards & Reports
20. Notifications
21. Audit Log ও Data Security
22. Database Entity Blueprint
23. API/Backend Module Blueprint
24. Core Business Rules
25. Example Scenario
26. Recommended Implementation Phases
27. Final Product Definition
 
1. সিস্টেমের উদ্দেশ্য ও Scope
এই system একটি পূর্ণাঙ্গ Smart Mess Management platform হবে। এখানে registered users-এর দৈনিক meal count, monthly meal rate, mess expense, monthly settlement এবং future meal planning একই ecosystem-এর মধ্যে পরিচালিত হবে।
•	প্রতিটি User-এর meal আলাদাভাবে track করা হবে।
•	Manager একসাথে একাধিক registered User-এর meal entry দিতে পারবে।
•	General User নিজের meal history ও হিসাব দেখতে পারবে।
•	Admin পুরো system-এর configuration, role, food data এবং reporting control করবে।
•	মাস শেষে system actual meal rate এবং user-wise settlement তৈরি করবে।
•	User target meal rate দিলে Smart Engine budget-aware monthly meal plan তৈরি করবে।
মূল ধারণা — AI meal rate-এর হিসাব করবে না; নির্ভরযোগ্য হিসাব করবে deterministic cost/accounting engine। AI/ML ব্যবহার হবে recommendation, personalization, forecasting ও optimization-এ।
2. Role & Permission Model
Feature	Admin	Manager	General User
User Registration	✅	—	✅
User-কে Mess-এ Add	✅	✅	❌
Daily Meal Entry	✅	✅	❌
Meal Edit	✅	✅	❌
নিজের Meal দেখা	✅	✅	✅
অন্য User-এর Meal দেখা	✅	Managed Users	❌
Monthly Meal Rate	✅	✅	নিজেরটা
Food/Price Management	✅	❌	❌
Recipe/Portion Cost	✅	❌	❌
Smart Plan Generate	✅	✅	View
Manager Create/Remove	✅	❌	❌
Role Change	✅	❌	❌
System Settings	✅	সীমিত	❌
Audit Log	✅	নিজের activity	❌

Admin Final Authority — কে Manager হবে, কে General User থাকবে এবং কোন mess configuration প্রযোজ্য হবে—এসবের final decision Admin নেবে।
3. Registration, Mess Membership ও User Lifecycle
1. ব্যক্তি প্রথমে App-এ registration করবে।
2. Account তৈরি হলে তাকে registered user হিসেবে পাওয়া যাবে।
3. Manager/Admin registered User-কে একটি Mess-এ add করবে।
4. User চাইলে অন্য mess-এর member হতে পারবে; প্রতিটি mess-এর হিসাব আলাদা রাখতে হবে।
5. User active/inactive status রাখা হবে।
6. কোনো inactive member-এর নতুন meal entry defaultভাবে দেওয়া যাবে না, unless Admin/Manager explicitly re-enable করে।
Critical Rule — Manager unregistered person-কে সরাসরি meal user হিসেবে তৈরি করবে না; আগে app registration, পরে mess membership।
4. User Meal Schedule
প্রতিটি User-এর নিজের meal schedule থাকবে। Default student setup হিসেবে Breakfast OFF, Lunch ON, Dinner ON রাখা যেতে পারে; তবে configuration user/mess অনুযায়ী পরিবর্তনযোগ্য হবে।
User	Breakfast	Lunch	Dinner	Default Daily Max
Daief	ON	ON	ON	3
Raju	OFF	ON	ON	2
Nissa	OFF	ON	OFF	1

Design Rule — Meal schedule-এর ভিত্তিতে Smart Planner expected meal count নির্ধারণ করবে; কিন্তু actual meal count সবসময় actual daily entries থেকে আসবে।
5. Daily Meal Entry
Manager/Admin-এর জন্য দ্রুত checkbox/table-based interface থাকবে।
User	Breakfast	Lunch	Dinner	Total
Daief	✅	✅	✅	3
Raju	—	✅	✅	2
Nissa	—	✅	—	1
Sakib	—	❌	✅	1

•	Date নির্বাচন
•	Breakfast/Lunch/Dinner one-click toggle
•	Daily total auto-calculate
•	Last edited by + timestamp save
•	ভুল entry edit করা যাবে কিন্তু history সংরক্ষণ করতে হবে
6. Bulk Meal Management
•	“Select All Lunch” — selected members-এর Lunch এক click-এ ON।
•	একজন User-এর date range meal ON/OFF করা।
•	যারা বাড়িতে যাবে তাদের জন্য multiple-day absence।
•	Bulk edit করার পরে individual exception edit।
•	Bulk action-এর audit log রাখা।
Operational Goal — Manager যেন ২০–৫০+ user-এর meal entry কয়েক মিনিটে সম্পন্ন করতে পারে—UI-তে speed এবং visibility priority হবে।
7. Monthly Meal Calculation
প্রতিটি User-এর মাসিক meal count Breakfast + Lunch + Dinner-এর actual entries থেকে calculate হবে।
Daily Meal Count = Breakfast Taken + Lunch Taken + Dinner Taken
Monthly Meal Count = Month-এর সব Daily Meal Count-এর যোগফল

User	Breakfast	Lunch	Dinner	Monthly Total
Daief	20	29	28	77
Raju	0	30	27	57
Nissa	0	28	20	48

8. Expense ও Bazar Management
Meal rate accurate করতে শুধু meal count যথেষ্ট নয়; applicable mess expenses capture করতে হবে। তাই Admin/Manager-এর জন্য daily expense module থাকবে।
Expense Category	Example	Meal Rate-এ Include?
Food/Bazar	Rice, Chicken, Fish	হ্যাঁ
Gas/Kitchen	Cooking gas	Configurable
Utility	Water/Electricity	Configurable
Rent	Room rent	Defaultভাবে না
Other	Cleaning/Shared supplies	Configurable

•	Expense date
•	Amount
•	Category
•	Vendor/Shop
•	Payment method
•	Note
•	Receipt image (optional)
•	Created by
9. Meal Rate Calculation Engine
Core Formula — Meal Rate = Applicable Monthly Cost ÷ Total Monthly Meals
Example:
Applicable Monthly Cost = ৳18,000
Total Meals = 300
Meal Rate = ৳18,000 ÷ 300 = ৳60

Admin settings থেকে নির্ধারণ করা যাবে কোন expense category meal rate-এর অংশ হবে। একই সঙ্গে monthly total cost এবং meal count-এর উপর ভিত্তি করে system final rate তৈরি করবে।
10. Monthly Settlement ও Month Close
Month-end-এ system একটি immutable snapshot তৈরি করবে। Month close হওয়ার পর normal manager edit বন্ধ থাকবে।
User	Meals	Final Rate	Meal Share
Daief	60	৳60	৳3,600
Raju	50	৳60	৳3,000
Nissa	45	৳60	৳2,700

•	Close Month
•	Freeze meal entries
•	Freeze applicable expenses
•	Generate user statements
•	Generate mess summary
•	Admin-only correction mode
11. Smart Meal Planner
User target meal rate দিলে Smart Planner পুরো মাসের জন্য budget-aware meal schedule suggest করবে। User-এর meal time, expected meal count, current food prices, recipe cost এবং historical data একসাথে ব্যবহার হবে।
User Target = ৳60
Meal Schedule = Lunch + Dinner
Expected Meals = 30 × 2 = 60
Target Monthly Budget = 60 × ৳60 = ৳3,600

12. Food Database ও Price Intelligence
Food Item	Unit	Current Price	History
Rice	kg	৳75	হ্যাঁ
Chicken	kg	৳300	হ্যাঁ
Fish	kg	৳280	হ্যাঁ
Egg	piece	৳13	হ্যাঁ
Dal	kg	৳140	হ্যাঁ
Potato	kg	৳35	হ্যাঁ
Vegetable	kg	৳50	হ্যাঁ

•	Current price
•	Historical price
•	Effective date
•	Source/Note
•	Availability status
•	Price update history
Real-time Data Rule — Admin price update করলে future recommendation latest price ব্যবহার করবে। পুরোনো month বা closed order-এর historical cost overwrite করা যাবে না।
13. Recipe & Portion Costing
Smart recommendation-কে বাস্তবসম্মত করতে food item-এর পাশাপাশি recipe এবং portion size রাখতে হবে।
Ingredient	Per Portion	Current Unit Price	Estimated Cost
Chicken	120g	৳300/kg	৳36
Oil	10g	৳200/kg	৳2
Onion	30g	৳100/kg	৳3
Spice	5g	—	৳2
Potato	50g	৳40/kg	৳2

Result — Chicken Curry-এর estimated portion cost ≈ ৳45। এই costing engine AI-এর জন্য dependable numerical input তৈরি করবে।
14. Smart Recommendation Engine
Smart Engine-এর দায়িত্ব হবে target budget-এর মধ্যে user-এর জন্য varied এবং practical meal plan খুঁজে বের করা।
Inputs:
- Target Meal Rate
- Expected Meal Count
- Meal Schedule
- Current Food Prices
- Recipe & Portion Cost
- Historical Actual Costs
- User Preferences
- Food Availability

Outputs:
- Monthly Meal Plan
- Estimated Cost per Meal
- Projected Monthly Cost
- Projected Meal Rate
- Confidence Score
- Explanation

•	Cost score
•	Preference score
•	Variety score
•	Availability score
•	Historical accuracy
•	Meal repetition penalty
15. AI/ML Learning Strategy
Recommended Architecture — প্রতিটি নতুন price update-এর সময় পুরো ML model retrain না করে Real-time Database + Historical Data + Optimization Engine ব্যবহার করা হবে। পর্যাপ্ত data জমলে ML layer যোগ করা হবে।
Admin Data + User Data + Historical Data
                ↓
        Cost / Feature Engine
                ↓
        Optimization Engine
                ↓
       AI Recommendation Layer
                ↓
        Monthly Smart Plan

AI/ML পরে Estimated vs Actual cost, accepted/rejected recommendations, user preference এবং food-price trends থেকে recommendation আরও accurate করবে।
16. User Preference ও Personalization
•	Food preference: High / Medium / Low
•	Avoid food list
•	Preferred protein frequency
•	Breakfast preference
•	Lunch/Dinner preference
•	Recent meal repetition avoidance
Preference	Example
Protein	Chicken: 3 days/week
Avoid	Beef: Avoid
Breakfast	Only 2 days/week
Fish	High preference
Variety	Same dish not consecutive

17. Smart Plan Adjustment
Generated plan User দেখতে এবং পরিবর্তন request করতে পারবে। User একটি meal replace করলে projected monthly rate আবার calculate হবে।
Current	Estimated	Alternative	Estimated
Chicken Curry	৳65	Egg Curry	৳48
Fish Curry	৳60	Dal + Vegetable	৳42
Beef Curry	৳80	Chicken Curry	৳65

Smart Warning — User replacement-এর ফলে target ছাড়িয়ে গেলে system warning দেখাবে এবং budget recover করার জন্য অন্য দিনের alternative suggest করবে।
18. Kitchen Forecast ও Waste Reduction
Meal plan ও historical attendance থেকে system পরের দিনের expected portion forecast করবে।
Meal	Expected Portions	Confidence
Breakfast	18	High
Lunch	26	High
Dinner	22	Medium

•	Daily kitchen quantity forecast
•	Over-preparation alert
•	Low-attendance meal detection
•	Potential food waste indicator
•	Weekly kitchen efficiency report
19. Dashboards & Reports
Admin Dashboard
•	Total members
•	Active members
•	Today total meals
•	Breakfast/Lunch/Dinner totals
•	Current estimated rate
•	Current actual rate
•	Monthly expense
•	Food price trends
•	Manager activity
Manager Dashboard
•	Today’s meal entry completion
•	Missing entries
•	User-wise meal counts
•	Bulk meal actions
•	Managed users
General User Dashboard
•	Today’s meals
•	Current month total meals
•	Current/estimated rate
•	Target rate
•	Monthly cost
•	Smart plan
•	Target status
20. Notifications
Actor	Notification	Trigger
Manager	আজ ৪ জনের Lunch entry বাকি	Incomplete daily entry
Admin	Chicken price বেড়েছে	Price update
User	Projected rate ৳62.40	Target risk
User	Smart alternative available	Lower-cost swap found

21. Audit Log ও Data Security
•	প্রতিটি meal entry-তে created_by এবং updated_by
•	Change timestamp
•	Old value/New value
•	Manager activity log
•	Month close-এর পরে admin-only correction
•	Double settlement prevention
•	Closed month snapshot
•	Role-based authorization
Accounting Safety — একটি settled/closed month-এর historical amount silently পরিবর্তন করা যাবে না। Correction করলে adjustment/audit trail তৈরি হবে।
22. Database Entity Blueprint
users
roles
permissions
messes
mess_members
meal_types
user_meal_preferences
daily_meals
meal_entry_audits
food_items
food_prices
food_price_history
recipes
recipe_ingredients
recipe_versions
portion_costs
expenses
expense_categories
expense_receipts
guest_meals
monthly_summaries
monthly_settlements
smart_meal_plans
smart_meal_plan_items
recommendation_logs
recommendation_feedback
notifications
activity_logs

23. API/Backend Module Blueprint
Module	Core Operations
Auth & Roles	Register, Login, Role, Permission
Mess	Create/Join/Member management
Meal Entry	Create, Update, Bulk, Calendar
Meal Settings	Breakfast/Lunch/Dinner preferences
Expenses	Create, Update, Categories, Receipts
Rate Engine	Monthly cost, meal count, rate
Settlement	Close month, statements
Food Intelligence	Food CRUD, Price updates, History
Recipe	Recipe CRUD, Ingredient costing
Smart Planner	Generate, Replace, Recalculate
Reports	Daily, Weekly, Monthly summaries
Audit	Activity & change history
Notification	Alerts & reminders

24. Core Business Rules
1. প্রতিটি meal entry একটি নির্দিষ্ট User + Date + Meal Type-এর জন্য হবে।
2. General User অন্য কারও meal edit করতে পারবে না।
3. Manager শুধুমাত্র assigned/managed mess members-এর meal manage করবে।
4. Admin সব User ও সব mess-এর উপর final control রাখবে।
5. Student default breakfast OFF হলেও user-specific override সম্ভব।
6. Actual monthly meal count কেবল actual entries থেকে আসবে।
7. Meal rate = applicable cost ÷ total meals।
8. Applicable cost categories Admin configure করবে।
9. Closed month-এর data normal edit flow-তে পরিবর্তন করা যাবে না।
10. Historical price overwrite করা যাবে না; new price history row তৈরি হবে।
11. AI recommendation accounting truth-এর source নয়; final financial value cost engine নির্ধারণ করবে।
12. Estimated vs actual cost আলাদাভাবে store করতে হবে।
13. Smart plan target না মানলে system warning ও alternative plan দেখাবে।
14. User meal schedule recommendation input; actual meal count independent source।
15. Bulk action-ও audit log তৈরি করবে।
25. Example Scenario
ধরা যাক Daief-এর meal schedule Breakfast + Lunch এবং September মাসে 60টি expected meal। Daief target meal rate ৳60।
Target Rate = ৳60
Expected Meals = 60
Target Budget = ৳3,600

Smart Plan:
Sep 1 → Breakfast ৳20 + Lunch ৳65
Sep 2 → Breakfast ৳25 + Lunch ৳55
Sep 3 → Breakfast ৳25 + Lunch ৳60
...
Projected Monthly Cost = ৳3,540
Projected Meal Rate = ৳59
Status = Target Achievable

মাসের মধ্যে Manager actual meal count এবং actual expenses update করবে। Month-end-এ system actual rate calculate করবে। Smart estimate এবং actual result compare করে future recommendation উন্নত হবে।
26. Recommended Implementation Phases
Phase	Scope
Phase 1	Auth, roles, mess membership, daily meal entry, monthly meal count
Phase 2	Expenses, food prices, meal rate, settlement, month close
Phase 3	Recipes, portion costing, Smart budget planner
Phase 4	AI recommendation, preference learning, feedback
Phase 5	Kitchen forecast, waste intelligence, advanced analytics

Build Strategy — প্রথমে reliable accounting core তৈরি করবে। Smart/AI layer সেই trusted data-এর উপর বসবে। এতে ভুল AI recommendation হলেও actual হিসাব কখনো নষ্ট হবে না।
27. Final Product Definition
এই app-এর Smart Mess Meal System হবে একটি পূর্ণাঙ্গ meal-accounting ও planning platform—যেখানে Admin পুরো ecosystem control করবে, Manager একাধিক registered User-এর daily meal পরিচালনা করবে, General User নিজের হিসাব দেখতে পারবে, system actual monthly meal rate ও settlement তৈরি করবে, আর Smart Engine target meal rate অনুযায়ী real-time price, recipe/portion cost, historical mess data ও user preference বিশ্লেষণ করে optimized meal plan suggest করবে।
One-line Product Vision — “প্রতিদিনের meal entry থেকে মাসের final হিসাব, এবং মাসের target budget থেকে পরের মাসের smart meal plan—সবকিছু একটি connected system-এর মধ্যে।”
28. গবেষণা ও ডিজাইন রেফারেন্স
এই architecture-এর কিছু design direction Bangladesh-এর mess-management products-এর প্রচলিত feature pattern এবং standard recipe/portion costing principles বিবেচনা করে নেওয়া হয়েছে। এগুলো system requirement-এর বাধ্যতামূলক external dependency নয়; product-design reference হিসেবে ব্যবহার করা হয়েছে।
•	MessMate — meal tracking, expenses, deposits/balance, reporting patterns — https://messmate.bd/en
•	Mess Attendance / Mess Manager — meal planning and attendance patterns — https://messattendence.com/
•	HostelHisab — guest/hostel meal-management pattern — https://hostelhisab.com/
•	Gisslen, Professional Cooking — recipe and portion costing reference — https://resources.escoffier.edu/textbooks/gisslen/professional_cooking_04.pdf
•	BD Mess — monthly reports / mess-management reference — https://bdmess.com/en
Implementation Note: এই ডকুমেন্ট product/functional specification হিসেবে লেখা। Laravel/Node/React Native/Next.js stack অনুযায়ী এটিকে পরবর্তী ধাপে DB schema, API contract এবং screen-by-screen UI specification-এ ভাঙা যাবে।
