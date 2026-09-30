-- CreateTable
CREATE TABLE "PartnerNgo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "contactPerson" TEXT NOT NULL,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "publicContact" TEXT,
    "serviceAreas" TEXT NOT NULL,
    "expertise" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROSPECTIVE',
    "agreementNote" TEXT,
    "verifiedAt" DATETIME,
    "verifiedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PartnerNgo_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NgoProject" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ngoId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "publicApproved" BOOLEAN NOT NULL DEFAULT false,
    "publicSummary" TEXT,
    "complaintId" TEXT,
    "campaignId" TEXT,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "NgoProject_ngoId_fkey" FOREIGN KEY ("ngoId") REFERENCES "PartnerNgo" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NgoProject_complaintId_fkey" FOREIGN KEY ("complaintId") REFERENCES "Complaint" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "NgoProject_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "DonationCampaign" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "NgoProject_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NgoMilestone" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "dueAt" DATETIME,
    "completedAt" DATETIME,
    "outcome" TEXT,
    "publicApproved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NgoMilestone_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "NgoProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NgoContribution" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "amountPkr" INTEGER,
    "description" TEXT NOT NULL,
    "documentation" TEXT NOT NULL,
    "verifiedAt" DATETIME,
    "verifiedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NgoContribution_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "NgoProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "NgoContribution_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Evidence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "complaintId" TEXT NOT NULL,
    "taskId" TEXT,
    "ngoProjectId" TEXT,
    "uploaderId" TEXT,
    "stage" TEXT NOT NULL,
    "visibility" TEXT NOT NULL DEFAULT 'INTERNAL',
    "storageKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Evidence_complaintId_fkey" FOREIGN KEY ("complaintId") REFERENCES "Complaint" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Evidence_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Evidence_ngoProjectId_fkey" FOREIGN KEY ("ngoProjectId") REFERENCES "NgoProject" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Evidence_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Evidence" ("complaintId", "createdAt", "id", "mimeType", "note", "originalName", "size", "stage", "storageKey", "taskId", "uploaderId", "visibility") SELECT "complaintId", "createdAt", "id", "mimeType", "note", "originalName", "size", "stage", "storageKey", "taskId", "uploaderId", "visibility" FROM "Evidence";
DROP TABLE "Evidence";
ALTER TABLE "new_Evidence" RENAME TO "Evidence";
CREATE UNIQUE INDEX "Evidence_storageKey_key" ON "Evidence"("storageKey");
CREATE INDEX "Evidence_complaintId_createdAt_idx" ON "Evidence"("complaintId", "createdAt");
CREATE INDEX "Evidence_taskId_idx" ON "Evidence"("taskId");
CREATE TABLE "new_Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "complaintId" TEXT NOT NULL,
    "assigneeId" TEXT,
    "createdById" TEXT,
    "partnerName" TEXT,
    "ngoProjectId" TEXT,
    "type" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "deadline" DATETIME NOT NULL,
    "instructions" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'TODO',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Task_complaintId_fkey" FOREIGN KEY ("complaintId") REFERENCES "Complaint" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Task_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Task_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Task_ngoProjectId_fkey" FOREIGN KEY ("ngoProjectId") REFERENCES "NgoProject" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Task" ("assigneeId", "code", "complaintId", "createdAt", "createdById", "deadline", "id", "instructions", "partnerName", "priority", "status", "type", "updatedAt") SELECT "assigneeId", "code", "complaintId", "createdAt", "createdById", "deadline", "id", "instructions", "partnerName", "priority", "status", "type", "updatedAt" FROM "Task";
DROP TABLE "Task";
ALTER TABLE "new_Task" RENAME TO "Task";
CREATE UNIQUE INDEX "Task_code_key" ON "Task"("code");
CREATE INDEX "Task_assigneeId_status_idx" ON "Task"("assigneeId", "status");
CREATE INDEX "Task_deadline_status_idx" ON "Task"("deadline", "status");
CREATE INDEX "Task_complaintId_idx" ON "Task"("complaintId");
CREATE INDEX "Task_ngoProjectId_idx" ON "Task"("ngoProjectId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "PartnerNgo_name_key" ON "PartnerNgo"("name");

-- CreateIndex
CREATE INDEX "PartnerNgo_status_name_idx" ON "PartnerNgo"("status", "name");

-- CreateIndex
CREATE UNIQUE INDEX "NgoProject_campaignId_key" ON "NgoProject"("campaignId");

-- CreateIndex
CREATE INDEX "NgoProject_ngoId_status_idx" ON "NgoProject"("ngoId", "status");

-- CreateIndex
CREATE INDEX "NgoProject_complaintId_idx" ON "NgoProject"("complaintId");

-- CreateIndex
CREATE INDEX "NgoMilestone_projectId_dueAt_idx" ON "NgoMilestone"("projectId", "dueAt");

-- CreateIndex
CREATE INDEX "NgoContribution_projectId_verifiedAt_idx" ON "NgoContribution"("projectId", "verifiedAt");
