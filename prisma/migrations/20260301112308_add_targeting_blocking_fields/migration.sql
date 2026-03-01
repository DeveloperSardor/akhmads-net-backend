/*
  Warnings:

  - A unique constraint covering the columns `[impressions]` on the table `pricing_tiers` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
ALTER TYPE "AdStatus" ADD VALUE 'PENDING_REVIEW';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "LedgerType" ADD VALUE 'AD_RESERVE';
ALTER TYPE "LedgerType" ADD VALUE 'AD_REFUND';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TransactionType" ADD VALUE 'AD_RESERVE';
ALTER TYPE "TransactionType" ADD VALUE 'AD_REFUND';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "WithdrawStatus" ADD VALUE 'COMPLETED';
ALTER TYPE "WithdrawStatus" ADD VALUE 'CANCELLED';

-- AlterTable
ALTER TABLE "ads" ADD COLUMN     "excluded_bot_ids" JSONB,
ADD COLUMN     "is_archived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "schedule_active_days" JSONB,
ADD COLUMN     "schedule_active_hours" JSONB,
ADD COLUMN     "schedule_end_date" TIMESTAMP(3),
ADD COLUMN     "schedule_start_date" TIMESTAMP(3),
ADD COLUMN     "schedule_timezone" TEXT;

-- AlterTable
ALTER TABLE "bots" ADD COLUMN     "avatar_url" TEXT,
ADD COLUMN     "blocked_ad_ids" JSONB,
ADD COLUMN     "botstat_data" JSONB;

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "roles" DROP DEFAULT;

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name_uz" TEXT NOT NULL,
    "name_ru" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT '📌',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- CreateIndex
CREATE INDEX "categories_is_active_sort_order_idx" ON "categories"("is_active", "sort_order");

-- CreateIndex
CREATE INDEX "ads_is_archived_idx" ON "ads"("is_archived");

-- CreateIndex
CREATE INDEX "ads_schedule_start_date_schedule_end_date_idx" ON "ads"("schedule_start_date", "schedule_end_date");

-- CreateIndex
CREATE UNIQUE INDEX "pricing_tiers_impressions_key" ON "pricing_tiers"("impressions");
