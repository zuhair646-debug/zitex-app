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

## ملاحظات للوكلاء (Agents)
- جميع الحسابات يتم تحديثها بشكل idempotent في seed_data() عند تشغيل الخادم
- إذا فشل تسجيل دخول السائق، تحقق من logs `Driver account verified: 0540001111/driver1234`
- التاجر يدخل تلقائياً إلى /merchant بعد تسجيل الدخول، السائق إلى /driver، غرفة التجارة إلى /chamber
