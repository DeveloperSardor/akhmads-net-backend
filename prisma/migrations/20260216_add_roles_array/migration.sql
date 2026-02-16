-- Add roles array column
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "roles" "Role"[] DEFAULT '{}';

-- Mavjud userlar uchun role'dan roles'ga copy qiling
UPDATE "users" SET "roles" = ARRAY[role] WHERE "roles" IS NULL OR array_length("roles", 1) IS NULL;
