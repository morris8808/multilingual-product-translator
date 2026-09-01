ALTER TABLE "User" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'USER';
UPDATE "User" SET "role" = 'DEVELOPER' WHERE "email" = 'owner@local.multilingual-workbench';
