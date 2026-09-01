-- CreateTable
CREATE TABLE "WorkerRuntime" (
    "id" TEXT NOT NULL,
    "hostname" TEXT,
    "processId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ONLINE',
    "currentJobId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "heartbeatAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stoppedAt" TIMESTAMP(3),
    "metadata" JSONB,

    CONSTRAINT "WorkerRuntime_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkerRuntime_status_heartbeatAt_idx" ON "WorkerRuntime"("status", "heartbeatAt");
