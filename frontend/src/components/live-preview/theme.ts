// Luxe Dark palette for the Merchant Live Preview
export const LP = {
  GOLD: '#F5C518',
  GOLD_DIM: '#D4A017',
  BG: '#0B0C10',
  CARD: '#151721',
  CARD_2: '#1A1C23',
  BORDER: '#2A2D38',
  BORDER_SOFT: '#262933',
  MUTED: '#9CA3AF',
  TEXT: '#F5F5F7',
  SUCCESS: '#34D399',
  DANGER: '#F87171',
  INFO: '#60A5FA',
  WARN: '#F59E0B',
  MAGENTA: '#F472B6',
};

// Platform colors for marketer channel breakdown
export const PLATFORM_COLORS: Record<string, string> = {
  tiktok:    '#FE2C55',
  snapchat:  '#FFFC00',
  instagram: '#E1306C',
  twitter:   '#1DA1F2',
  whatsapp:  '#25D366',
  telegram:  '#0088CC',
};

export const PLATFORM_LABEL: Record<string, string> = {
  tiktok:    'تيك توك',
  snapchat:  'سناب شات',
  instagram: 'إنستقرام',
  twitter:   'إكس / تويتر',
  whatsapp:  'واتساب',
  telegram:  'تلجرام',
};

export const PLATFORM_ICON: Record<string, string> = {
  tiktok:    'logo-tiktok',
  snapchat:  'logo-snapchat',
  instagram: 'logo-instagram',
  twitter:   'logo-twitter',
  whatsapp:  'logo-whatsapp',
  telegram:  'paper-plane',
};

export const K = (v: any) => Number(v || 0).toLocaleString('ar-SA');
export const KM = (v: any) => {
  const n = Number(v || 0);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}م`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}ك`;
  return K(n);
};
