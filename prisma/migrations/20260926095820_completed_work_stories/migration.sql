-- CreateTable
CREATE TABLE "CompletedWorkStory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "complaintId" TEXT NOT NULL,
    "problemSummary" TEXT,
    "workSummary" TEXT,
    "contentApprovedAt" DATETIME,
    "contentApprovedById" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "holdReason" TEXT,
    "beforeEvidenceId" TEXT,
    "afterEvidenceId" TEXT,
    "completedAt" DATETIME,
    "publishedAt" DATETIME,
    "withdrawnAt" DATETIME,
    "manuallyWithdrawn" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CompletedWorkStory_complaintId_fkey" FOREIGN KEY ("complaintId") REFERENCES "Complaint" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CompletedWorkStory_contentApprovedById_fkey" FOREIGN KEY ("contentApprovedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "CompletedWorkStory_complaintId_key" ON "CompletedWorkStory"("complaintId");

-- CreateIndex
CREATE INDEX "CompletedWorkStory_status_updatedAt_idx" ON "CompletedWorkStory"("status", "updatedAt");

-- Preserve existing resolved cases as unpublished review candidates. No historical
-- evidence or summary is made public by this migration.
INSERT INTO "CompletedWorkStory" ("id", "complaintId", "status", "holdReason", "createdAt", "updatedAt")
SELECT 'legacy-' || lower(hex(randomblob(16))), "id", 'DRAFT', 'Public story review required', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Complaint" WHERE "status" = 'RESOLVED';
