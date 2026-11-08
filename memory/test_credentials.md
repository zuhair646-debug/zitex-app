# Zitex — Test Credentials (Pre-seeded Accounts)

استخدم هذه الحسابات لاختبار أدوار التطبيق المختلفة. كل الحسابات يتم تأكيدها تلقائياً عند تشغيل seed.

## Customer (مستخدم عادي)
- Phone: `0500000000`
- Password: `test1234`

## Merchant (التاجر)
- Phone: `0509999999`
- Password: `merchant2025`

## Chamber (غرفة التجارة)
- Phone: `0550000000`
- Password: `chamber2025`

## Driver (السائق)
- Phone: `0540001111`
- Password: `driver1234`

## Employees (موظفو التاجر) - يعملون تحت 0509999999
- Cashier: `0530000001` / `emp1234` (كاشير - فرع الرياض)
- Marketer (standalone role "marketer", code SARA10 → lands on /my-affiliate): `0530000002` / `emp1234`
- Branch Manager: `0530000003` / `emp1234` (مدير فرع جدة)

## Specialist staff dashboards (v1.40.0) — all password `emp1234`, land on /merchant with a role-specific dashboard
- Social media specialist: `0530000006` (perms social, competitions, banners)
- Services specialist: `0530000007` (services, tickets_reply)
- Inventory keeper: `0530000008` (inventory, products)
- Support agent: `0530000009` (support, tickets_reply, customers, orders) → /merchant/tickets Kanban
- Operations supervisor: `0530000010` (tasks, orders, delivery, tickets_reply) → manages /merchant/tasks
- Technician: `0530000005`, Sales (hourly): `0530000004`

## ملاحظات للوكلاء (Agents)
- جميع الحسابات يتم تحديثها بشكل idempotent في seed_data() عند تشغيل الخادم
- إذا فشل تسجيل دخول السائق، تحقق من logs `Driver account verified: 0540001111/driver1234`
- التاجر يدخل تلقائياً إلى /merchant بعد تسجيل الدخول، السائق إلى /driver، غرفة التجارة إلى /chamber
