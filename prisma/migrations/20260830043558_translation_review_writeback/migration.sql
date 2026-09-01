-- CreateTable
CREATE TABLE "WritebackRecord" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "translationJobId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sourceProductId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "requestPayload" JSONB NOT NULL,
    "responsePayload" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WritebackRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WritebackRecord_idempotencyKey_key" ON "WritebackRecord"("idempotencyKey");

-- CreateIndex
CREATE INDEX "WritebackRecord_workspaceId_createdAt_idx" ON "WritebackRecord"("workspaceId", "createdAt");

-- AddForeignKey
ALTER TABLE "WritebackRecord" ADD CONSTRAINT "WritebackRecord_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WritebackRecord" ADD CONSTRAINT "WritebackRecord_translationJobId_fkey" FOREIGN KEY ("translationJobId") REFERENCES "TranslationJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
