ALTER TABLE "ImageAsset"
ADD COLUMN "archived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "ImageAsset" ALTER COLUMN "updatedAt" DROP DEFAULT;

ALTER TABLE "ImageVersion" ADD COLUMN "jobId" TEXT;

CREATE UNIQUE INDEX "ImageAsset_productId_sourceUrl_key" ON "ImageAsset"("productId", "sourceUrl");
CREATE INDEX "ImageAsset_productId_archived_position_idx" ON "ImageAsset"("productId", "archived", "position");
CREATE UNIQUE INDEX "ImageVersion_imageId_jobId_key" ON "ImageVersion"("imageId", "jobId");
