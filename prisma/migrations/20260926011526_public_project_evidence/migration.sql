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
    "publicApprovedAt" DATETIME,
    "publicApprovedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Evidence_complaintId_fkey" FOREIGN KEY ("complaintId") REFERENCES "Complaint" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Evidence_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Evidence_ngoProjectId_fkey" FOREIGN KEY ("ngoProjectId") REFERENCES "NgoProject" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Evidence_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Evidence_publicApprovedById_fkey" FOREIGN KEY ("publicApprovedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Evidence" ("complaintId", "createdAt", "id", "mimeType", "ngoProjectId", "note", "originalName", "size", "stage", "storageKey", "taskId", "uploaderId", "visibility") SELECT "complaintId", "createdAt", "id", "mimeType", "ngoProjectId", "note", "originalName", "size", "stage", "storageKey", "taskId", "uploaderId", "visibility" FROM "Evidence";
DROP TABLE "Evidence";
ALTER TABLE "new_Evidence" RENAME TO "Evidence";
CREATE UNIQUE INDEX "Evidence_storageKey_key" ON "Evidence"("storageKey");
CREATE INDEX "Evidence_complaintId_createdAt_idx" ON "Evidence"("complaintId", "createdAt");
CREATE INDEX "Evidence_taskId_idx" ON "Evidence"("taskId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
