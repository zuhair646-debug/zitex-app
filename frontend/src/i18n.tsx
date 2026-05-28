/**
 * Zitex i18n — Multilingual support (7 languages)
 * Supports: AR, EN, HI, ZH, ES, FR, TR, UR
 * Auto-detects from device locale on first launch (no token needed).
 */
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { I18nManager, Platform, NativeModules } from 'react-native';

export type Lang = 'ar' | 'en' | 'hi' | 'zh' | 'es' | 'fr' | 'tr' | 'ur';

export const LANGUAGES: { code: Lang; name: string; flag: string }[] = [
  { code: 'ar', name: 'العربية',  flag: '🇸🇦' },
  { code: 'en', name: 'English',  flag: '🇺🇸' },
  { code: 'hi', name: 'हिन्दी',    flag: '🇮🇳' },
  { code: 'zh', name: '中文',      flag: '🇨🇳' },
  { code: 'es', name: 'Español',  flag: '🇪🇸' },
  { code: 'fr', name: 'Français', flag: '🇫🇷' },
  { code: 'tr', name: 'Türkçe',   flag: '🇹🇷' },
  { code: 'ur', name: 'اردو',      flag: '🇵🇰' },
];

const RTL_LANGS: Lang[] = ['ar', 'ur'];

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
    if (['ar', 'en', 'hi', 'zh', 'es', 'fr', 'tr', 'ur'].includes(l)) return l as Lang;
  } catch {}
  return 'ar';
}

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
    'social.writeComment': 'اكتب تعليقاً...', 'social.noPosts': 'لا توجد منشورات',
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
    'social.writeComment': 'Write a comment...', 'social.noPosts': 'No posts yet',
    'orders.title': 'My Orders', 'orders.track': 'Track Order',
    'points.title': 'Loyalty Points', 'points.balance': 'Points Balance', 'points.redeem': 'Redeem Points',
    'gb.title': 'Group Buy', 'gb.join': 'Join Group', 'gb.empty': 'No active group buys',
    'notif.title': 'Notifications', 'notif.empty': 'No notifications',
    'settings.language': 'Language', 'settings.changeLanguage': 'Change Language',
    'support.title': 'Customer Support', 'support.howCanWeHelp': 'How can we help you?', 'support.channels': 'Contact Channels',
  },
  hi: {
    'common.home': 'होम', 'common.search': 'खोज', 'common.cart': 'कार्ट', 'common.profile': 'प्रोफ़ाइल',
    'common.settings': 'सेटिंग्स', 'common.save': 'सहेजें', 'common.cancel': 'रद्द करें', 'common.delete': 'हटाएं',
    'common.edit': 'संपादित करें', 'common.confirm': 'पुष्टि करें', 'common.back': 'वापस', 'common.loading': 'लोड हो रहा है...',
    'common.error': 'त्रुटि', 'common.success': 'सफलता', 'common.yes': 'हाँ', 'common.no': 'नहीं', 'common.currency': 'SAR',
    'auth.welcome': 'Zitex में आपका स्वागत है', 'auth.subtitle': 'जारी रखने के लिए साइन इन करें',
    'auth.phone': 'फ़ोन नंबर', 'auth.password': 'पासवर्ड', 'auth.signin': 'साइन इन', 'auth.signup': 'साइन अप',
    'auth.forgot': 'पासवर्ड भूल गए?', 'auth.noAccount': 'खाता नहीं है?', 'auth.logout': 'लॉगआउट',
    'auth.invalidCredentials': 'फ़ोन या पासवर्ड गलत है', 'auth.networkError': 'कनेक्शन विफल',
    'auth.fillAllFields': 'कृपया सभी फ़ील्ड भरें', 'auth.name': 'पूरा नाम',
    'tabs.home': 'होम', 'tabs.services': 'सेवाएं', 'tabs.social': 'सोशल', 'tabs.competitions': 'प्रतियोगिता', 'tabs.settings': 'सेटिंग्स',
    'product.addToCart': 'कार्ट में जोड़ें', 'product.buyNow': 'अभी खरीदें', 'product.inStock': 'स्टॉक में', 'product.outOfStock': 'स्टॉक नहीं',
    'product.warranty': 'वारंटी', 'product.shipping': 'शिपिंग विधि', 'product.payment': 'भुगतान विधि', 'product.description': 'विवरण',
    'cart.title': 'कार्ट', 'cart.empty': 'कार्ट खाली है', 'cart.total': 'कुल', 'cart.checkout': 'चेकआउट',
    'social.title': 'सोशल', 'social.like': 'पसंद', 'social.comment': 'टिप्पणी', 'social.send': 'भेजें',
    'social.writeComment': 'टिप्पणी लिखें...', 'social.noPosts': 'कोई पोस्ट नहीं',
    'orders.title': 'मेरे ऑर्डर', 'orders.track': 'ऑर्डर ट्रैक करें',
    'points.title': 'लॉयल्टी पॉइंट्स', 'points.balance': 'पॉइंट्स बैलेंस', 'points.redeem': 'पॉइंट्स भुनाएं',
    'gb.title': 'ग्रुप खरीदारी', 'gb.join': 'ग्रुप में शामिल हों', 'gb.empty': 'कोई सक्रिय ग्रुप खरीदारी नहीं',
    'notif.title': 'सूचनाएं', 'notif.empty': 'कोई सूचना नहीं',
    'settings.language': 'भाषा', 'settings.changeLanguage': 'भाषा बदलें',
    'support.title': 'ग्राहक सहायता', 'support.howCanWeHelp': 'हम कैसे मदद कर सकते हैं?', 'support.channels': 'संपर्क चैनल',
  },
  zh: {
    'common.home': '主页', 'common.search': '搜索', 'common.cart': '购物车', 'common.profile': '个人资料',
    'common.settings': '设置', 'common.save': '保存', 'common.cancel': '取消', 'common.delete': '删除',
    'common.edit': '编辑', 'common.confirm': '确认', 'common.back': '返回', 'common.loading': '加载中...',
    'common.error': '错误', 'common.success': '成功', 'common.yes': '是', 'common.no': '否', 'common.currency': 'SAR',
    'auth.welcome': '欢迎来到 Zitex', 'auth.subtitle': '请登录以继续',
    'auth.phone': '电话号码', 'auth.password': '密码', 'auth.signin': '登录', 'auth.signup': '注册',
    'auth.forgot': '忘记密码？', 'auth.noAccount': '没有账户？', 'auth.logout': '退出',
    'auth.invalidCredentials': '电话或密码错误', 'auth.networkError': '连接失败',
    'auth.fillAllFields': '请填写所有字段', 'auth.name': '全名',
    'tabs.home': '主页', 'tabs.services': '服务', 'tabs.social': '社交', 'tabs.competitions': '竞赛', 'tabs.settings': '设置',
    'product.addToCart': '加入购物车', 'product.buyNow': '立即购买', 'product.inStock': '有库存', 'product.outOfStock': '缺货',
    'product.warranty': '保修', 'product.shipping': '运输方式', 'product.payment': '付款方式', 'product.description': '描述',
    'cart.title': '购物车', 'cart.empty': '购物车为空', 'cart.total': '总计', 'cart.checkout': '结账',
    'social.title': '社交', 'social.like': '点赞', 'social.comment': '评论', 'social.send': '发送',
    'social.writeComment': '写评论...', 'social.noPosts': '暂无帖子',
    'orders.title': '我的订单', 'orders.track': '跟踪订单',
    'points.title': '积分', 'points.balance': '积分余额', 'points.redeem': '兑换积分',
    'gb.title': '团购', 'gb.join': '加入团购', 'gb.empty': '没有活跃的团购',
    'notif.title': '通知', 'notif.empty': '没有通知',
    'settings.language': '语言', 'settings.changeLanguage': '更改语言',
    'support.title': '客户支持', 'support.howCanWeHelp': '我们如何帮助您？', 'support.channels': '联系渠道',
  },
  es: {
    'common.home': 'Inicio', 'common.search': 'Buscar', 'common.cart': 'Carrito', 'common.profile': 'Perfil',
    'common.settings': 'Ajustes', 'common.save': 'Guardar', 'common.cancel': 'Cancelar', 'common.delete': 'Eliminar',
    'common.edit': 'Editar', 'common.confirm': 'Confirmar', 'common.back': 'Volver', 'common.loading': 'Cargando...',
    'common.error': 'Error', 'common.success': 'Éxito', 'common.yes': 'Sí', 'common.no': 'No', 'common.currency': 'SAR',
    'auth.welcome': 'Bienvenido a Zitex', 'auth.subtitle': 'Inicia sesión para continuar',
    'auth.phone': 'Número de teléfono', 'auth.password': 'Contraseña', 'auth.signin': 'Iniciar sesión', 'auth.signup': 'Registrarse',
    'auth.forgot': '¿Olvidaste tu contraseña?', 'auth.noAccount': '¿No tienes cuenta?', 'auth.logout': 'Cerrar sesión',
    'auth.invalidCredentials': 'Teléfono o contraseña inválidos', 'auth.networkError': 'Conexión fallida',
    'auth.fillAllFields': 'Por favor completa todos los campos', 'auth.name': 'Nombre completo',
    'tabs.home': 'Inicio', 'tabs.services': 'Servicios', 'tabs.social': 'Social', 'tabs.competitions': 'Concursos', 'tabs.settings': 'Ajustes',
    'product.addToCart': 'Agregar al carrito', 'product.buyNow': 'Comprar ahora', 'product.inStock': 'En stock', 'product.outOfStock': 'Agotado',
    'product.warranty': 'Garantía', 'product.shipping': 'Métodos de envío', 'product.payment': 'Métodos de pago', 'product.description': 'Descripción',
    'cart.title': 'Carrito', 'cart.empty': 'Carrito vacío', 'cart.total': 'Total', 'cart.checkout': 'Pagar',
    'social.title': 'Social', 'social.like': 'Me gusta', 'social.comment': 'Comentar', 'social.send': 'Enviar',
    'social.writeComment': 'Escribe un comentario...', 'social.noPosts': 'No hay publicaciones',
    'orders.title': 'Mis pedidos', 'orders.track': 'Rastrear pedido',
    'points.title': 'Puntos de fidelidad', 'points.balance': 'Saldo de puntos', 'points.redeem': 'Canjear puntos',
    'gb.title': 'Compra grupal', 'gb.join': 'Unirse al grupo', 'gb.empty': 'No hay compras grupales activas',
    'notif.title': 'Notificaciones', 'notif.empty': 'No hay notificaciones',
    'settings.language': 'Idioma', 'settings.changeLanguage': 'Cambiar idioma',
    'support.title': 'Atención al cliente', 'support.howCanWeHelp': '¿Cómo podemos ayudar?', 'support.channels': 'Canales de contacto',
  },
  fr: {
    'common.home': 'Accueil', 'common.search': 'Rechercher', 'common.cart': 'Panier', 'common.profile': 'Profil',
    'common.settings': 'Paramètres', 'common.save': 'Enregistrer', 'common.cancel': 'Annuler', 'common.delete': 'Supprimer',
    'common.edit': 'Modifier', 'common.confirm': 'Confirmer', 'common.back': 'Retour', 'common.loading': 'Chargement...',
    'common.error': 'Erreur', 'common.success': 'Succès', 'common.yes': 'Oui', 'common.no': 'Non', 'common.currency': 'SAR',
    'auth.welcome': 'Bienvenue sur Zitex', 'auth.subtitle': 'Connectez-vous pour continuer',
    'auth.phone': 'Numéro de téléphone', 'auth.password': 'Mot de passe', 'auth.signin': 'Se connecter', 'auth.signup': "S'inscrire",
    'auth.forgot': 'Mot de passe oublié?', 'auth.noAccount': "Pas de compte?", 'auth.logout': 'Déconnexion',
    'auth.invalidCredentials': 'Téléphone ou mot de passe invalide', 'auth.networkError': 'Connexion échouée',
    'auth.fillAllFields': 'Veuillez remplir tous les champs', 'auth.name': 'Nom complet',
    'tabs.home': 'Accueil', 'tabs.services': 'Services', 'tabs.social': 'Social', 'tabs.competitions': 'Concours', 'tabs.settings': 'Paramètres',
    'product.addToCart': 'Ajouter au panier', 'product.buyNow': 'Acheter', 'product.inStock': 'En stock', 'product.outOfStock': 'Rupture de stock',
    'product.warranty': 'Garantie', 'product.shipping': 'Modes de livraison', 'product.payment': 'Modes de paiement', 'product.description': 'Description',
    'cart.title': 'Panier', 'cart.empty': 'Panier vide', 'cart.total': 'Total', 'cart.checkout': 'Payer',
    'social.title': 'Social', 'social.like': "J'aime", 'social.comment': 'Commenter', 'social.send': 'Envoyer',
    'social.writeComment': 'Écrire un commentaire...', 'social.noPosts': 'Aucune publication',
    'orders.title': 'Mes commandes', 'orders.track': 'Suivre la commande',
    'points.title': 'Points de fidélité', 'points.balance': 'Solde de points', 'points.redeem': 'Échanger des points',
    'gb.title': 'Achat groupé', 'gb.join': 'Rejoindre le groupe', 'gb.empty': "Aucun achat groupé actif",
    'notif.title': 'Notifications', 'notif.empty': 'Aucune notification',
    'settings.language': 'Langue', 'settings.changeLanguage': 'Changer de langue',
    'support.title': 'Support client', 'support.howCanWeHelp': 'Comment pouvons-nous aider?', 'support.channels': 'Canaux de contact',
  },
  tr: {
    'common.home': 'Ana sayfa', 'common.search': 'Ara', 'common.cart': 'Sepet', 'common.profile': 'Profil',
    'common.settings': 'Ayarlar', 'common.save': 'Kaydet', 'common.cancel': 'İptal', 'common.delete': 'Sil',
    'common.edit': 'Düzenle', 'common.confirm': 'Onayla', 'common.back': 'Geri', 'common.loading': 'Yükleniyor...',
    'common.error': 'Hata', 'common.success': 'Başarılı', 'common.yes': 'Evet', 'common.no': 'Hayır', 'common.currency': 'SAR',
    'auth.welcome': "Zitex'e hoş geldiniz", 'auth.subtitle': 'Devam etmek için giriş yapın',
    'auth.phone': 'Telefon numarası', 'auth.password': 'Şifre', 'auth.signin': 'Giriş yap', 'auth.signup': 'Kaydol',
    'auth.forgot': 'Şifrenizi mi unuttunuz?', 'auth.noAccount': 'Hesabınız yok mu?', 'auth.logout': 'Çıkış',
    'auth.invalidCredentials': 'Telefon veya şifre hatalı', 'auth.networkError': 'Bağlantı başarısız',
    'auth.fillAllFields': 'Lütfen tüm alanları doldurun', 'auth.name': 'Tam ad',
    'tabs.home': 'Ana sayfa', 'tabs.services': 'Hizmetler', 'tabs.social': 'Sosyal', 'tabs.competitions': 'Yarışmalar', 'tabs.settings': 'Ayarlar',
    'product.addToCart': 'Sepete ekle', 'product.buyNow': 'Şimdi al', 'product.inStock': 'Stokta', 'product.outOfStock': 'Stokta yok',
    'product.warranty': 'Garanti', 'product.shipping': 'Kargo yöntemleri', 'product.payment': 'Ödeme yöntemleri', 'product.description': 'Açıklama',
    'cart.title': 'Sepet', 'cart.empty': 'Sepet boş', 'cart.total': 'Toplam', 'cart.checkout': 'Ödeme',
    'social.title': 'Sosyal', 'social.like': 'Beğen', 'social.comment': 'Yorum', 'social.send': 'Gönder',
    'social.writeComment': 'Yorum yazın...', 'social.noPosts': 'Henüz gönderi yok',
    'orders.title': 'Siparişlerim', 'orders.track': 'Siparişi takip et',
    'points.title': 'Sadakat puanları', 'points.balance': 'Puan bakiyesi', 'points.redeem': 'Puanları kullan',
    'gb.title': 'Grup alışveriş', 'gb.join': 'Gruba katıl', 'gb.empty': 'Aktif grup alışverişi yok',
    'notif.title': 'Bildirimler', 'notif.empty': 'Bildirim yok',
    'settings.language': 'Dil', 'settings.changeLanguage': 'Dili değiştir',
    'support.title': 'Müşteri desteği', 'support.howCanWeHelp': 'Nasıl yardımcı olabiliriz?', 'support.channels': 'İletişim kanalları',
  },
  ur: {
    'common.home': 'ہوم', 'common.search': 'تلاش', 'common.cart': 'کارٹ', 'common.profile': 'پروفائل',
    'common.settings': 'سیٹنگز', 'common.save': 'محفوظ کریں', 'common.cancel': 'منسوخ', 'common.delete': 'حذف',
    'common.edit': 'ترمیم', 'common.confirm': 'تصدیق', 'common.back': 'واپس', 'common.loading': 'لوڈ ہو رہا ہے...',
    'common.error': 'خرابی', 'common.success': 'کامیابی', 'common.yes': 'ہاں', 'common.no': 'نہیں', 'common.currency': 'SAR',
    'auth.welcome': 'Zitex میں خوش آمدید', 'auth.subtitle': 'جاری رکھنے کے لیے سائن ان کریں',
    'auth.phone': 'فون نمبر', 'auth.password': 'پاس ورڈ', 'auth.signin': 'سائن ان', 'auth.signup': 'سائن اپ',
    'auth.forgot': 'پاس ورڈ بھول گئے؟', 'auth.noAccount': 'اکاؤنٹ نہیں ہے؟', 'auth.logout': 'لاگ آؤٹ',
    'auth.invalidCredentials': 'فون یا پاس ورڈ غلط ہے', 'auth.networkError': 'کنکشن ناکام',
    'auth.fillAllFields': 'براہ کرم تمام فیلڈز بھریں', 'auth.name': 'مکمل نام',
    'tabs.home': 'ہوم', 'tabs.services': 'خدمات', 'tabs.social': 'سوشل', 'tabs.competitions': 'مقابلے', 'tabs.settings': 'سیٹنگز',
    'product.addToCart': 'کارٹ میں شامل کریں', 'product.buyNow': 'ابھی خریدیں', 'product.inStock': 'دستیاب', 'product.outOfStock': 'دستیاب نہیں',
    'product.warranty': 'وارنٹی', 'product.shipping': 'ترسیل کے طریقے', 'product.payment': 'ادائیگی کے طریقے', 'product.description': 'تفصیل',
    'cart.title': 'کارٹ', 'cart.empty': 'کارٹ خالی ہے', 'cart.total': 'کل', 'cart.checkout': 'چیک آؤٹ',
    'social.title': 'سوشل', 'social.like': 'پسند', 'social.comment': 'تبصرہ', 'social.send': 'بھیجیں',
    'social.writeComment': 'تبصرہ لکھیں...', 'social.noPosts': 'کوئی پوسٹ نہیں',
    'orders.title': 'میرے آرڈرز', 'orders.track': 'آرڈر ٹریک کریں',
    'points.title': 'لائلٹی پوائنٹس', 'points.balance': 'پوائنٹس بیلنس', 'points.redeem': 'پوائنٹس بدلیں',
    'gb.title': 'گروپ خریداری', 'gb.join': 'گروپ میں شامل ہوں', 'gb.empty': 'کوئی فعال گروپ خریداری نہیں',
    'notif.title': 'اطلاعات', 'notif.empty': 'کوئی اطلاع نہیں',
    'settings.language': 'زبان', 'settings.changeLanguage': 'زبان تبدیل کریں',
    'support.title': 'کسٹمر سپورٹ', 'support.howCanWeHelp': 'ہم کیسے مدد کر سکتے ہیں؟', 'support.channels': 'رابطے کے چینل',
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
        // First launch: detect from device locale
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
