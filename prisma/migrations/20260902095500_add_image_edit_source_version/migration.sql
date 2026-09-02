DROP INDEX IF EXISTS "ImageVersion_imageId_jobId_key";
ALTER TABLE "ImageVersion" ADD COLUMN "sourceVersionKey" TEXT NOT NULL DEFAULT 'DEFAULT';
CREATE UNIQUE INDEX "ImageVersion_imageId_jobId_sourceVersionKey_key" ON "ImageVersion"("imageId", "jobId", "sourceVersionKey");
