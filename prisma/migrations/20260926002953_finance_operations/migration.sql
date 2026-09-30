-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DonationExpense" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT,
    "complaintId" TEXT,
    "amountPkr" INTEGER NOT NULL,
    "purpose" TEXT NOT NULL,
    "documentation" TEXT NOT NULL,
    "spentAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "approvedAt" DATETIME,
    "approvedById" TEXT,
    "paidAt" DATETIME,
    "receiptKey" TEXT,
    "receiptMime" TEXT,
    "receiptSize" INTEGER,
    "publishedAt" DATETIME,
    "recordedById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DonationExpense_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "DonationCampaign" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "DonationExpense_complaintId_fkey" FOREIGN KEY ("complaintId") REFERENCES "Complaint" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "DonationExpense_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "DonationExpense_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
-- Existing expense records were entered as completed spending by an admin.
-- Preserve them as paid historical records; future expenses use staged review.
INSERT INTO "new_DonationExpense" ("amountPkr", "campaignId", "createdAt", "documentation", "id", "publishedAt", "purpose", "recordedById", "spentAt", "status", "approvedAt", "approvedById", "paidAt") SELECT "amountPkr", "campaignId", "createdAt", "documentation", "id", "publishedAt", "purpose", "recordedById", "spentAt", 'PAID', "createdAt", "recordedById", "spentAt" FROM "DonationExpense";
DROP TABLE "DonationExpense";
ALTER TABLE "new_DonationExpense" RENAME TO "DonationExpense";
CREATE INDEX "DonationExpense_publishedAt_spentAt_idx" ON "DonationExpense"("publishedAt", "spentAt");
CREATE INDEX "DonationExpense_campaignId_idx" ON "DonationExpense"("campaignId");
CREATE INDEX "DonationExpense_status_paidAt_idx" ON "DonationExpense"("status", "paidAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
