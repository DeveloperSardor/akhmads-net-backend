/**
 * Application-wide Constants
 */

export const ROLES = {
  ADVERTISER: 'ADVERTISER',
  BOT_OWNER: 'BOT_OWNER',
  MODERATOR: 'MODERATOR',
  ADMIN: 'ADMIN',
  SUPER_ADMIN: 'SUPER_ADMIN',
};

export const ROLE_HIERARCHY = {
  [ROLES.ADVERTISER]: 1,
  [ROLES.BOT_OWNER]: 1,
  [ROLES.MODERATOR]: 2,
  [ROLES.ADMIN]: 3,
  [ROLES.SUPER_ADMIN]: 4,
};

export const AD_CATEGORIES = [
  { id: 'technology', nameUz: 'Texnologiya', nameRu: 'Технология', nameEn: 'Technology', multiplier: 1 },
  { id: 'education', nameUz: 'Ta\'lim', nameRu: 'Образование', nameEn: 'Education', multiplier: 1 },
  { id: 'news', nameUz: 'Yangiliklar', nameRu: 'Новости', nameEn: 'News', multiplier: 1 },
  { id: 'entertainment', nameUz: 'Ko\'ngilochar', nameRu: 'Развлечения', nameEn: 'Entertainment', multiplier: 1 },
  { id: 'music', nameUz: 'Musiqa', nameRu: 'Музыка', nameEn: 'Music', multiplier: 1 },
  { id: 'download', nameUz: 'Yuklab olish', nameRu: 'Скачивалки', nameEn: 'Downloads', multiplier: 1 },
  { id: 'betting', nameUz: 'Stavka', nameRu: 'Беттинг', nameEn: 'Betting', multiplier: 2 },
  { id: 'gambling', nameUz: 'Qimor', nameRu: 'Гемблинг', nameEn: 'Gambling', multiplier: 2 },
  { id: 'vpn', nameUz: 'VPN', nameRu: 'VPN', nameEn: 'VPN', multiplier: 1 },
  { id: 'crypto', nameUz: 'Kripto', nameRu: 'Крипто', nameEn: 'Crypto', multiplier: 1.5 },
  { id: 'shopping', nameUz: 'Xarid', nameRu: 'Покупки', nameEn: 'Shopping', multiplier: 1 },
  { id: 'finance', nameUz: 'Moliya', nameRu: 'Финансы', nameEn: 'Finance', multiplier: 1.5 },
];

export const AI_SEGMENTS = [
  {
    id: 'tech_enthusiasts',
    nameUz: 'Texnologiya ishqibozlari',
    nameRu: 'Технологические энтузиасты',
    nameEn: 'Tech Enthusiasts',
    description: 'Users interested in technology',
    multiplier: 1.4,
  },
  {
    id: 'active_shoppers',
    nameUz: 'Faol xaridorlar',
    nameRu: 'Активные покупатели',
    nameEn: 'Active Shoppers',
    description: 'High e-commerce engagement',
    multiplier: 1.3,
  },
  {
    id: 'gamers',
    nameUz: 'Geymerlar',
    nameRu: 'Геймеры',
    nameEn: 'Gamers',
    description: 'Gaming content consumers',
    multiplier: 1.2,
  },
  {
    id: 'crypto_traders',
    nameUz: 'Kripto treyderlar',
    nameRu: 'Крипто-трейдеры',
    nameEn: 'Crypto Traders',
    description: 'Cryptocurrency enthusiasts',
    multiplier: 1.5,
  },
];

export const PAYMENT_PROVIDERS = {
  CLICK: 'CLICK',
  PAYME: 'PAYME',
  CRYPTO: 'CRYPTO',
};

export const CRYPTO_NETWORKS = {
  BTC: 'BTC',
  ETH: 'ETH',
  TRC20: 'TRC20', // USDT Tron
  BEP20: 'BEP20', // USDT/BNB BSC
  ERC20: 'ERC20', // USDT/ETH
  TON: 'TON',
};

export const TRANSACTION_TYPES = {
  DEPOSIT: 'DEPOSIT',
  WITHDRAW: 'WITHDRAW',
  AD_SPEND: 'AD_SPEND',
  EARNINGS: 'EARNINGS',
  REFUND: 'REFUND',
  ADJUSTMENT: 'ADJUSTMENT',
};

export const AD_STATUS = {
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  SCHEDULED: 'SCHEDULED',
  RUNNING: 'RUNNING',
  PAUSED: 'PAUSED',
  COMPLETED: 'COMPLETED',
  ARCHIVED: 'ARCHIVED',
};

export const BOT_STATUS = {
  PENDING: 'PENDING',
  ACTIVE: 'ACTIVE',
  REJECTED: 'REJECTED',
  BANNED: 'BANNED',
  PAUSED: 'PAUSED',
};

export const LIMITS = {
  MIN_DEPOSIT: 5, // USD
  MIN_WITHDRAW: 10, // USD
  MAX_DAILY_WITHDRAW: 5000, // USD
  MIN_AD_IMPRESSIONS: 100,
  MAX_AD_IMPRESSIONS: 100000,
  MAX_EXCLUDED_USERS: 5000000,
  MAX_BUTTONS_PER_AD: 5,
  MAX_POLL_OPTIONS: 10,
  MAX_AD_TEXT_LENGTH: 4096,
  MIN_BOT_FREQUENCY_MINUTES: 1,
  MAX_BOT_FREQUENCY_MINUTES: 1440, // 24 hours
};

// Anti-abuse: minimum gap enforced regardless of bot's frequencyMinutes setting
export const MINIMUM_FREQUENCY_MINUTES = 5;
// Anti-abuse: max impressions one bot can record in 1 hour
export const MAX_IMPRESSIONS_PER_BOT_HOUR = 500;

export const RATE_LIMITS = {
  AUTH: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 attempts
  },
  API: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 requests
  },
  WEBHOOK: {
    windowMs: 60 * 1000, // 1 minute
    max: 60, // 60 requests
  },
  BOT_API: {
    windowMs: 60 * 1000, // 1 minute
    max: 30, // 30 ads per minute per bot
  },
};

export const LANGUAGES = ['uz', 'ru', 'en'];

export const DEFAULT_PLATFORM_SETTINGS = {
  platform_fee_percentage: '10',
  min_deposit_usd: '5',
  min_withdraw_usd: '10',
  max_daily_withdraw_usd: '5000',
  withdrawal_fee_percentage: '2',
  auto_approve_ads: 'false',
  ai_moderation_enabled: 'true',
  default_cpm_usd: '2',
  ai_segment_multiplier: '1.4',
  category_multiplier_betting: '2',
  category_multiplier_gambling: '2',
  category_multiplier_crypto: '1.5',
};

export const BOT_SEND_POST_RESULTS = {
  UNDEFINED: 0,
  SUCCESS: 1,
  REVOKED_TOKEN_ERROR: 2,
  USER_FORBIDDEN_ERROR: 3,
  TOO_MANY_REQUESTS_ERROR: 4,
  OTHER_BOT_API_ERROR: 5,
  OTHER_ERROR: 6,
};

export const AUDIT_ACTIONS = {
  USER_CREATED: 'USER_CREATED',
  USER_UPDATED: 'USER_UPDATED',
  USER_BANNED: 'USER_BANNED',
  USER_UNBANNED: 'USER_UNBANNED',
  BOT_APPROVED: 'BOT_APPROVED',
  BOT_REJECTED: 'BOT_REJECTED',
  AD_APPROVED: 'AD_APPROVED',
  AD_REJECTED: 'AD_REJECTED',
  WITHDRAWAL_APPROVED: 'WITHDRAWAL_APPROVED',
  WITHDRAWAL_REJECTED: 'WITHDRAWAL_REJECTED',
  SETTINGS_UPDATED: 'SETTINGS_UPDATED',
  PRICING_UPDATED: 'PRICING_UPDATED',
};