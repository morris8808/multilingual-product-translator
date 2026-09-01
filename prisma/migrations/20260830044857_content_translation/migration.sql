-- CreateTable
CREATE TABLE "ContentRecord" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "title" TEXT,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContentRecord_workspaceId_entityType_updatedAt_idx" ON "ContentRecord"("workspaceId", "entityType", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ContentRecord_workspaceId_siteId_entityType_sourceId_key" ON "ContentRecord"("workspaceId", "siteId", "entityType", "sourceId");

-- AddForeignKey
ALTER TABLE "ContentRecord" ADD CONSTRAINT "ContentRecord_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
