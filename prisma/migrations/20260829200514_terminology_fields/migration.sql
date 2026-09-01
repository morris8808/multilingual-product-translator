-- AlterTable
ALTER TABLE "Term" ADD COLUMN     "category" TEXT NOT NULL DEFAULT 'custom',
ADD COLUMN     "enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "spaceAfter" BOOLEAN NOT NULL DEFAULT false;
