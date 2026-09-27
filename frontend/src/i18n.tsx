/**
 * Zenrex Store i18n — Global Multilingual Support (20 languages)
 * Languages: AR, EN, UR, FA, HE (RTL) + ES, FR, DE, IT, PT, RU, TR, ZH, JA, KO, HI, BN, ID, MS, TH
 * Note: Hebrew uses a globe icon (🌐) — not associated with any specific country flag.
 */
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { I18nManager, Platform, NativeModules } from 'react-native';

export type Lang =
  | 'ar' | 'en' | 'ur' | 'fa' | 'he'
  | 'es' | 'fr' | 'de' | 'it' | 'pt'
  | 'ru' | 'tr' | 'zh' | 'ja' | 'ko'
  | 'hi' | 'bn' | 'id' | 'ms' | 'th';

export const LANGUAGES: { code: Lang; name: string; nativeName: string; flag: string }[] = [
  { code: 'ar', name: 'Arabic',     nativeName: 'العربية',   flag: '🇸🇦' },
  { code: 'en', name: 'English',    nativeName: 'English',   flag: '🇺🇸' },
  { code: 'ur', name: 'Urdu',       nativeName: 'اردو',      flag: '🇵🇰' },
  { code: 'fa', name: 'Persian',    nativeName: 'فارسی',     flag: '🇮🇷' },
  { code: 'he', name: 'Hebrew',     nativeName: 'עברית',     flag: '🌐' },
  { code: 'es', name: 'Spanish',    nativeName: 'Español',   flag: '🇪🇸' },
  { code: 'fr', name: 'French',     nativeName: 'Français',  flag: '🇫🇷' },
  { code: 'de', name: 'German',     nativeName: 'Deutsch',   flag: '🇩🇪' },
  { code: 'it', name: 'Italian',    nativeName: 'Italiano',  flag: '🇮🇹' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', flag: '🇵🇹' },
  { code: 'ru', name: 'Russian',    nativeName: 'Русский',   flag: '🇷🇺' },
  { code: 'tr', name: 'Turkish',    nativeName: 'Türkçe',    flag: '🇹🇷' },
  { code: 'zh', name: 'Chinese',    nativeName: '中文',       flag: '🇨🇳' },
  { code: 'ja', name: 'Japanese',   nativeName: '日本語',     flag: '🇯🇵' },
  { code: 'ko', name: 'Korean',     nativeName: '한국어',     flag: '🇰🇷' },
  { code: 'hi', name: 'Hindi',      nativeName: 'हिन्दी',     flag: '🇮🇳' },
  { code: 'bn', name: 'Bengali',    nativeName: 'বাংলা',     flag: '🇧🇩' },
  { code: 'id', name: 'Indonesian', nativeName: 'Indonesia', flag: '🇮🇩' },
  { code: 'ms', name: 'Malay',      nativeName: 'Melayu',    flag: '🇲🇾' },
  { code: 'th', name: 'Thai',       nativeName: 'ไทย',       flag: '🇹🇭' },
];

const RTL_LANGS: Lang[] = ['ar', 'ur', 'fa', 'he'];

// Detect device locale → language code
function detectDeviceLang(): Lang {
  try {
    let locale = '';
    if (Platform.OS === 'ios') {
      locale = NativeModules.SettingsManager?.settings?.AppleLocale || NativeModules.SettingsManager?.settings?.AppleLanguages?.[0] || '';
    } else if (Platform.OS === 'android') {
      locale = NativeModules.I18nManager?.localeIdentifier || '';
    } else if (typeof navigator !== 'undefined') {
      locale = navigator.language || '';
    }
    const l = locale.toLowerCase().slice(0, 2);
    const valid = LANGUAGES.map(x => x.code as string);
    if (valid.includes(l)) return l as Lang;
  } catch {}
  return 'ar';
}

// Full translation dictionary — AR & EN are complete; other languages cover essentials and fall back to EN.
const T: Record<Lang, Record<string, string>> = {
  ar: {
    'common.home': 'الرئيسية', 'common.search': 'بحث', 'common.cart': 'السلة', 'common.profile': 'الملف الشخصي',
    'common.settings': 'الإعدادات', 'common.save': 'حفظ', 'common.cancel': 'إلغاء', 'common.delete': 'حذف',
    'common.edit': 'تعديل', 'common.confirm': 'تأكيد', 'common.back': 'رجوع', 'common.loading': 'جارٍ التحميل...',
    'common.error': 'خطأ', 'common.success': 'تم بنجاح', 'common.yes': 'نعم', 'common.no': 'لا', 'common.currency': 'ر.س',
    'auth.welcome': 'أهلاً بك في Zenrex Store', 'auth.subtitle': 'سجّل دخولك للمتابعة',
    'auth.phone': 'رقم الجوال', 'auth.password': 'كلمة المرور', 'auth.signin': 'تسجيل الدخول', 'auth.signup': 'إنشاء حساب',
    'auth.forgot': 'نسيت كلمة المرور؟', 'auth.noAccount': 'ليس لديك حساب؟', 'auth.logout': 'تسجيل الخروج',
    'auth.invalidCredentials': 'رقم الجوال أو كلمة المرور غير صحيحة', 'auth.networkError': 'تعذر الاتصال بالخادم',
    'auth.fillAllFields': 'يرجى ملء جميع الحقول', 'auth.name': 'الاسم الكامل',
    'tabs.home': 'الرئيسية', 'tabs.services': 'الخدمات', 'tabs.social': 'السوشال', 'tabs.competitions': 'المسابقات', 'tabs.settings': 'الإعدادات',
    'product.addToCart': 'أضف إلى السلة', 'product.buyNow': 'اشترِ الآن', 'product.inStock': 'متوفر', 'product.outOfStock': 'غير متوفر',
    'product.warranty': 'الضمان', 'product.shipping': 'طرق التوصيل', 'product.payment': 'وسائل الدفع', 'product.description': 'الوصف',
    'cart.title': 'السلة', 'cart.empty': 'السلة فارغة', 'cart.total': 'المجموع', 'cart.checkout': 'إتمام الطلب',
    'social.title': 'السوشال', 'social.like': 'إعجاب', 'social.comment': 'تعليق', 'social.send': 'إرسال',
    'social.writeComment': 'اكتب تعليقاً...', 'social.noPosts': 'لا توجد منشورات', 'social.contactStore': 'تواصل مع المتجر',
    'orders.title': 'طلباتي', 'orders.track': 'تتبع الطلب',
    'points.title': 'نقاط الولاء', 'points.balance': 'رصيد النقاط', 'points.redeem': 'استبدال نقاط',
    'gb.title': 'التسوق الجماعي', 'gb.join': 'انضم للمجموعة', 'gb.empty': 'لا يوجد عروض جماعية نشطة',
    'notif.title': 'الإشعارات', 'notif.empty': 'لا توجد إشعارات',
    'settings.language': 'اللغة', 'settings.changeLanguage': 'تغيير اللغة',
    'support.title': 'الدعم الفني', 'support.howCanWeHelp': 'كيف يمكننا مساعدتك؟', 'support.channels': 'وسائل التواصل',
    // Merchant panel
    'merchant.home': 'الرئيسية', 'merchant.orders': 'الطلبات', 'merchant.products': 'المنتجات',
    'merchant.live': 'بث المتجر', 'merchant.more': 'المزيد', 'merchant.dashboard': 'لوحة التاجر',
    'merchant.services': 'الخدمات', 'merchant.competitions': 'المسابقات', 'merchant.social': 'السوشيال ميديا',
    'merchant.overview': 'العام', 'merchant.store': 'المتجر', 'merchant.maintenance': 'الصيانة',
    'merchant.newOrder': 'جديد', 'merchant.processing': 'قيد التنفيذ', 'merchant.ready': 'جاهز',
    'merchant.completed': 'مكتمل', 'merchant.all': 'الكل', 'merchant.active': 'نشطة', 'merchant.ended': 'منتهية',
    'merchant.acceptPrepare': 'قبول وتجهيز', 'merchant.cancelOrder': 'إلغاء', 'merchant.delivery': 'توصيل',
    'merchant.pickupBranch': 'استلام من الفرع', 'merchant.delivered': 'تم التسليم',
    'merchant.available': 'متوفر', 'merchant.featured': 'مميز', 'merchant.searchProduct': 'ابحث عن منتج...',
    'merchant.needsReply': 'يحتاج رد', 'merchant.topEngagement': 'الأكثر تفاعلاً',
    'merchant.livePreviewMode': 'وضع البث المباشر', 'merchant.storeView': 'عرض التاجر — تطابق تام مع تجربة العميل',
    'merchant.account': 'الحساب', 'merchant.dayMode': 'الوضع النهاري', 'merchant.nightMode': 'الوضع الليلي',
    'merchant.tapToToggle': 'اضغط للتبديل بين النهاري والليلي',
    // Analytics tabs
    'a.overview': 'نظرة عامة', 'a.visitors': 'الزوار', 'a.buyers': 'المشترون',
    'a.bookings': 'الحجوزات', 'a.participants': 'المشاركون', 'a.shares': 'المشاركات',
    'a.reviews': 'التقييمات', 'a.compare': 'مقارنة', 'a.returns': 'الإرجاعات',
    'a.complaints': 'الشكاوى', 'a.winners': 'الفائزون', 'a.videos': 'الفيديوهات',
    // Translate
    't.translate': 'ترجم', 't.translated': 'مُترجم', 't.showOriginal': 'إظهار النص الأصلي',
    't.translating': 'جاري الترجمة...',
    // ─── Merchant Home Screen (mh.*) ───
    'mh.hello': 'مرحباً 👋', 'mh.merchantFallback': 'التاجر',
    'mh.dashboardTitle': 'لوحة تحكم Zenrex Store',
    'mh.todaySales': 'إجمالي مبيعات اليوم', 'mh.totalPrefix': 'إجمالي',
    'mh.attCheckedIn': '🟢 أنت مسجّل حضورك', 'mh.attCheckIn': 'سجّل حضورك',
    'mh.attSinceMinutes': 'منذ {n} دقيقة — اضغط للانصراف',
    'mh.attTapToStart': 'اضغط لبدء يوم العمل',
    'mh.attSuccessIn': '✅ تم تسجيل الحضور',
    'mh.attSuccessOut': '✅ تم تسجيل الانصراف — {n} دقيقة',
    'mh.activeOrders': 'طلبات نشطة',
    'mh.products': 'منتجات', 'mh.customers': 'عملاء', 'mh.contests': 'مسابقات',
    'mh.invAlertTitle': 'تنبيه مخزون', 'mh.invOutOfStock': 'نفدت', 'mh.invLowStock': 'منخفضة',
    'mh.quickActions': 'إجراءات سريعة',
    'mh.qaAddProduct': 'إضافة منتج', 'mh.qaPOS': 'نقطة البيع', 'mh.qaInventory': 'المخزون',
    'mh.qaInvoices': 'الفواتير', 'mh.qaMarketing': 'التسويق', 'mh.qaNewPost': 'منشور جديد',
    'mh.qaNewCompetition': 'إنشاء مسابقة', 'mh.qaAddBanner': 'إضافة بانر',
    'mh.qaAddEmployee': 'إضافة موظف', 'mh.qaSupportSettings': 'إعدادات الدعم',
    'mh.recentOrders': 'أحدث الطلبات',
    'mh.ordersNeedAttention': '{n} طلبات تحتاج انتباهك',
    'mh.viewAll': 'عرض الكل',
    'mh.noOrders': 'لا توجد طلبات بعد',
    'mh.noOrdersDesc': 'ستظهر هنا كل الطلبات الجديدة من عملائك',
    'mh.viewProducts': 'عرض المنتجات',
    'mh.customerFallback': 'عميل', 'mh.itemWord': 'منتج',
    // Order statuses (os.*)
    'os.pending': 'قيد الانتظار', 'os.processing': 'قيد التنفيذ', 'os.ready': 'جاهز',
    'os.out_for_delivery': 'في الطريق', 'os.delivered': 'تم التسليم', 'os.cancelled': 'ملغى',
  },
  en: {
    'common.home': 'Home', 'common.search': 'Search', 'common.cart': 'Cart', 'common.profile': 'Profile',
    'common.settings': 'Settings', 'common.save': 'Save', 'common.cancel': 'Cancel', 'common.delete': 'Delete',
    'common.edit': 'Edit', 'common.confirm': 'Confirm', 'common.back': 'Back', 'common.loading': 'Loading...',
    'common.error': 'Error', 'common.success': 'Success', 'common.yes': 'Yes', 'common.no': 'No', 'common.currency': 'SAR',
    'auth.welcome': 'Welcome to Zenrex Store', 'auth.subtitle': 'Sign in to continue',
    'auth.phone': 'Phone number', 'auth.password': 'Password', 'auth.signin': 'Sign in', 'auth.signup': 'Sign up',
    'auth.forgot': 'Forgot password?', 'auth.noAccount': "Don't have an account?", 'auth.logout': 'Logout',
    'auth.invalidCredentials': 'Invalid phone or password', 'auth.networkError': 'Connection failed',
    'auth.fillAllFields': 'Please fill all fields', 'auth.name': 'Full Name',
    'tabs.home': 'Home', 'tabs.services': 'Services', 'tabs.social': 'Social', 'tabs.competitions': 'Competitions', 'tabs.settings': 'Settings',
    'product.addToCart': 'Add to Cart', 'product.buyNow': 'Buy Now', 'product.inStock': 'In Stock', 'product.outOfStock': 'Out of Stock',
    'product.warranty': 'Warranty', 'product.shipping': 'Shipping Methods', 'product.payment': 'Payment Methods', 'product.description': 'Description',
    'cart.title': 'Cart', 'cart.empty': 'Cart is empty', 'cart.total': 'Total', 'cart.checkout': 'Checkout',
    'social.title': 'Social', 'social.like': 'Like', 'social.comment': 'Comment', 'social.send': 'Send',
    'social.writeComment': 'Write a comment...', 'social.noPosts': 'No posts yet', 'social.contactStore': 'Contact the store',
    'orders.title': 'My Orders', 'orders.track': 'Track Order',
    'points.title': 'Loyalty Points', 'points.balance': 'Points Balance', 'points.redeem': 'Redeem Points',
    'gb.title': 'Group Buy', 'gb.join': 'Join Group', 'gb.empty': 'No active group buys',
    'notif.title': 'Notifications', 'notif.empty': 'No notifications',
    'settings.language': 'Language', 'settings.changeLanguage': 'Change Language',
    'support.title': 'Customer Support', 'support.howCanWeHelp': 'How can we help you?', 'support.channels': 'Contact Channels',
    // Merchant panel
    'merchant.home': 'Home', 'merchant.orders': 'Orders', 'merchant.products': 'Products',
    'merchant.live': 'Live Store', 'merchant.more': 'More', 'merchant.dashboard': 'Merchant Dashboard',
    'merchant.services': 'Services', 'merchant.competitions': 'Contests', 'merchant.social': 'Social Media',
    'merchant.overview': 'Overview', 'merchant.store': 'Store', 'merchant.maintenance': 'Maintenance',
    'merchant.newOrder': 'New', 'merchant.processing': 'Processing', 'merchant.ready': 'Ready',
    'merchant.completed': 'Completed', 'merchant.all': 'All', 'merchant.active': 'Active', 'merchant.ended': 'Ended',
    'merchant.acceptPrepare': 'Accept & Prepare', 'merchant.cancelOrder': 'Cancel', 'merchant.delivery': 'Delivery',
    'merchant.pickupBranch': 'Pickup from branch', 'merchant.delivered': 'Delivered',
    'merchant.available': 'Available', 'merchant.featured': 'Featured', 'merchant.searchProduct': 'Search products...',
    'merchant.needsReply': 'Needs Reply', 'merchant.topEngagement': 'Top Engagement',
    'merchant.livePreviewMode': 'Live Preview Mode', 'merchant.storeView': 'Merchant view — pixel-match to customer experience',
    'merchant.account': 'Account', 'merchant.dayMode': 'Day Mode', 'merchant.nightMode': 'Night Mode',
    'merchant.tapToToggle': 'Tap to toggle Day/Night mode',
    // Analytics tabs
    'a.overview': 'Overview', 'a.visitors': 'Visitors', 'a.buyers': 'Buyers',
    'a.bookings': 'Bookings', 'a.participants': 'Participants', 'a.shares': 'Shares',
    'a.reviews': 'Reviews', 'a.compare': 'Compare', 'a.returns': 'Returns',
    'a.complaints': 'Complaints', 'a.winners': 'Winners', 'a.videos': 'Videos',
    // Translate
    't.translate': 'Translate', 't.translated': 'Translated', 't.showOriginal': 'Show original',
    't.translating': 'Translating...',
    // ─── Merchant Home Screen (mh.*) ───
    'mh.hello': 'Hello 👋', 'mh.merchantFallback': 'Merchant',
    'mh.dashboardTitle': 'Zenrex Store Dashboard',
    'mh.todaySales': "Today's total sales", 'mh.totalPrefix': 'Total',
    'mh.attCheckedIn': '🟢 You are checked in', 'mh.attCheckIn': 'Check in',
    'mh.attSinceMinutes': 'Since {n} min — tap to check out',
    'mh.attTapToStart': 'Tap to start your workday',
    'mh.attSuccessIn': '✅ Check-in recorded',
    'mh.attSuccessOut': '✅ Check-out recorded — {n} min',
    'mh.activeOrders': 'Active orders',
    'mh.products': 'Products', 'mh.customers': 'Customers', 'mh.contests': 'Contests',
    'mh.invAlertTitle': 'Inventory alert', 'mh.invOutOfStock': 'out', 'mh.invLowStock': 'low',
    'mh.quickActions': 'Quick actions',
    'mh.qaAddProduct': 'Add product', 'mh.qaPOS': 'POS', 'mh.qaInventory': 'Inventory',
    'mh.qaInvoices': 'Invoices', 'mh.qaMarketing': 'Marketing', 'mh.qaNewPost': 'New post',
    'mh.qaNewCompetition': 'New contest', 'mh.qaAddBanner': 'Add banner',
    'mh.qaAddEmployee': 'Add employee', 'mh.qaSupportSettings': 'Support settings',
    'mh.recentOrders': 'Recent orders',
    'mh.ordersNeedAttention': '{n} orders need your attention',
    'mh.viewAll': 'View all',
    'mh.noOrders': 'No orders yet',
    'mh.noOrdersDesc': "All new customer orders will appear here",
    'mh.viewProducts': 'View products',
    'mh.customerFallback': 'Customer', 'mh.itemWord': 'item',
    // Order statuses (os.*)
    'os.pending': 'Pending', 'os.processing': 'Processing', 'os.ready': 'Ready',
    'os.out_for_delivery': 'Out for delivery', 'os.delivered': 'Delivered', 'os.cancelled': 'Cancelled',
  },
  ur: {
    'common.home': 'ہوم', 'common.search': 'تلاش', 'common.cart': 'کارٹ', 'common.profile': 'پروفائل',
    'common.settings': 'سیٹنگز', 'common.save': 'محفوظ کریں', 'common.cancel': 'منسوخ', 'common.back': 'واپس',
    'auth.welcome': 'Zenrex Store میں خوش آمدید', 'auth.signin': 'سائن ان', 'auth.signup': 'سائن اپ',
    'auth.phone': 'فون نمبر', 'auth.password': 'پاس ورڈ', 'auth.logout': 'لاگ آؤٹ',
    'tabs.home': 'ہوم', 'tabs.services': 'خدمات', 'tabs.social': 'سوشل', 'tabs.competitions': 'مقابلے', 'tabs.settings': 'سیٹنگز',
    'product.addToCart': 'کارٹ میں شامل کریں', 'product.buyNow': 'ابھی خریدیں',
    'cart.title': 'کارٹ', 'cart.checkout': 'چیک آؤٹ',
    'settings.language': 'زبان', 'support.title': 'کسٹمر سپورٹ',
  },
  fa: {
    'common.home': 'خانه', 'common.search': 'جستجو', 'common.cart': 'سبد', 'common.profile': 'پروفایل',
    'common.settings': 'تنظیمات', 'common.save': 'ذخیره', 'common.cancel': 'لغو', 'common.back': 'بازگشت',
    'common.currency': 'ر.س',
    'auth.welcome': 'به Zenrex Store خوش آمدید', 'auth.signin': 'ورود', 'auth.signup': 'ثبت نام',
    'auth.phone': 'شماره تلفن', 'auth.password': 'رمز عبور', 'auth.logout': 'خروج',
    'tabs.home': 'خانه', 'tabs.services': 'خدمات', 'tabs.social': 'اجتماعی', 'tabs.competitions': 'مسابقات', 'tabs.settings': 'تنظیمات',
    'product.addToCart': 'افزودن به سبد', 'product.buyNow': 'خرید',
    'cart.title': 'سبد', 'cart.checkout': 'پرداخت',
    'settings.language': 'زبان', 'settings.changeLanguage': 'تغییر زبان', 'support.title': 'پشتیبانی',
    // Merchant Home
    'mh.hello': 'سلام 👋', 'mh.merchantFallback': 'فروشنده',
    'mh.dashboardTitle': 'داشبورد Zenrex Store',
    'mh.todaySales': 'کل فروش امروز', 'mh.totalPrefix': 'مجموع',
    'mh.attCheckedIn': '🟢 حضور شما ثبت شد', 'mh.attCheckIn': 'ثبت ورود',
    'mh.attSinceMinutes': '{n} دقیقه پیش — برای خروج بزنید',
    'mh.attTapToStart': 'برای شروع روز کاری بزنید',
    'mh.attSuccessIn': '✅ ورود ثبت شد',
    'mh.attSuccessOut': '✅ خروج ثبت شد — {n} دقیقه',
    'mh.activeOrders': 'سفارش‌های فعال',
    'mh.products': 'محصولات', 'mh.customers': 'مشتریان', 'mh.contests': 'مسابقات',
    'mh.invAlertTitle': 'هشدار موجودی', 'mh.invOutOfStock': 'تمام', 'mh.invLowStock': 'کم',
    'mh.quickActions': 'اقدامات سریع',
    'mh.qaAddProduct': 'افزودن محصول', 'mh.qaPOS': 'POS', 'mh.qaInventory': 'انبار',
    'mh.qaInvoices': 'فاکتورها', 'mh.qaMarketing': 'بازاریابی', 'mh.qaNewPost': 'پست جدید',
    'mh.qaNewCompetition': 'مسابقه جدید', 'mh.qaAddBanner': 'افزودن بنر',
    'mh.qaAddEmployee': 'افزودن کارمند', 'mh.qaSupportSettings': 'تنظیمات پشتیبانی',
    'mh.recentOrders': 'آخرین سفارش‌ها',
    'mh.ordersNeedAttention': '{n} سفارش نیاز به توجه دارد',
    'mh.viewAll': 'مشاهده همه',
    'mh.noOrders': 'هنوز سفارشی نیست',
    'mh.noOrdersDesc': 'همه سفارش‌های جدید مشتریان اینجا نمایش داده می‌شود',
    'mh.viewProducts': 'مشاهده محصولات',
    'mh.customerFallback': 'مشتری', 'mh.itemWord': 'مورد',
    'os.pending': 'در انتظار', 'os.processing': 'در حال پردازش', 'os.ready': 'آماده',
    'os.out_for_delivery': 'در راه', 'os.delivered': 'تحویل شد', 'os.cancelled': 'لغو شد',
  },
  es: {
    'common.home': 'Inicio', 'common.search': 'Buscar', 'common.cart': 'Carrito', 'common.profile': 'Perfil',
    'common.settings': 'Ajustes', 'common.save': 'Guardar', 'common.cancel': 'Cancelar', 'common.back': 'Volver',
    'auth.welcome': 'Bienvenido a Zenrex Store', 'auth.signin': 'Iniciar sesión', 'auth.signup': 'Registrarse',
    'auth.phone': 'Teléfono', 'auth.password': 'Contraseña', 'auth.logout': 'Cerrar sesión',
    'tabs.home': 'Inicio', 'tabs.services': 'Servicios', 'tabs.social': 'Social', 'tabs.competitions': 'Concursos', 'tabs.settings': 'Ajustes',
    'product.addToCart': 'Agregar al carrito', 'product.buyNow': 'Comprar',
    'cart.title': 'Carrito', 'cart.checkout': 'Pagar',
    'settings.language': 'Idioma', 'support.title': 'Atención al cliente',
  },
  fr: {
    'common.home': 'Accueil', 'common.search': 'Rechercher', 'common.cart': 'Panier', 'common.profile': 'Profil',
    'common.settings': 'Paramètres', 'common.save': 'Enregistrer', 'common.cancel': 'Annuler', 'common.back': 'Retour',
    'auth.welcome': 'Bienvenue sur Zenrex Store', 'auth.signin': 'Se connecter', 'auth.signup': "S'inscrire",
    'auth.phone': 'Téléphone', 'auth.password': 'Mot de passe', 'auth.logout': 'Déconnexion',
    'tabs.home': 'Accueil', 'tabs.services': 'Services', 'tabs.social': 'Social', 'tabs.competitions': 'Concours', 'tabs.settings': 'Paramètres',
    'product.addToCart': 'Ajouter au panier', 'product.buyNow': 'Acheter',
    'cart.title': 'Panier', 'cart.checkout': 'Payer',
    'settings.language': 'Langue', 'support.title': 'Support client',
  },
  de: {
    'common.home': 'Startseite', 'common.search': 'Suchen', 'common.cart': 'Warenkorb', 'common.profile': 'Profil',
    'common.settings': 'Einstellungen', 'common.save': 'Speichern', 'common.cancel': 'Abbrechen', 'common.back': 'Zurück',
    'auth.welcome': 'Willkommen bei Zenrex Store', 'auth.signin': 'Anmelden', 'auth.signup': 'Registrieren',
    'auth.phone': 'Telefon', 'auth.password': 'Passwort', 'auth.logout': 'Abmelden',
    'tabs.home': 'Startseite', 'tabs.services': 'Dienste', 'tabs.social': 'Sozial', 'tabs.competitions': 'Wettbewerbe', 'tabs.settings': 'Einstellungen',
    'product.addToCart': 'In den Warenkorb', 'product.buyNow': 'Jetzt kaufen',
    'cart.title': 'Warenkorb', 'cart.checkout': 'Zur Kasse',
    'settings.language': 'Sprache', 'support.title': 'Kundenservice',
  },
  it: {
    'common.home': 'Home', 'common.search': 'Cerca', 'common.cart': 'Carrello', 'common.profile': 'Profilo',
    'common.settings': 'Impostazioni', 'common.save': 'Salva', 'common.cancel': 'Annulla', 'common.back': 'Indietro',
    'auth.welcome': 'Benvenuto in Zenrex Store', 'auth.signin': 'Accedi', 'auth.signup': 'Registrati',
    'auth.phone': 'Telefono', 'auth.password': 'Password', 'auth.logout': 'Esci',
    'tabs.home': 'Home', 'tabs.services': 'Servizi', 'tabs.social': 'Social', 'tabs.competitions': 'Concorsi', 'tabs.settings': 'Impostazioni',
    'product.addToCart': 'Aggiungi al carrello', 'product.buyNow': 'Compra',
    'settings.language': 'Lingua', 'support.title': 'Assistenza clienti',
  },
  pt: {
    'common.home': 'Início', 'common.search': 'Pesquisar', 'common.cart': 'Carrinho', 'common.profile': 'Perfil',
    'common.settings': 'Definições', 'common.save': 'Guardar', 'common.cancel': 'Cancelar', 'common.back': 'Voltar',
    'auth.welcome': 'Bem-vindo ao Zenrex Store', 'auth.signin': 'Entrar', 'auth.signup': 'Registar',
    'auth.phone': 'Telefone', 'auth.password': 'Palavra-passe', 'auth.logout': 'Sair',
    'tabs.home': 'Início', 'tabs.services': 'Serviços', 'tabs.social': 'Social', 'tabs.competitions': 'Concursos', 'tabs.settings': 'Definições',
    'product.addToCart': 'Adicionar ao carrinho', 'product.buyNow': 'Comprar',
    'settings.language': 'Idioma', 'support.title': 'Apoio ao cliente',
  },
  ru: {
    'common.home': 'Главная', 'common.search': 'Поиск', 'common.cart': 'Корзина', 'common.profile': 'Профиль',
    'common.settings': 'Настройки', 'common.save': 'Сохранить', 'common.cancel': 'Отмена', 'common.back': 'Назад',
    'auth.welcome': 'Добро пожаловать в Zenrex Store', 'auth.signin': 'Войти', 'auth.signup': 'Регистрация',
    'auth.phone': 'Телефон', 'auth.password': 'Пароль', 'auth.logout': 'Выйти',
    'tabs.home': 'Главная', 'tabs.services': 'Услуги', 'tabs.social': 'Соц.', 'tabs.competitions': 'Конкурсы', 'tabs.settings': 'Настройки',
    'product.addToCart': 'В корзину', 'product.buyNow': 'Купить',
    'settings.language': 'Язык', 'support.title': 'Поддержка',
  },
  tr: {
    'common.home': 'Ana sayfa', 'common.search': 'Ara', 'common.cart': 'Sepet', 'common.profile': 'Profil',
    'common.settings': 'Ayarlar', 'common.save': 'Kaydet', 'common.cancel': 'İptal', 'common.back': 'Geri',
    'auth.welcome': "Zenrex Store'e hoş geldiniz", 'auth.signin': 'Giriş yap', 'auth.signup': 'Kaydol',
    'auth.phone': 'Telefon', 'auth.password': 'Şifre', 'auth.logout': 'Çıkış',
    'tabs.home': 'Ana sayfa', 'tabs.services': 'Hizmetler', 'tabs.social': 'Sosyal', 'tabs.competitions': 'Yarışmalar', 'tabs.settings': 'Ayarlar',
    'product.addToCart': 'Sepete ekle', 'product.buyNow': 'Şimdi al',
    'settings.language': 'Dil', 'support.title': 'Müşteri desteği',
  },
  zh: {
    'common.home': '主页', 'common.search': '搜索', 'common.cart': '购物车', 'common.profile': '个人资料',
    'common.settings': '设置', 'common.save': '保存', 'common.cancel': '取消', 'common.back': '返回',
    'common.currency': 'SAR',
    'auth.welcome': '欢迎来到 Zenrex Store', 'auth.signin': '登录', 'auth.signup': '注册',
    'auth.phone': '电话', 'auth.password': '密码', 'auth.logout': '退出',
    'tabs.home': '主页', 'tabs.services': '服务', 'tabs.social': '社交', 'tabs.competitions': '竞赛', 'tabs.settings': '设置',
    'product.addToCart': '加入购物车', 'product.buyNow': '立即购买',
    'settings.language': '语言', 'settings.changeLanguage': '更改语言', 'support.title': '客户支持',
    // Merchant Home
    'mh.hello': '您好 👋', 'mh.merchantFallback': '商家',
    'mh.dashboardTitle': 'Zenrex Store 仪表板',
    'mh.todaySales': '今日总销售额', 'mh.totalPrefix': '总计',
    'mh.attCheckedIn': '🟢 您已签到', 'mh.attCheckIn': '签到',
    'mh.attSinceMinutes': '{n} 分钟前 — 点击签退',
    'mh.attTapToStart': '点击开始您的工作日',
    'mh.attSuccessIn': '✅ 签到成功',
    'mh.attSuccessOut': '✅ 签退成功 — {n} 分钟',
    'mh.activeOrders': '活跃订单',
    'mh.products': '产品', 'mh.customers': '客户', 'mh.contests': '比赛',
    'mh.invAlertTitle': '库存警报', 'mh.invOutOfStock': '缺货', 'mh.invLowStock': '库存低',
    'mh.quickActions': '快速操作',
    'mh.qaAddProduct': '添加产品', 'mh.qaPOS': 'POS', 'mh.qaInventory': '库存',
    'mh.qaInvoices': '发票', 'mh.qaMarketing': '营销', 'mh.qaNewPost': '新帖子',
    'mh.qaNewCompetition': '新比赛', 'mh.qaAddBanner': '添加横幅',
    'mh.qaAddEmployee': '添加员工', 'mh.qaSupportSettings': '支持设置',
    'mh.recentOrders': '最近订单',
    'mh.ordersNeedAttention': '{n} 个订单需要处理',
    'mh.viewAll': '查看全部',
    'mh.noOrders': '暂无订单',
    'mh.noOrdersDesc': '所有新的客户订单将显示在此处',
    'mh.viewProducts': '查看产品',
    'mh.customerFallback': '客户', 'mh.itemWord': '件',
    'os.pending': '待处理', 'os.processing': '处理中', 'os.ready': '就绪',
    'os.out_for_delivery': '配送中', 'os.delivered': '已送达', 'os.cancelled': '已取消',
  },
  ja: {
    'common.home': 'ホーム', 'common.search': '検索', 'common.cart': 'カート', 'common.profile': 'プロフィール',
    'common.settings': '設定', 'common.save': '保存', 'common.cancel': 'キャンセル', 'common.back': '戻る',
    'auth.welcome': 'Zenrex Storeへようこそ', 'auth.signin': 'サインイン', 'auth.signup': 'サインアップ',
    'auth.phone': '電話番号', 'auth.password': 'パスワード', 'auth.logout': 'ログアウト',
    'tabs.home': 'ホーム', 'tabs.services': 'サービス', 'tabs.social': 'ソーシャル', 'tabs.competitions': 'コンテスト', 'tabs.settings': '設定',
    'product.addToCart': 'カートに追加', 'product.buyNow': '今すぐ購入',
    'settings.language': '言語', 'support.title': 'カスタマーサポート',
  },
  ko: {
    'common.home': '홈', 'common.search': '검색', 'common.cart': '장바구니', 'common.profile': '프로필',
    'common.settings': '설정', 'common.save': '저장', 'common.cancel': '취소', 'common.back': '뒤로',
    'auth.welcome': 'Zenrex Store에 오신 것을 환영합니다', 'auth.signin': '로그인', 'auth.signup': '가입',
    'auth.phone': '전화번호', 'auth.password': '비밀번호', 'auth.logout': '로그아웃',
    'tabs.home': '홈', 'tabs.services': '서비스', 'tabs.social': '소셜', 'tabs.competitions': '대회', 'tabs.settings': '설정',
    'product.addToCart': '장바구니에 추가', 'product.buyNow': '구매',
    'settings.language': '언어', 'support.title': '고객 지원',
  },
  hi: {
    'common.home': 'होम', 'common.search': 'खोज', 'common.cart': 'कार्ट', 'common.profile': 'प्रोफ़ाइल',
    'common.settings': 'सेटिंग्स', 'common.save': 'सहेजें', 'common.cancel': 'रद्द', 'common.back': 'वापस',
    'common.currency': 'SAR',
    'auth.welcome': 'Zenrex Store में आपका स्वागत है', 'auth.signin': 'साइन इन', 'auth.signup': 'साइन अप',
    'auth.phone': 'फ़ोन', 'auth.password': 'पासवर्ड', 'auth.logout': 'लॉगआउट',
    'tabs.home': 'होम', 'tabs.services': 'सेवाएं', 'tabs.social': 'सोशल', 'tabs.competitions': 'प्रतियोगिता', 'tabs.settings': 'सेटिंग्स',
    'product.addToCart': 'कार्ट में जोड़ें', 'product.buyNow': 'अभी खरीदें',
    'settings.language': 'भाषा', 'settings.changeLanguage': 'भाषा बदलें', 'support.title': 'ग्राहक सहायता',
    // Merchant Home
    'mh.hello': 'नमस्ते 👋', 'mh.merchantFallback': 'व्यापारी',
    'mh.dashboardTitle': 'Zenrex Store डैशबोर्ड',
    'mh.todaySales': 'आज की कुल बिक्री', 'mh.totalPrefix': 'कुल',
    'mh.attCheckedIn': '🟢 आप उपस्थित हैं', 'mh.attCheckIn': 'उपस्थिति दर्ज करें',
    'mh.attSinceMinutes': '{n} मिनट पहले — बाहर निकलने के लिए दबाएं',
    'mh.attTapToStart': 'कार्यदिवस शुरू करने के लिए दबाएं',
    'mh.attSuccessIn': '✅ उपस्थिति दर्ज हुई',
    'mh.attSuccessOut': '✅ बाहर निकल गए — {n} मिनट',
    'mh.activeOrders': 'सक्रिय ऑर्डर',
    'mh.products': 'उत्पाद', 'mh.customers': 'ग्राहक', 'mh.contests': 'प्रतियोगिताएं',
    'mh.invAlertTitle': 'इन्वेंटरी अलर्ट', 'mh.invOutOfStock': 'खत्म', 'mh.invLowStock': 'कम',
    'mh.quickActions': 'त्वरित कार्रवाई',
    'mh.qaAddProduct': 'उत्पाद जोड़ें', 'mh.qaPOS': 'POS', 'mh.qaInventory': 'इन्वेंटरी',
    'mh.qaInvoices': 'चालान', 'mh.qaMarketing': 'मार्केटिंग', 'mh.qaNewPost': 'नई पोस्ट',
    'mh.qaNewCompetition': 'नई प्रतियोगिता', 'mh.qaAddBanner': 'बैनर जोड़ें',
    'mh.qaAddEmployee': 'कर्मचारी जोड़ें', 'mh.qaSupportSettings': 'सपोर्ट सेटिंग्स',
    'mh.recentOrders': 'हाल के ऑर्डर',
    'mh.ordersNeedAttention': '{n} ऑर्डरों पर ध्यान चाहिए',
    'mh.viewAll': 'सब देखें',
    'mh.noOrders': 'अभी कोई ऑर्डर नहीं',
    'mh.noOrdersDesc': 'ग्राहकों के सभी नए ऑर्डर यहां दिखेंगे',
    'mh.viewProducts': 'उत्पाद देखें',
    'mh.customerFallback': 'ग्राहक', 'mh.itemWord': 'आइटम',
    'os.pending': 'लंबित', 'os.processing': 'प्रोसेस हो रहा', 'os.ready': 'तैयार',
    'os.out_for_delivery': 'रास्ते में', 'os.delivered': 'डिलीवर हुआ', 'os.cancelled': 'रद्द',
  },
  bn: {
    'common.home': 'হোম', 'common.search': 'অনুসন্ধান', 'common.cart': 'কার্ট', 'common.profile': 'প্রোফাইল',
    'common.settings': 'সেটিংস', 'common.save': 'সংরক্ষণ', 'common.cancel': 'বাতিল', 'common.back': 'ফিরে যান',
    'auth.welcome': 'Zenrex Store-এ স্বাগতম', 'auth.signin': 'সাইন ইন', 'auth.signup': 'সাইন আপ',
    'auth.phone': 'ফোন', 'auth.password': 'পাসওয়ার্ড', 'auth.logout': 'লগআউট',
    'tabs.home': 'হোম', 'tabs.services': 'পরিষেবা', 'tabs.social': 'সামাজিক', 'tabs.competitions': 'প্রতিযোগিতা', 'tabs.settings': 'সেটিংস',
    'product.addToCart': 'কার্টে যোগ করুন', 'product.buyNow': 'এখন কিনুন',
    'settings.language': 'ভাষা', 'support.title': 'গ্রাহক সহায়তা',
  },
  id: {
    'common.home': 'Beranda', 'common.search': 'Cari', 'common.cart': 'Keranjang', 'common.profile': 'Profil',
    'common.settings': 'Pengaturan', 'common.save': 'Simpan', 'common.cancel': 'Batal', 'common.back': 'Kembali',
    'auth.welcome': 'Selamat datang di Zenrex Store', 'auth.signin': 'Masuk', 'auth.signup': 'Daftar',
    'auth.phone': 'Telepon', 'auth.password': 'Kata sandi', 'auth.logout': 'Keluar',
    'tabs.home': 'Beranda', 'tabs.services': 'Layanan', 'tabs.social': 'Sosial', 'tabs.competitions': 'Kompetisi', 'tabs.settings': 'Pengaturan',
    'product.addToCart': 'Tambah ke keranjang', 'product.buyNow': 'Beli sekarang',
    'settings.language': 'Bahasa', 'support.title': 'Dukungan pelanggan',
  },
  ms: {
    'common.home': 'Laman utama', 'common.search': 'Cari', 'common.cart': 'Troli', 'common.profile': 'Profil',
    'common.settings': 'Tetapan', 'common.save': 'Simpan', 'common.cancel': 'Batal', 'common.back': 'Kembali',
    'auth.welcome': 'Selamat datang ke Zenrex Store', 'auth.signin': 'Log masuk', 'auth.signup': 'Daftar',
    'auth.phone': 'Telefon', 'auth.password': 'Kata laluan', 'auth.logout': 'Log keluar',
    'tabs.home': 'Utama', 'tabs.services': 'Perkhidmatan', 'tabs.social': 'Sosial', 'tabs.competitions': 'Pertandingan', 'tabs.settings': 'Tetapan',
    'product.addToCart': 'Tambah ke troli', 'product.buyNow': 'Beli sekarang',
    'settings.language': 'Bahasa', 'support.title': 'Sokongan pelanggan',
  },
  th: {
    'common.home': 'หน้าแรก', 'common.search': 'ค้นหา', 'common.cart': 'ตะกร้า', 'common.profile': 'โปรไฟล์',
    'common.settings': 'ตั้งค่า', 'common.save': 'บันทึก', 'common.cancel': 'ยกเลิก', 'common.back': 'กลับ',
    'auth.welcome': 'ยินดีต้อนรับสู่ Zenrex Store', 'auth.signin': 'เข้าสู่ระบบ', 'auth.signup': 'สมัคร',
    'auth.phone': 'โทรศัพท์', 'auth.password': 'รหัสผ่าน', 'auth.logout': 'ออกจากระบบ',
    'tabs.home': 'หน้าแรก', 'tabs.services': 'บริการ', 'tabs.social': 'โซเชียล', 'tabs.competitions': 'การแข่งขัน', 'tabs.settings': 'ตั้งค่า',
    'product.addToCart': 'เพิ่มลงตะกร้า', 'product.buyNow': 'ซื้อเลย',
    'settings.language': 'ภาษา', 'support.title': 'ฝ่ายสนับสนุนลูกค้า',
  },
};

type Ctx = {
  lang: Lang;
  t: (key: string, fallbackOrVars?: string | Record<string, string | number>, vars?: Record<string, string | number>) => string;
  setLang: (l: Lang) => Promise<void>;
  isRTL: boolean;
  languages: typeof LANGUAGES;
};

const I18nContext = createContext<Ctx>({ lang: 'ar', t: (k, f) => (typeof f === 'string' ? f : k), setLang: async () => {}, isRTL: true, languages: LANGUAGES });

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? String(vars[k]) : `{${k}}`));
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>('ar');

  useEffect(() => {
    (async () => {
      const saved = await AsyncStorage.getItem('app_lang');
      if (saved && (T as any)[saved]) {
        setLangState(saved as Lang);
      } else {
        const detected = detectDeviceLang();
        setLangState(detected);
        await AsyncStorage.setItem('app_lang', detected);
      }
    })();
  }, []);

  const t = useCallback((key: string, fallbackOrVars?: string | Record<string, string | number>, vars?: Record<string, string | number>) => {
    let fallback: string | undefined;
    let interp: Record<string, string | number> | undefined;
    if (typeof fallbackOrVars === 'string') {
      fallback = fallbackOrVars;
      interp = vars;
    } else if (fallbackOrVars && typeof fallbackOrVars === 'object') {
      interp = fallbackOrVars;
    }
    const raw = T[lang]?.[key] || T['en']?.[key] || T['ar']?.[key] || fallback || key;
    return interpolate(raw, interp);
  }, [lang]);

  const setLang = useCallback(async (l: Lang) => {
    const previousRTL = RTL_LANGS.includes(lang);
    const wantRTL = RTL_LANGS.includes(l);
    setLangState(l);
    await AsyncStorage.setItem('app_lang', l);
    if (Platform.OS !== 'web') {
      if (I18nManager.isRTL !== wantRTL) {
        I18nManager.allowRTL(wantRTL);
        I18nManager.forceRTL(wantRTL);
        // RTL flip requires an app reload to fully apply layout mirroring.
        // Prompt user to restart. On dev builds we can use DevSettings.reload().
        if (previousRTL !== wantRTL) {
          const { Alert } = require('react-native');
          const isAr = l === 'ar';
          Alert.alert(
            isAr ? 'إعادة تشغيل التطبيق' : 'Restart Required',
            isAr
              ? 'لتفعيل اللغة والاتجاه بشكل كامل، أعد تشغيل التطبيق (اغلقه ثم افتحه من جديد).'
              : 'To apply the language direction fully, please restart the app (close and reopen).',
            [
              { text: isAr ? 'حسناً' : 'OK' },
              {
                text: isAr ? 'إعادة تشغيل الآن' : 'Restart Now',
                onPress: () => {
                  try {
                    const { DevSettings } = require('react-native');
                    if (DevSettings?.reload) DevSettings.reload();
                  } catch {}
                },
              },
            ]
          );
        }
      }
    }
    // Fire global listeners for legacy screens that need immediate re-render
    try {
      const arr = (global as any).__zenrex_lang_listeners || [];
      arr.forEach((fn: any) => { try { fn(); } catch {} });
    } catch {}
  }, [lang]);

  return (
    <I18nContext.Provider value={{ lang, t, setLang, isRTL: RTL_LANGS.includes(lang), languages: LANGUAGES }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useT() {
  return useContext(I18nContext);
}
