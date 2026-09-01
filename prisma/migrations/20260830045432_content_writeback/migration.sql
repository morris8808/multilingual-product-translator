-- CreateTable
CREATE TABLE "ContentWritebackRecord" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "translationJobId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "requestPayload" JSONB NOT NULL,
    "responsePayload" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentWritebackRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContentWritebackRecord_idempotencyKey_key" ON "ContentWritebackRecord"("idempotencyKey");

-- CreateIndex
CREATE INDEX "ContentWritebackRecord_workspaceId_createdAt_idx" ON "ContentWritebackRecord"("workspaceId", "createdAt");

-- AddForeignKey
ALTER TABLE "ContentWritebackRecord" ADD CONSTRAINT "ContentWritebackRecord_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentWritebackRecord" ADD CONSTRAINT "ContentWritebackRecord_translationJobId_fkey" FOREIGN KEY ("translationJobId") REFERENCES "TranslationJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
