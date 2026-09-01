-- AlterTable
ALTER TABLE "ImageVersion" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reviewedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "ImageVersion_imageId_createdAt_idx" ON "ImageVersion"("imageId", "createdAt");
