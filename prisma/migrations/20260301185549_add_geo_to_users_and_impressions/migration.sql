-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "LedgerType" ADD VALUE 'WITHDRAW_RESERVE';
ALTER TYPE "LedgerType" ADD VALUE 'WITHDRAW_RELEASE';
ALTER TYPE "LedgerType" ADD VALUE 'DEPOSIT_PENDING';
ALTER TYPE "LedgerType" ADD VALUE 'DEPOSIT_CANCELLED';
ALTER TYPE "LedgerType" ADD VALUE 'SPEND';

-- AlterTable
ALTER TABLE "click_events" ADD COLUMN     "first_name" TEXT,
ADD COLUMN     "language_code" TEXT,
ADD COLUMN     "last_name" TEXT,
ADD COLUMN     "username" TEXT;

-- AlterTable
ALTER TABLE "impressions" ADD COLUMN     "city" TEXT DEFAULT 'Unknown',
ADD COLUMN     "country" TEXT DEFAULT 'Unknown';

-- CreateTable
CREATE TABLE "bot_users" (
    "id" TEXT NOT NULL,
    "bot_id" TEXT NOT NULL,
    "telegram_user_id" TEXT NOT NULL,
    "username" TEXT,
    "first_name" TEXT,
    "last_name" TEXT,
    "language_code" TEXT,
    "is_bot" BOOLEAN NOT NULL DEFAULT false,
    "last_seen_ip" TEXT,
    "country" TEXT DEFAULT 'Unknown',
    "city" TEXT DEFAULT 'Unknown',
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bot_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "broadcasts" (
    "id" TEXT NOT NULL,
    "advertiser_id" TEXT NOT NULL,
    "bot_id" TEXT NOT NULL,
    "status" "AdStatus" NOT NULL DEFAULT 'DRAFT',
    "content_type" "AdContentType" NOT NULL,
    "text" TEXT NOT NULL,
    "media_url" TEXT,
    "media_type" TEXT,
    "buttons" JSONB,
    "target_count" INTEGER NOT NULL DEFAULT 0,
    "sent_count" INTEGER NOT NULL DEFAULT 0,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "total_cost" DECIMAL(12,2) NOT NULL,
    "platform_fee" DECIMAL(12,2) NOT NULL,
    "bot_owner_earn" DECIMAL(12,2) NOT NULL,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "broadcasts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "broadcast_recipients" (
    "id" TEXT NOT NULL,
    "broadcast_id" TEXT NOT NULL,
    "bot_user_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "broadcast_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bot_users_bot_id_idx" ON "bot_users"("bot_id");

-- CreateIndex
CREATE INDEX "bot_users_telegram_user_id_idx" ON "bot_users"("telegram_user_id");

-- CreateIndex
CREATE INDEX "bot_users_last_seen_at_idx" ON "bot_users"("last_seen_at");

-- CreateIndex
CREATE UNIQUE INDEX "bot_users_bot_id_telegram_user_id_key" ON "bot_users"("bot_id", "telegram_user_id");

-- CreateIndex
CREATE INDEX "broadcasts_advertiser_id_status_idx" ON "broadcasts"("advertiser_id", "status");

-- CreateIndex
CREATE INDEX "broadcasts_bot_id_status_idx" ON "broadcasts"("bot_id", "status");

-- CreateIndex
CREATE INDEX "broadcast_recipients_broadcast_id_status_idx" ON "broadcast_recipients"("broadcast_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "broadcast_recipients_broadcast_id_bot_user_id_key" ON "broadcast_recipients"("broadcast_id", "bot_user_id");

-- AddForeignKey
ALTER TABLE "bot_users" ADD CONSTRAINT "bot_users_bot_id_fkey" FOREIGN KEY ("bot_id") REFERENCES "bots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "broadcasts" ADD CONSTRAINT "broadcasts_advertiser_id_fkey" FOREIGN KEY ("advertiser_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "broadcasts" ADD CONSTRAINT "broadcasts_bot_id_fkey" FOREIGN KEY ("bot_id") REFERENCES "bots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "broadcast_recipients" ADD CONSTRAINT "broadcast_recipients_broadcast_id_fkey" FOREIGN KEY ("broadcast_id") REFERENCES "broadcasts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "broadcast_recipients" ADD CONSTRAINT "broadcast_recipients_bot_user_id_fkey" FOREIGN KEY ("bot_user_id") REFERENCES "bot_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
