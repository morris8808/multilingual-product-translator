ALTER TABLE "User"
ADD COLUMN "authSource" TEXT NOT NULL DEFAULT 'LOCAL',
ADD COLUMN "externalId" TEXT,
ADD COLUMN "externalUsername" TEXT,
ADD COLUMN "externalStatus" TEXT,
ADD COLUMN "encryptedExternalToken" TEXT,
ADD COLUMN "lastSyncedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "User_authSource_externalId_key" ON "User"("authSource", "externalId");
