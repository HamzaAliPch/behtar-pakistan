CREATE TABLE "ComplaintSupport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "complaintId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ComplaintSupport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ComplaintSupport_complaintId_fkey" FOREIGN KEY ("complaintId") REFERENCES "Complaint" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ComplaintSupport_userId_complaintId_key" ON "ComplaintSupport"("userId", "complaintId");
CREATE INDEX "ComplaintSupport_complaintId_active_idx" ON "ComplaintSupport"("complaintId", "active");

CREATE TABLE "CaseLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceComplaintId" TEXT NOT NULL,
    "targetComplaintId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SUGGESTED',
    "score" INTEGER NOT NULL DEFAULT 0,
    "reason" TEXT,
    "reviewerId" TEXT,
    "reviewedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CaseLink_sourceComplaintId_fkey" FOREIGN KEY ("sourceComplaintId") REFERENCES "Complaint" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CaseLink_targetComplaintId_fkey" FOREIGN KEY ("targetComplaintId") REFERENCES "Complaint" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CaseLink_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CaseLink_different_cases" CHECK ("sourceComplaintId" <> "targetComplaintId")
);
CREATE UNIQUE INDEX "CaseLink_sourceComplaintId_targetComplaintId_key" ON "CaseLink"("sourceComplaintId", "targetComplaintId");
CREATE INDEX "CaseLink_status_createdAt_idx" ON "CaseLink"("status", "createdAt");
CREATE INDEX "CaseLink_targetComplaintId_status_idx" ON "CaseLink"("targetComplaintId", "status");
CREATE UNIQUE INDEX "CaseLink_one_linked_primary_per_source" ON "CaseLink"("sourceComplaintId") WHERE "status" = 'LINKED';
