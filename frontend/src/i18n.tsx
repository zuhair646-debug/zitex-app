/**
 * Zitex i18n - Arabic & English language support
 * Usage:
 *   import { useT } from '@/src/i18n';
 *   const { t, lang, setLang } = useT();
 *   <Text>{t('common.home')}</Text>
 */
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { I18nManager, Platform } from 'react-native';

type Lang = 'ar' | 'en';

const DICT: Record<Lang, Record<string, string>> = {
  ar: {
    // Common
    'common.home': 'الرئيسية',
    'common.search': 'بحث',
    'common.cart': 'السلة',
    'common.profile': 'الملف الشخصي',
    'common.settings': 'الإعدادات',
    'common.save': 'حفظ',
    'common.cancel': 'إلغاء',
    'common.delete': 'حذف',
    'common.edit': 'تعديل',
    'common.confirm': 'تأكيد',
    'common.back': 'رجوع',
    'common.loading': 'جارٍ التحميل...',
    'common.error': 'خطأ',
    'common.success': 'تم بنجاح',
    'common.required': 'مطلوب',
    'common.optional': 'اختياري',
    'common.yes': 'نعم',
    'common.no': 'لا',
    'common.currency': 'ر.س',

    // Auth
    'auth.welcome': 'أهلاً بك في Zitex',
    'auth.subtitle': 'سجّل دخولك للمتابعة',
    'auth.phone': 'رقم الجوال',
    'auth.password': 'كلمة المرور',
    'auth.signin': 'تسجيل الدخول',
    'auth.signup': 'إنشاء حساب',
    'auth.forgot': 'نسيت كلمة المرور؟',
    'auth.noAccount': 'ليس لديك حساب؟',
    'auth.haveAccount': 'لديك حساب بالفعل؟',
    'auth.invalidCredentials': 'رقم الجوال أو كلمة المرور غير صحيحة',
    'auth.networkError': 'تعذر الاتصال بالخادم - تحقق من الإنترنت',
    'auth.logout': 'تسجيل الخروج',
    'auth.name': 'الاسم الكامل',
    'auth.fillAllFields': 'يرجى ملء جميع الحقول',

    // Tabs
    'tabs.home': 'الرئيسية',
    'tabs.services': 'الخدمات',
    'tabs.social': 'السوشال',
    'tabs.competitions': 'المسابقات',
    'tabs.settings': 'الإعدادات',

    // Products
    'product.addToCart': 'أضف إلى السلة',
    'product.buyNow': 'اشترِ الآن',
    'product.inStock': 'متوفر في المخزون',
    'product.outOfStock': 'غير متوفر',
    'product.condition.new': 'جديد (New)',
    'product.condition.used': 'مستعمل (Used)',
    'product.condition.used3': 'مستعمل - 3 أشهر',
    'product.condition.used6': 'مستعمل - 6 أشهر',
    'product.warranty': 'ضمان',
    'product.warrantyDays': 'يوم',
    'product.noWarranty': 'بدون ضمان',
    'product.shipping': 'طرق التوصيل المتاحة',
    'product.shippingSameDay': 'توصيل نفس اليوم (90 دقيقة)',
    'product.shippingScheduled': 'توصيل مجدول (اختر الوقت المناسب)',
    'product.shippingStandard': 'توصيل عادي (2-3 أيام)',
    'product.payment': 'وسائل الدفع المتاحة',
    'product.paymentCod': 'الدفع عند الاستلام',
    'product.paymentCard': 'بطاقة',
    'product.paymentApplePay': 'Apple Pay',
    'product.paymentTamara': 'تمارا',
    'product.paymentSoon': 'قريباً',
    'product.description': 'الوصف',
    'product.specs': 'المواصفات',

    // Cart & Checkout
    'cart.title': 'السلة',
    'cart.empty': 'السلة فارغة',
    'cart.subtotal': 'المجموع الفرعي',
    'cart.tax': 'الضريبة (15٪)',
    'cart.delivery': 'التوصيل',
    'cart.total': 'المجموع',
    'cart.checkout': 'إتمام الطلب',
    'checkout.title': 'إتمام الطلب',
    'checkout.address': 'عنوان التوصيل',
    'checkout.addAddress': 'إضافة عنوان',
    'checkout.deliveryType': 'نوع التوصيل',
    'checkout.payment': 'طريقة الدفع',
    'checkout.coupon': 'كود الخصم',
    'checkout.apply': 'تطبيق',
    'checkout.notes': 'ملاحظات للطلب (اختياري)',
    'checkout.summary': 'ملخص الطلب',
    'checkout.placeOrder': 'اشترِ الآن',
    'checkout.orderSuccess': 'تم الطلب!',
    'checkout.trackOrder': 'تتبع',
    'checkout.myOrders': 'طلباتي',
    'checkout.pickSlot': 'اختر الفترة',

    // Social
    'social.title': 'السوشال',
    'social.like': 'إعجاب',
    'social.comment': 'تعليق',
    'social.share': 'مشاركة',
    'social.bookmark': 'حفظ',
    'social.reply': 'الرد',
    'social.merchantTag': 'التاجر',
    'social.noPosts': 'لا توجد منشورات',
    'social.noStories': 'لا حالات',
    'social.writeComment': 'اكتب تعليقاً...',
    'social.send': 'إرسال',
    'social.types.post': 'منشور',
    'social.types.story': 'حالة',
    'social.types.poll': 'استطلاع',
    'social.types.question': 'سؤال',
    'social.types.event': 'فعالية',
    'social.totalVotes': 'صوت',

    // Competitions
    'comp.title': 'المسابقات',
    'comp.join': 'انضم للمسابقة',
    'comp.joined': 'مشارك',
    'comp.prize': 'الجائزة',
    'comp.daysLeft': 'يوم متبقي',
    'comp.alreadyJoined': 'مشارك بالفعل',
    'comp.permit': 'رقم التصريح',
    'comp.draw': 'موعد السحب',

    // Orders
    'orders.title': 'طلباتي',
    'orders.status.pending': 'قيد الانتظار',
    'orders.status.processing': 'قيد التحضير',
    'orders.status.ready': 'جاهز للاستلام',
    'orders.status.assigned': 'تم تعيين سائق',
    'orders.status.shipped': 'تم الشحن',
    'orders.status.picked': 'في الطريق',
    'orders.status.delivered': 'تم التوصيل',
    'orders.status.cancelled': 'ملغى',
    'orders.track': 'تتبع الطلب',
    'orders.driver': 'السائق',
    'orders.eta': 'الوصول المتوقع',
    'orders.minutes': 'دقيقة',

    // Loyalty Points
    'points.title': 'نقاط الولاء',
    'points.balance': 'رصيد النقاط',
    'points.tier.bronze': 'برونزي',
    'points.tier.silver': 'فضي',
    'points.tier.gold': 'ذهبي',
    'points.nextTier': 'للوصول للمستوى التالي',
    'points.redeem': 'استبدال نقاط',
    'points.history': 'سجل النقاط',
    'points.earnRate': '1 نقطة لكل 10 ر.س',
    'points.value': 'القيمة',

    // Group Buy
    'gb.title': 'التسوق الجماعي',
    'gb.subtitle': 'انضم لمجموعة واحصل على خصم',
    'gb.join': 'انضم للمجموعة',
    'gb.joined': 'انضممت',
    'gb.participants': 'مشارك',
    'gb.minToActivate': 'الحد الأدنى للتفعيل',
    'gb.groupPrice': 'سعر المجموعة',
    'gb.normalPrice': 'السعر العادي',
    'gb.save': 'وفّر',
    'gb.ends': 'ينتهي',
    'gb.empty': 'لا يوجد عروض جماعية نشطة',
    'gb.activated': '🎉 تم تفعيل العرض الجماعي!',

    // Notifications
    'notif.title': 'الإشعارات',
    'notif.empty': 'لا توجد إشعارات',
    'notif.markAllRead': 'تحديد الكل كمقروء',

    // Settings
    'settings.language': 'اللغة',
    'settings.arabic': 'العربية',
    'settings.english': 'English',
    'settings.darkMode': 'الوضع الليلي',
    'settings.notifications': 'الإشعارات',
    'settings.about': 'عن التطبيق',
    'settings.version': 'الإصدار',
    'settings.changeLanguage': 'تغيير اللغة',
  },
  en: {
    'common.home': 'Home',
    'common.search': 'Search',
    'common.cart': 'Cart',
    'common.profile': 'Profile',
    'common.settings': 'Settings',
    'common.save': 'Save',
    'common.cancel': 'Cancel',
    'common.delete': 'Delete',
    'common.edit': 'Edit',
    'common.confirm': 'Confirm',
    'common.back': 'Back',
    'common.loading': 'Loading...',
    'common.error': 'Error',
    'common.success': 'Success',
    'common.required': 'Required',
    'common.optional': 'Optional',
    'common.yes': 'Yes',
    'common.no': 'No',
    'common.currency': 'SAR',

    'auth.welcome': 'Welcome to Zitex',
    'auth.subtitle': 'Sign in to continue',
    'auth.phone': 'Phone number',
    'auth.password': 'Password',
    'auth.signin': 'Sign in',
    'auth.signup': 'Sign up',
    'auth.forgot': 'Forgot password?',
    'auth.noAccount': "Don't have an account?",
    'auth.haveAccount': 'Already have an account?',
    'auth.invalidCredentials': 'Invalid phone or password',
    'auth.networkError': 'Connection failed - check your internet',
    'auth.logout': 'Logout',
    'auth.name': 'Full Name',
    'auth.fillAllFields': 'Please fill all fields',

    'tabs.home': 'Home',
    'tabs.services': 'Services',
    'tabs.social': 'Social',
    'tabs.competitions': 'Competitions',
    'tabs.settings': 'Settings',

    'product.addToCart': 'Add to Cart',
    'product.buyNow': 'Buy Now',
    'product.inStock': 'In Stock',
    'product.outOfStock': 'Out of Stock',
    'product.condition.new': 'New',
    'product.condition.used': 'Used',
    'product.condition.used3': 'Used - 3 months',
    'product.condition.used6': 'Used - 6 months',
    'product.warranty': 'Warranty',
    'product.warrantyDays': 'days',
    'product.noWarranty': 'No warranty',
    'product.shipping': 'Available Shipping Methods',
    'product.shippingSameDay': 'Same-day delivery (90 min)',
    'product.shippingScheduled': 'Scheduled delivery (pick your time)',
    'product.shippingStandard': 'Standard delivery (2-3 days)',
    'product.payment': 'Available Payment Methods',
    'product.paymentCod': 'Cash on delivery',
    'product.paymentCard': 'Card',
    'product.paymentApplePay': 'Apple Pay',
    'product.paymentTamara': 'Tamara',
    'product.paymentSoon': 'Soon',
    'product.description': 'Description',
    'product.specs': 'Specifications',

    'cart.title': 'Cart',
    'cart.empty': 'Cart is empty',
    'cart.subtotal': 'Subtotal',
    'cart.tax': 'Tax (15%)',
    'cart.delivery': 'Delivery',
    'cart.total': 'Total',
    'cart.checkout': 'Checkout',
    'checkout.title': 'Checkout',
    'checkout.address': 'Delivery Address',
    'checkout.addAddress': 'Add Address',
    'checkout.deliveryType': 'Delivery Type',
    'checkout.payment': 'Payment Method',
    'checkout.coupon': 'Coupon Code',
    'checkout.apply': 'Apply',
    'checkout.notes': 'Order notes (optional)',
    'checkout.summary': 'Order Summary',
    'checkout.placeOrder': 'Place Order',
    'checkout.orderSuccess': 'Order Placed!',
    'checkout.trackOrder': 'Track',
    'checkout.myOrders': 'My Orders',
    'checkout.pickSlot': 'Pick a slot',

    'social.title': 'Social',
    'social.like': 'Like',
    'social.comment': 'Comment',
    'social.share': 'Share',
    'social.bookmark': 'Save',
    'social.reply': 'Reply',
    'social.merchantTag': 'Merchant',
    'social.noPosts': 'No posts yet',
    'social.noStories': 'No stories',
    'social.writeComment': 'Write a comment...',
    'social.send': 'Send',
    'social.types.post': 'Post',
    'social.types.story': 'Story',
    'social.types.poll': 'Poll',
    'social.types.question': 'Question',
    'social.types.event': 'Event',
    'social.totalVotes': 'votes',

    'comp.title': 'Competitions',
    'comp.join': 'Join Competition',
    'comp.joined': 'participants',
    'comp.prize': 'Prize',
    'comp.daysLeft': 'days left',
    'comp.alreadyJoined': 'Already joined',
    'comp.permit': 'Permit #',
    'comp.draw': 'Draw Date',

    'orders.title': 'My Orders',
    'orders.status.pending': 'Pending',
    'orders.status.processing': 'Processing',
    'orders.status.ready': 'Ready for pickup',
    'orders.status.assigned': 'Driver assigned',
    'orders.status.shipped': 'Shipped',
    'orders.status.picked': 'On the way',
    'orders.status.delivered': 'Delivered',
    'orders.status.cancelled': 'Cancelled',
    'orders.track': 'Track Order',
    'orders.driver': 'Driver',
    'orders.eta': 'ETA',
    'orders.minutes': 'minutes',

    'points.title': 'Loyalty Points',
    'points.balance': 'Points Balance',
    'points.tier.bronze': 'Bronze',
    'points.tier.silver': 'Silver',
    'points.tier.gold': 'Gold',
    'points.nextTier': 'to next tier',
    'points.redeem': 'Redeem Points',
    'points.history': 'Points History',
    'points.earnRate': '1 point per 10 SAR',
    'points.value': 'Value',

    'gb.title': 'Group Buy',
    'gb.subtitle': 'Join a group to unlock the discount',
    'gb.join': 'Join Group',
    'gb.joined': 'Joined',
    'gb.participants': 'participants',
    'gb.minToActivate': 'Minimum to activate',
    'gb.groupPrice': 'Group Price',
    'gb.normalPrice': 'Normal Price',
    'gb.save': 'Save',
    'gb.ends': 'Ends',
    'gb.empty': 'No active group buys',
    'gb.activated': '🎉 Group buy activated!',

    'notif.title': 'Notifications',
    'notif.empty': 'No notifications',
    'notif.markAllRead': 'Mark all as read',

    'settings.language': 'Language',
    'settings.arabic': 'العربية',
    'settings.english': 'English',
    'settings.darkMode': 'Dark Mode',
    'settings.notifications': 'Notifications',
    'settings.about': 'About',
    'settings.version': 'Version',
    'settings.changeLanguage': 'Change Language',
  },
};

type Ctx = {
  lang: Lang;
  t: (key: string, fallback?: string) => string;
  setLang: (l: Lang) => Promise<void>;
  isRTL: boolean;
};

const I18nContext = createContext<Ctx>({
  lang: 'ar',
  t: (k, f) => f || k,
  setLang: async () => {},
  isRTL: true,
});

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>('ar');

  useEffect(() => {
    AsyncStorage.getItem('app_lang').then((v) => {
      if (v === 'ar' || v === 'en') setLangState(v);
    });
  }, []);

  const t = useCallback((key: string, fallback?: string) => {
    return DICT[lang]?.[key] || DICT['ar']?.[key] || fallback || key;
  }, [lang]);

  const setLang = useCallback(async (l: Lang) => {
    setLangState(l);
    await AsyncStorage.setItem('app_lang', l);
    // RTL switch
    if (Platform.OS !== 'web') {
      const wantRTL = l === 'ar';
      if (I18nManager.isRTL !== wantRTL) {
        I18nManager.allowRTL(wantRTL);
        I18nManager.forceRTL(wantRTL);
        // App reload required to apply RTL — user must restart manually
      }
    }
  }, []);

  const isRTL = lang === 'ar';

  return (
    <I18nContext.Provider value={{ lang, t, setLang, isRTL }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useT() {
  return useContext(I18nContext);
}
