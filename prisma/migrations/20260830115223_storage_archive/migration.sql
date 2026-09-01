-- AlterTable
ALTER TABLE "ImageAsset" ADD COLUMN     "archiveStorageId" TEXT,
ADD COLUMN     "archiveUrl" TEXT,
ADD COLUMN     "archivedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "StorageConnection" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "region" TEXT,
    "bucket" TEXT NOT NULL,
    "publicBaseUrl" TEXT,
    "pathPrefix" TEXT NOT NULL DEFAULT 'multilingual-workbench',
    "encryptedAccessKey" TEXT NOT NULL,
    "encryptedSecretKey" TEXT NOT NULL,
    "forcePathStyle" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StorageConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StorageConnection_workspaceId_enabled_idx" ON "StorageConnection"("workspaceId", "enabled");

-- AddForeignKey
ALTER TABLE "StorageConnection" ADD CONSTRAINT "StorageConnection_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
