# مشاكل مُبلّغة في v1.0.1 (للجلسة القادمة)

تاريخ التبليغ: 28 مايو 2026
أبلغ بها المستخدم بعد التحديث.

## 🔴 P0 - Critical Bugs

### Bug #1: لوحة تحكم التاجر تفصل عند الضغط
- **الوصف:** بعد تسجيل دخول التاجر، الضغط على أي عنصر/قائمة يخرج المستخدم من التطبيق (crash)
- **المتأثر:** جميع شاشات Merchant
- **محتمل السبب:** 
  - Permission middleware الجديد قد يرجع 403 مع response غير متوقع
  - أو navigation crash بسبب employee role logic
  - أو missing field في user object بعد التحديث
- **الأولوية:** أعلى أولوية - يعطّل العملية بالكامل
- **للتحقق:** فحص crash logs، تجربة الضغط على products/orders/social

### Bug #2: قسم السائق - فشل تسجيل الدخول
- **الوصف:** الحساب 0540001111/driver1234 يرجع "كلمة المرور خطأ"
- **محتمل السبب:**
  - بعد إضافة middleware، قد يُحجب bcrypt verify
  - أو seeded password تغيّر
  - أو role validation يرفض "driver" بطريقة ما
- **الأولوية:** عالية
- **للتحقق:** اختبار `POST /api/auth/login` مع credentials السائق، فحص db.users record

### Bug #3: قسم وزارة التجارة (Chamber) - أخطاء متفرقة
- **الوصف:** بعض الأخطاء (غير محدد بالضبط من المستخدم)
- **الأولوية:** متوسطة
- **للتحقق:** اختبار chamber login flow + endpoints

## 📋 Notes for Future Agent

1. لا تنشر build جديد قبل إصلاح هذه المشاكل
2. تحقق من middleware `enforce_employee_perms` - قد يحجب طلبات شرعية
3. اعد تشغيل seed scripts للتأكد من passwords
4. اختبر جميع الأدوار: customer / merchant / driver / chamber / employee
