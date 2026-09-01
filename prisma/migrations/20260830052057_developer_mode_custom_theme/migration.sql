-- AlterTable
ALTER TABLE "UserPreference" ADD COLUMN     "customTheme" JSONB,
ADD COLUMN     "developerMode" BOOLEAN NOT NULL DEFAULT false;
