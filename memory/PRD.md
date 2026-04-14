# Tech Store App - PRD (متجر التقنية)

## Overview
تطبيق متجر إلكتروني للهواتف والأجهزة الذكية مبني بـ React Native (Expo) مع FastAPI Backend و MongoDB.

## MVP Features (Phase 1) ✅

### Authentication
- تسجيل دخول بالهاتف وكلمة المرور
- إنشاء حساب جديد
- JWT Token authentication
- حماية المسارات (Protected Routes)

### Home Screen
- بانرات ترويجية (Slider)
- أقسام المنتجات (هواتف، أجهزة لوحية، حواسيب، اكسسوارات، ساعات ذكية، ألعاب)
- منتجات مميزة (Featured Products)
- Pull to refresh

### Product Details
- صور المنتج
- اختيار اللون والتخزين
- المواصفات التقنية
- التقييم والمبيعات
- إضافة للسلة

### Shopping Cart
- عرض منتجات السلة
- تعديل الكمية
- حذف المنتجات
- ملخص الطلب (فرعي + ضريبة + توصيل)
- إتمام الطلب

### Search & Filter
- بحث بالاسم (عربي/إنجليزي)
- فلترة حسب القسم
- عرض عدد النتائج

### Settings/Profile
- عرض بيانات المستخدم
- المحفظة (نقاط + رصيد)
- قائمة الإعدادات (طلبات، فواتير، مفضلة، عناوين، دعم فني)
- تسجيل الخروج

## Navigation
- 5 Bottom Tabs: الرئيسية، الخدمات، المسابقات، السوشل، حسابي

## Tech Stack
- **Frontend**: React Native / Expo SDK 54 / Expo Router
- **Backend**: FastAPI / Python
- **Database**: MongoDB / Motor (async)
- **Auth**: JWT + bcrypt

## Upcoming Phases
- Phase 2: الخدمات والصيانة
- Phase 3: المسابقات والسحوبات
- Phase 4: السوشل ميديا
- Phase 5: نظام الإعلانات
- Phase 6: لوحة التحكم (Dashboard)
