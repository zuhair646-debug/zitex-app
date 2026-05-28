/**
 * Zitex i18n — Global Multilingual Support (20 languages)
 * Languages: AR, EN, UR, FA, HE (RTL) + ES, FR, DE, IT, PT, RU, TR, ZH, JA, KO, HI, BN, ID, MS, TH
 * Auto-detects from device locale on first launch.
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
  { code: 'he', name: 'Hebrew',     nativeName: 'עברית',     flag: '🇮🇱' },
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
    'auth.welcome': 'أهلاً بك في Zitex', 'auth.subtitle': 'سجّل دخولك للمتابعة',
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
  },
  en: {
    'common.home': 'Home', 'common.search': 'Search', 'common.cart': 'Cart', 'common.profile': 'Profile',
    'common.settings': 'Settings', 'common.save': 'Save', 'common.cancel': 'Cancel', 'common.delete': 'Delete',
    'common.edit': 'Edit', 'common.confirm': 'Confirm', 'common.back': 'Back', 'common.loading': 'Loading...',
    'common.error': 'Error', 'common.success': 'Success', 'common.yes': 'Yes', 'common.no': 'No', 'common.currency': 'SAR',
    'auth.welcome': 'Welcome to Zitex', 'auth.subtitle': 'Sign in to continue',
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
  },
  ur: {
    'common.home': 'ہوم', 'common.search': 'تلاش', 'common.cart': 'کارٹ', 'common.profile': 'پروفائل',
    'common.settings': 'سیٹنگز', 'common.save': 'محفوظ کریں', 'common.cancel': 'منسوخ', 'common.back': 'واپس',
    'auth.welcome': 'Zitex میں خوش آمدید', 'auth.signin': 'سائن ان', 'auth.signup': 'سائن اپ',
    'auth.phone': 'فون نمبر', 'auth.password': 'پاس ورڈ', 'auth.logout': 'لاگ آؤٹ',
    'tabs.home': 'ہوم', 'tabs.services': 'خدمات', 'tabs.social': 'سوشل', 'tabs.competitions': 'مقابلے', 'tabs.settings': 'سیٹنگز',
    'product.addToCart': 'کارٹ میں شامل کریں', 'product.buyNow': 'ابھی خریدیں',
    'cart.title': 'کارٹ', 'cart.checkout': 'چیک آؤٹ',
    'settings.language': 'زبان', 'support.title': 'کسٹمر سپورٹ',
  },
  fa: {
    'common.home': 'خانه', 'common.search': 'جستجو', 'common.cart': 'سبد', 'common.profile': 'پروفایل',
    'common.settings': 'تنظیمات', 'common.save': 'ذخیره', 'common.cancel': 'لغو', 'common.back': 'بازگشت',
    'auth.welcome': 'به Zitex خوش آمدید', 'auth.signin': 'ورود', 'auth.signup': 'ثبت نام',
    'auth.phone': 'شماره تلفن', 'auth.password': 'رمز عبور', 'auth.logout': 'خروج',
    'tabs.home': 'خانه', 'tabs.services': 'خدمات', 'tabs.social': 'اجتماعی', 'tabs.competitions': 'مسابقات', 'tabs.settings': 'تنظیمات',
    'product.addToCart': 'افزودن به سبد', 'product.buyNow': 'خرید',
    'cart.title': 'سبد', 'cart.checkout': 'پرداخت',
    'settings.language': 'زبان', 'support.title': 'پشتیبانی',
  },
  he: {
    'common.home': 'בית', 'common.search': 'חיפוש', 'common.cart': 'עגלה', 'common.profile': 'פרופיל',
    'common.settings': 'הגדרות', 'common.save': 'שמור', 'common.cancel': 'בטל', 'common.back': 'חזור',
    'auth.welcome': 'ברוכים הבאים ל-Zitex', 'auth.signin': 'התחבר', 'auth.signup': 'הירשם',
    'auth.phone': 'מספר טלפון', 'auth.password': 'סיסמה', 'auth.logout': 'התנתק',
    'tabs.home': 'בית', 'tabs.services': 'שירותים', 'tabs.social': 'חברתי', 'tabs.competitions': 'תחרויות', 'tabs.settings': 'הגדרות',
    'product.addToCart': 'הוסף לעגלה', 'product.buyNow': 'קנה',
    'settings.language': 'שפה', 'support.title': 'תמיכת לקוחות',
  },
  es: {
    'common.home': 'Inicio', 'common.search': 'Buscar', 'common.cart': 'Carrito', 'common.profile': 'Perfil',
    'common.settings': 'Ajustes', 'common.save': 'Guardar', 'common.cancel': 'Cancelar', 'common.back': 'Volver',
    'auth.welcome': 'Bienvenido a Zitex', 'auth.signin': 'Iniciar sesión', 'auth.signup': 'Registrarse',
    'auth.phone': 'Teléfono', 'auth.password': 'Contraseña', 'auth.logout': 'Cerrar sesión',
    'tabs.home': 'Inicio', 'tabs.services': 'Servicios', 'tabs.social': 'Social', 'tabs.competitions': 'Concursos', 'tabs.settings': 'Ajustes',
    'product.addToCart': 'Agregar al carrito', 'product.buyNow': 'Comprar',
    'cart.title': 'Carrito', 'cart.checkout': 'Pagar',
    'settings.language': 'Idioma', 'support.title': 'Atención al cliente',
  },
  fr: {
    'common.home': 'Accueil', 'common.search': 'Rechercher', 'common.cart': 'Panier', 'common.profile': 'Profil',
    'common.settings': 'Paramètres', 'common.save': 'Enregistrer', 'common.cancel': 'Annuler', 'common.back': 'Retour',
    'auth.welcome': 'Bienvenue sur Zitex', 'auth.signin': 'Se connecter', 'auth.signup': "S'inscrire",
    'auth.phone': 'Téléphone', 'auth.password': 'Mot de passe', 'auth.logout': 'Déconnexion',
    'tabs.home': 'Accueil', 'tabs.services': 'Services', 'tabs.social': 'Social', 'tabs.competitions': 'Concours', 'tabs.settings': 'Paramètres',
    'product.addToCart': 'Ajouter au panier', 'product.buyNow': 'Acheter',
    'cart.title': 'Panier', 'cart.checkout': 'Payer',
    'settings.language': 'Langue', 'support.title': 'Support client',
  },
  de: {
    'common.home': 'Startseite', 'common.search': 'Suchen', 'common.cart': 'Warenkorb', 'common.profile': 'Profil',
    'common.settings': 'Einstellungen', 'common.save': 'Speichern', 'common.cancel': 'Abbrechen', 'common.back': 'Zurück',
    'auth.welcome': 'Willkommen bei Zitex', 'auth.signin': 'Anmelden', 'auth.signup': 'Registrieren',
    'auth.phone': 'Telefon', 'auth.password': 'Passwort', 'auth.logout': 'Abmelden',
    'tabs.home': 'Startseite', 'tabs.services': 'Dienste', 'tabs.social': 'Sozial', 'tabs.competitions': 'Wettbewerbe', 'tabs.settings': 'Einstellungen',
    'product.addToCart': 'In den Warenkorb', 'product.buyNow': 'Jetzt kaufen',
    'cart.title': 'Warenkorb', 'cart.checkout': 'Zur Kasse',
    'settings.language': 'Sprache', 'support.title': 'Kundenservice',
  },
  it: {
    'common.home': 'Home', 'common.search': 'Cerca', 'common.cart': 'Carrello', 'common.profile': 'Profilo',
    'common.settings': 'Impostazioni', 'common.save': 'Salva', 'common.cancel': 'Annulla', 'common.back': 'Indietro',
    'auth.welcome': 'Benvenuto in Zitex', 'auth.signin': 'Accedi', 'auth.signup': 'Registrati',
    'auth.phone': 'Telefono', 'auth.password': 'Password', 'auth.logout': 'Esci',
    'tabs.home': 'Home', 'tabs.services': 'Servizi', 'tabs.social': 'Social', 'tabs.competitions': 'Concorsi', 'tabs.settings': 'Impostazioni',
    'product.addToCart': 'Aggiungi al carrello', 'product.buyNow': 'Compra',
    'settings.language': 'Lingua', 'support.title': 'Assistenza clienti',
  },
  pt: {
    'common.home': 'Início', 'common.search': 'Pesquisar', 'common.cart': 'Carrinho', 'common.profile': 'Perfil',
    'common.settings': 'Definições', 'common.save': 'Guardar', 'common.cancel': 'Cancelar', 'common.back': 'Voltar',
    'auth.welcome': 'Bem-vindo ao Zitex', 'auth.signin': 'Entrar', 'auth.signup': 'Registar',
    'auth.phone': 'Telefone', 'auth.password': 'Palavra-passe', 'auth.logout': 'Sair',
    'tabs.home': 'Início', 'tabs.services': 'Serviços', 'tabs.social': 'Social', 'tabs.competitions': 'Concursos', 'tabs.settings': 'Definições',
    'product.addToCart': 'Adicionar ao carrinho', 'product.buyNow': 'Comprar',
    'settings.language': 'Idioma', 'support.title': 'Apoio ao cliente',
  },
  ru: {
    'common.home': 'Главная', 'common.search': 'Поиск', 'common.cart': 'Корзина', 'common.profile': 'Профиль',
    'common.settings': 'Настройки', 'common.save': 'Сохранить', 'common.cancel': 'Отмена', 'common.back': 'Назад',
    'auth.welcome': 'Добро пожаловать в Zitex', 'auth.signin': 'Войти', 'auth.signup': 'Регистрация',
    'auth.phone': 'Телефон', 'auth.password': 'Пароль', 'auth.logout': 'Выйти',
    'tabs.home': 'Главная', 'tabs.services': 'Услуги', 'tabs.social': 'Соц.', 'tabs.competitions': 'Конкурсы', 'tabs.settings': 'Настройки',
    'product.addToCart': 'В корзину', 'product.buyNow': 'Купить',
    'settings.language': 'Язык', 'support.title': 'Поддержка',
  },
  tr: {
    'common.home': 'Ana sayfa', 'common.search': 'Ara', 'common.cart': 'Sepet', 'common.profile': 'Profil',
    'common.settings': 'Ayarlar', 'common.save': 'Kaydet', 'common.cancel': 'İptal', 'common.back': 'Geri',
    'auth.welcome': "Zitex'e hoş geldiniz", 'auth.signin': 'Giriş yap', 'auth.signup': 'Kaydol',
    'auth.phone': 'Telefon', 'auth.password': 'Şifre', 'auth.logout': 'Çıkış',
    'tabs.home': 'Ana sayfa', 'tabs.services': 'Hizmetler', 'tabs.social': 'Sosyal', 'tabs.competitions': 'Yarışmalar', 'tabs.settings': 'Ayarlar',
    'product.addToCart': 'Sepete ekle', 'product.buyNow': 'Şimdi al',
    'settings.language': 'Dil', 'support.title': 'Müşteri desteği',
  },
  zh: {
    'common.home': '主页', 'common.search': '搜索', 'common.cart': '购物车', 'common.profile': '个人资料',
    'common.settings': '设置', 'common.save': '保存', 'common.cancel': '取消', 'common.back': '返回',
    'auth.welcome': '欢迎来到 Zitex', 'auth.signin': '登录', 'auth.signup': '注册',
    'auth.phone': '电话', 'auth.password': '密码', 'auth.logout': '退出',
    'tabs.home': '主页', 'tabs.services': '服务', 'tabs.social': '社交', 'tabs.competitions': '竞赛', 'tabs.settings': '设置',
    'product.addToCart': '加入购物车', 'product.buyNow': '立即购买',
    'settings.language': '语言', 'support.title': '客户支持',
  },
  ja: {
    'common.home': 'ホーム', 'common.search': '検索', 'common.cart': 'カート', 'common.profile': 'プロフィール',
    'common.settings': '設定', 'common.save': '保存', 'common.cancel': 'キャンセル', 'common.back': '戻る',
    'auth.welcome': 'Zitexへようこそ', 'auth.signin': 'サインイン', 'auth.signup': 'サインアップ',
    'auth.phone': '電話番号', 'auth.password': 'パスワード', 'auth.logout': 'ログアウト',
    'tabs.home': 'ホーム', 'tabs.services': 'サービス', 'tabs.social': 'ソーシャル', 'tabs.competitions': 'コンテスト', 'tabs.settings': '設定',
    'product.addToCart': 'カートに追加', 'product.buyNow': '今すぐ購入',
    'settings.language': '言語', 'support.title': 'カスタマーサポート',
  },
  ko: {
    'common.home': '홈', 'common.search': '검색', 'common.cart': '장바구니', 'common.profile': '프로필',
    'common.settings': '설정', 'common.save': '저장', 'common.cancel': '취소', 'common.back': '뒤로',
    'auth.welcome': 'Zitex에 오신 것을 환영합니다', 'auth.signin': '로그인', 'auth.signup': '가입',
    'auth.phone': '전화번호', 'auth.password': '비밀번호', 'auth.logout': '로그아웃',
    'tabs.home': '홈', 'tabs.services': '서비스', 'tabs.social': '소셜', 'tabs.competitions': '대회', 'tabs.settings': '설정',
    'product.addToCart': '장바구니에 추가', 'product.buyNow': '구매',
    'settings.language': '언어', 'support.title': '고객 지원',
  },
  hi: {
    'common.home': 'होम', 'common.search': 'खोज', 'common.cart': 'कार्ट', 'common.profile': 'प्रोफ़ाइल',
    'common.settings': 'सेटिंग्स', 'common.save': 'सहेजें', 'common.cancel': 'रद्द', 'common.back': 'वापस',
    'auth.welcome': 'Zitex में आपका स्वागत है', 'auth.signin': 'साइन इन', 'auth.signup': 'साइन अप',
    'auth.phone': 'फ़ोन', 'auth.password': 'पासवर्ड', 'auth.logout': 'लॉगआउट',
    'tabs.home': 'होम', 'tabs.services': 'सेवाएं', 'tabs.social': 'सोशल', 'tabs.competitions': 'प्रतियोगिता', 'tabs.settings': 'सेटिंग्स',
    'product.addToCart': 'कार्ट में जोड़ें', 'product.buyNow': 'अभी खरीदें',
    'settings.language': 'भाषा', 'support.title': 'ग्राहक सहायता',
  },
  bn: {
    'common.home': 'হোম', 'common.search': 'অনুসন্ধান', 'common.cart': 'কার্ট', 'common.profile': 'প্রোফাইল',
    'common.settings': 'সেটিংস', 'common.save': 'সংরক্ষণ', 'common.cancel': 'বাতিল', 'common.back': 'ফিরে যান',
    'auth.welcome': 'Zitex-এ স্বাগতম', 'auth.signin': 'সাইন ইন', 'auth.signup': 'সাইন আপ',
    'auth.phone': 'ফোন', 'auth.password': 'পাসওয়ার্ড', 'auth.logout': 'লগআউট',
    'tabs.home': 'হোম', 'tabs.services': 'পরিষেবা', 'tabs.social': 'সামাজিক', 'tabs.competitions': 'প্রতিযোগিতা', 'tabs.settings': 'সেটিংস',
    'product.addToCart': 'কার্টে যোগ করুন', 'product.buyNow': 'এখন কিনুন',
    'settings.language': 'ভাষা', 'support.title': 'গ্রাহক সহায়তা',
  },
  id: {
    'common.home': 'Beranda', 'common.search': 'Cari', 'common.cart': 'Keranjang', 'common.profile': 'Profil',
    'common.settings': 'Pengaturan', 'common.save': 'Simpan', 'common.cancel': 'Batal', 'common.back': 'Kembali',
    'auth.welcome': 'Selamat datang di Zitex', 'auth.signin': 'Masuk', 'auth.signup': 'Daftar',
    'auth.phone': 'Telepon', 'auth.password': 'Kata sandi', 'auth.logout': 'Keluar',
    'tabs.home': 'Beranda', 'tabs.services': 'Layanan', 'tabs.social': 'Sosial', 'tabs.competitions': 'Kompetisi', 'tabs.settings': 'Pengaturan',
    'product.addToCart': 'Tambah ke keranjang', 'product.buyNow': 'Beli sekarang',
    'settings.language': 'Bahasa', 'support.title': 'Dukungan pelanggan',
  },
  ms: {
    'common.home': 'Laman utama', 'common.search': 'Cari', 'common.cart': 'Troli', 'common.profile': 'Profil',
    'common.settings': 'Tetapan', 'common.save': 'Simpan', 'common.cancel': 'Batal', 'common.back': 'Kembali',
    'auth.welcome': 'Selamat datang ke Zitex', 'auth.signin': 'Log masuk', 'auth.signup': 'Daftar',
    'auth.phone': 'Telefon', 'auth.password': 'Kata laluan', 'auth.logout': 'Log keluar',
    'tabs.home': 'Utama', 'tabs.services': 'Perkhidmatan', 'tabs.social': 'Sosial', 'tabs.competitions': 'Pertandingan', 'tabs.settings': 'Tetapan',
    'product.addToCart': 'Tambah ke troli', 'product.buyNow': 'Beli sekarang',
    'settings.language': 'Bahasa', 'support.title': 'Sokongan pelanggan',
  },
  th: {
    'common.home': 'หน้าแรก', 'common.search': 'ค้นหา', 'common.cart': 'ตะกร้า', 'common.profile': 'โปรไฟล์',
    'common.settings': 'ตั้งค่า', 'common.save': 'บันทึก', 'common.cancel': 'ยกเลิก', 'common.back': 'กลับ',
    'auth.welcome': 'ยินดีต้อนรับสู่ Zitex', 'auth.signin': 'เข้าสู่ระบบ', 'auth.signup': 'สมัคร',
    'auth.phone': 'โทรศัพท์', 'auth.password': 'รหัสผ่าน', 'auth.logout': 'ออกจากระบบ',
    'tabs.home': 'หน้าแรก', 'tabs.services': 'บริการ', 'tabs.social': 'โซเชียล', 'tabs.competitions': 'การแข่งขัน', 'tabs.settings': 'ตั้งค่า',
    'product.addToCart': 'เพิ่มลงตะกร้า', 'product.buyNow': 'ซื้อเลย',
    'settings.language': 'ภาษา', 'support.title': 'ฝ่ายสนับสนุนลูกค้า',
  },
};

type Ctx = {
  lang: Lang;
  t: (key: string, fallback?: string) => string;
  setLang: (l: Lang) => Promise<void>;
  isRTL: boolean;
  languages: typeof LANGUAGES;
};

const I18nContext = createContext<Ctx>({ lang: 'ar', t: (k, f) => f || k, setLang: async () => {}, isRTL: true, languages: LANGUAGES });

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

  const t = useCallback((key: string, fallback?: string) => {
    return T[lang]?.[key] || T['en']?.[key] || T['ar']?.[key] || fallback || key;
  }, [lang]);

  const setLang = useCallback(async (l: Lang) => {
    setLangState(l);
    await AsyncStorage.setItem('app_lang', l);
    if (Platform.OS !== 'web') {
      const wantRTL = RTL_LANGS.includes(l);
      if (I18nManager.isRTL !== wantRTL) {
        I18nManager.allowRTL(wantRTL);
        I18nManager.forceRTL(wantRTL);
      }
    }
  }, []);

  return (
    <I18nContext.Provider value={{ lang, t, setLang, isRTL: RTL_LANGS.includes(lang), languages: LANGUAGES }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useT() {
  return useContext(I18nContext);
}
