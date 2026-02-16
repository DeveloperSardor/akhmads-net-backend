-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADVERTISER', 'BOT_OWNER', 'MODERATOR', 'ADMIN', 'SUPER_ADMIN');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('DEPOSIT', 'WITHDRAW', 'AD_SPEND', 'EARNINGS', 'REFUND', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'REVERSED');

-- CreateEnum
CREATE TYPE "WithdrawStatus" AS ENUM ('REQUESTED', 'PENDING_REVIEW', 'APPROVED', 'SENT', 'CONFIRMED', 'FAILED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('CLICK', 'PAYME', 'CRYPTO');

-- CreateEnum
CREATE TYPE "CryptoNetwork" AS ENUM ('BTC', 'ETH', 'TRC20', 'BEP20', 'ERC20', 'TON');

-- CreateEnum
CREATE TYPE "AdContentType" AS ENUM ('TEXT', 'HTML', 'MARKDOWN', 'MEDIA', 'POLL');

-- CreateEnum
CREATE TYPE "AdStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'SCHEDULED', 'RUNNING', 'PAUSED', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "BotStatus" AS ENUM ('PENDING', 'ACTIVE', 'REJECTED', 'BANNED', 'PAUSED');

-- CreateEnum
CREATE TYPE "LedgerType" AS ENUM ('DEPOSIT', 'WITHDRAW', 'AD_SPEND', 'EARNINGS', 'FEE', 'ADJUSTMENT', 'REFUND');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "telegram_id" TEXT,
    "email" TEXT,
    "username" TEXT,
    "first_name" TEXT,
    "last_name" TEXT,
    "role" "Role" NOT NULL DEFAULT 'ADVERTISER',
    "avatar_url" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'uz',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_banned" BOOLEAN NOT NULL DEFAULT false,
    "ban_reason" TEXT,
    "last_login_at" TIMESTAMP(3),
    "last_login_ip" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_sessions" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "telegram_id" TEXT,
    "codes" JSONB NOT NULL,
    "correct_code" TEXT NOT NULL,
    "ip_address" TEXT NOT NULL,
    "user_agent" TEXT,
    "authorized" BOOLEAN NOT NULL DEFAULT false,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallets" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "available" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "reserved" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "pending" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_deposited" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_withdrawn" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_earned" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_spent" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "provider" "PaymentProvider",
    "coin" TEXT,
    "network" "CryptoNetwork",
    "amount" DECIMAL(12,2) NOT NULL,
    "amount_crypto" DECIMAL(18,8),
    "fee" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" "TransactionStatus" NOT NULL DEFAULT 'PENDING',
    "provider_tx_id" TEXT,
    "address" TEXT,
    "tx_hash" TEXT,
    "confirmations" INTEGER DEFAULT 0,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "withdraw_requests" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "coin" TEXT,
    "network" "CryptoNetwork",
    "address" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "fee" DECIMAL(12,2) NOT NULL,
    "net_amount" DECIMAL(12,2) NOT NULL,
    "status" "WithdrawStatus" NOT NULL DEFAULT 'REQUESTED',
    "approved_by" TEXT,
    "approved_at" TIMESTAMP(3),
    "tx_hash" TEXT,
    "reason" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "withdraw_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "LedgerType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "balance" DECIMAL(12,2) NOT NULL,
    "ref_id" TEXT,
    "ref_type" TEXT,
    "description" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pricing_tiers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "impressions" INTEGER NOT NULL,
    "price_usd" DECIMAL(10,2) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pricing_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_settings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "value_type" TEXT NOT NULL DEFAULT 'string',
    "category" TEXT NOT NULL DEFAULT 'general',
    "updated_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bots" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "telegram_bot_id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "token_encrypted" TEXT NOT NULL,
    "api_key" TEXT NOT NULL,
    "api_key_hash" TEXT NOT NULL,
    "short_description" TEXT,
    "category" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'uz',
    "total_members" INTEGER NOT NULL DEFAULT 0,
    "active_members" INTEGER NOT NULL DEFAULT 0,
    "last_stats_sync" TIMESTAMP(3),
    "monetized" BOOLEAN NOT NULL DEFAULT false,
    "is_paused" BOOLEAN NOT NULL DEFAULT false,
    "status" "BotStatus" NOT NULL DEFAULT 'PENDING',
    "post_filter" TEXT NOT NULL DEFAULT 'all',
    "allowed_categories" JSONB,
    "blocked_categories" JSONB,
    "frequency_minutes" INTEGER NOT NULL DEFAULT 5,
    "total_earnings" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "pending_earnings" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "current_ecpm" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "api_key_revoked" BOOLEAN NOT NULL DEFAULT false,
    "api_key_last_used" TIMESTAMP(3),
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bot_statistics" (
    "id" TEXT NOT NULL,
    "bot_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "unique_users" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "revenue" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "ecpm" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bot_statistics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ads" (
    "id" TEXT NOT NULL,
    "advertiser_id" TEXT NOT NULL,
    "content_type" "AdContentType" NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "html_content" TEXT,
    "markdown_content" TEXT,
    "media_url" TEXT,
    "media_type" TEXT,
    "buttons" JSONB,
    "tracking_enabled" BOOLEAN NOT NULL DEFAULT true,
    "poll" JSONB,
    "selected_tier_id" TEXT,
    "target_impressions" INTEGER NOT NULL DEFAULT 0,
    "custom_impressions" INTEGER,
    "base_cpm" DECIMAL(10,4) NOT NULL,
    "cpm_bid" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "final_cpm" DECIMAL(10,4) NOT NULL,
    "total_cost" DECIMAL(12,2) NOT NULL,
    "platform_fee" DECIMAL(12,2) NOT NULL,
    "bot_owner_revenue" DECIMAL(12,2) NOT NULL,
    "remaining_budget" DECIMAL(12,2) NOT NULL,
    "status" "AdStatus" NOT NULL DEFAULT 'DRAFT',
    "delivered_impressions" INTEGER NOT NULL DEFAULT 0,
    "unique_views" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "conversions" INTEGER NOT NULL DEFAULT 0,
    "ctr" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "targeting" JSONB,
    "excluded_user_ids" JSONB,
    "specific_bot_ids" JSONB,
    "promo_code_used" TEXT,
    "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "rejection_reason" TEXT,
    "moderated_by" TEXT,
    "moderated_at" TIMESTAMP(3),
    "ai_safety_check" JSONB,
    "scheduled_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_ads" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "ad_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_ads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "impressions" (
    "id" TEXT NOT NULL,
    "ad_id" TEXT NOT NULL,
    "bot_id" TEXT NOT NULL,
    "telegram_user_id" TEXT,
    "first_name" TEXT,
    "last_name" TEXT,
    "username" TEXT,
    "language_code" TEXT,
    "revenue" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "platform_fee" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "bot_owner_earns" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "message_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "impressions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "click_events" (
    "id" TEXT NOT NULL,
    "ad_id" TEXT NOT NULL,
    "bot_id" TEXT NOT NULL,
    "user_id" TEXT,
    "telegram_user_id" TEXT,
    "tracking_token" TEXT NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "referer" TEXT,
    "country" TEXT,
    "city" TEXT,
    "original_url" TEXT NOT NULL,
    "clicked" BOOLEAN NOT NULL DEFAULT false,
    "clicked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "click_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promo_codes" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "discount" DECIMAL(5,2) NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'percentage',
    "max_uses" INTEGER NOT NULL,
    "used_count" INTEGER NOT NULL DEFAULT 0,
    "valid_from" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "promo_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "changes" JSONB,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limits" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "reset_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rate_limits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "faqs" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "question" JSONB NOT NULL,
    "answer" JSONB NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "views" INTEGER NOT NULL DEFAULT 0,
    "helpful" INTEGER NOT NULL DEFAULT 0,
    "not_helpful" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "faqs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_messages" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'new',
    "replied_at" TIMESTAMP(3),
    "replied_by" TEXT,
    "reply" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_telegram_id_key" ON "users"("telegram_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_telegram_id_idx" ON "users"("telegram_id");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE UNIQUE INDEX "login_sessions_token_key" ON "login_sessions"("token");

-- CreateIndex
CREATE INDEX "login_sessions_token_idx" ON "login_sessions"("token");

-- CreateIndex
CREATE INDEX "login_sessions_telegram_id_idx" ON "login_sessions"("telegram_id");

-- CreateIndex
CREATE INDEX "login_sessions_expires_at_idx" ON "login_sessions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "wallets_user_id_key" ON "wallets"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_provider_tx_id_key" ON "transactions"("provider_tx_id");

-- CreateIndex
CREATE INDEX "transactions_user_id_status_idx" ON "transactions"("user_id", "status");

-- CreateIndex
CREATE INDEX "transactions_provider_tx_id_idx" ON "transactions"("provider_tx_id");

-- CreateIndex
CREATE INDEX "transactions_tx_hash_idx" ON "transactions"("tx_hash");

-- CreateIndex
CREATE INDEX "transactions_created_at_idx" ON "transactions"("created_at");

-- CreateIndex
CREATE INDEX "withdraw_requests_user_id_status_idx" ON "withdraw_requests"("user_id", "status");

-- CreateIndex
CREATE INDEX "withdraw_requests_status_created_at_idx" ON "withdraw_requests"("status", "created_at");

-- CreateIndex
CREATE INDEX "ledger_entries_user_id_created_at_idx" ON "ledger_entries"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "ledger_entries_ref_id_idx" ON "ledger_entries"("ref_id");

-- CreateIndex
CREATE INDEX "pricing_tiers_is_active_sort_order_idx" ON "pricing_tiers"("is_active", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "platform_settings_key_key" ON "platform_settings"("key");

-- CreateIndex
CREATE INDEX "platform_settings_category_idx" ON "platform_settings"("category");

-- CreateIndex
CREATE UNIQUE INDEX "bots_telegram_bot_id_key" ON "bots"("telegram_bot_id");

-- CreateIndex
CREATE UNIQUE INDEX "bots_username_key" ON "bots"("username");

-- CreateIndex
CREATE UNIQUE INDEX "bots_api_key_key" ON "bots"("api_key");

-- CreateIndex
CREATE INDEX "bots_owner_id_status_idx" ON "bots"("owner_id", "status");

-- CreateIndex
CREATE INDEX "bots_status_monetized_idx" ON "bots"("status", "monetized");

-- CreateIndex
CREATE INDEX "bots_api_key_idx" ON "bots"("api_key");

-- CreateIndex
CREATE INDEX "bot_statistics_bot_id_date_idx" ON "bot_statistics"("bot_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "bot_statistics_bot_id_date_key" ON "bot_statistics"("bot_id", "date");

-- CreateIndex
CREATE INDEX "ads_advertiser_id_status_idx" ON "ads"("advertiser_id", "status");

-- CreateIndex
CREATE INDEX "ads_status_created_at_idx" ON "ads"("status", "created_at");

-- CreateIndex
CREATE INDEX "ads_status_started_at_idx" ON "ads"("status", "started_at");

-- CreateIndex
CREATE INDEX "saved_ads_user_id_idx" ON "saved_ads"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "saved_ads_user_id_ad_id_key" ON "saved_ads"("user_id", "ad_id");

-- CreateIndex
CREATE INDEX "impressions_ad_id_bot_id_created_at_idx" ON "impressions"("ad_id", "bot_id", "created_at");

-- CreateIndex
CREATE INDEX "impressions_telegram_user_id_ad_id_idx" ON "impressions"("telegram_user_id", "ad_id");

-- CreateIndex
CREATE INDEX "impressions_created_at_idx" ON "impressions"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "click_events_tracking_token_key" ON "click_events"("tracking_token");

-- CreateIndex
CREATE INDEX "click_events_ad_id_bot_id_clicked_idx" ON "click_events"("ad_id", "bot_id", "clicked");

-- CreateIndex
CREATE INDEX "click_events_tracking_token_idx" ON "click_events"("tracking_token");

-- CreateIndex
CREATE INDEX "click_events_created_at_idx" ON "click_events"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "promo_codes_code_key" ON "promo_codes"("code");

-- CreateIndex
CREATE INDEX "promo_codes_code_idx" ON "promo_codes"("code");

-- CreateIndex
CREATE INDEX "promo_codes_is_active_expires_at_idx" ON "promo_codes"("is_active", "expires_at");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_created_at_idx" ON "audit_logs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "rate_limits_key_key" ON "rate_limits"("key");

-- CreateIndex
CREATE INDEX "rate_limits_key_endpoint_idx" ON "rate_limits"("key", "endpoint");

-- CreateIndex
CREATE INDEX "rate_limits_reset_at_idx" ON "rate_limits"("reset_at");

-- CreateIndex
CREATE INDEX "faqs_category_is_active_idx" ON "faqs"("category", "is_active");

-- CreateIndex
CREATE INDEX "contact_messages_status_created_at_idx" ON "contact_messages"("status", "created_at");

-- CreateIndex
CREATE INDEX "contact_messages_email_idx" ON "contact_messages"("email");

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withdraw_requests" ADD CONSTRAINT "withdraw_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withdraw_requests" ADD CONSTRAINT "withdraw_requests_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bots" ADD CONSTRAINT "bots_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bot_statistics" ADD CONSTRAINT "bot_statistics_bot_id_fkey" FOREIGN KEY ("bot_id") REFERENCES "bots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ads" ADD CONSTRAINT "ads_advertiser_id_fkey" FOREIGN KEY ("advertiser_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ads" ADD CONSTRAINT "ads_moderated_by_fkey" FOREIGN KEY ("moderated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_ads" ADD CONSTRAINT "saved_ads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_ads" ADD CONSTRAINT "saved_ads_ad_id_fkey" FOREIGN KEY ("ad_id") REFERENCES "ads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "impressions" ADD CONSTRAINT "impressions_ad_id_fkey" FOREIGN KEY ("ad_id") REFERENCES "ads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "impressions" ADD CONSTRAINT "impressions_bot_id_fkey" FOREIGN KEY ("bot_id") REFERENCES "bots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "click_events" ADD CONSTRAINT "click_events_ad_id_fkey" FOREIGN KEY ("ad_id") REFERENCES "ads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "click_events" ADD CONSTRAINT "click_events_bot_id_fkey" FOREIGN KEY ("bot_id") REFERENCES "bots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "click_events" ADD CONSTRAINT "click_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_messages" ADD CONSTRAINT "contact_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
