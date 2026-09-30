-- CreateTable
CREATE TABLE "WalletAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "method" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "accountTitle" TEXT NOT NULL,
    "instructions" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" DATETIME,
    "verifiedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WalletAccount_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DonationCampaign" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "goalPkr" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "verificationNote" TEXT,
    "complaintId" TEXT,
    "approvedAt" DATETIME,
    "approvedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DonationCampaign_complaintId_fkey" FOREIGN KEY ("complaintId") REFERENCES "Complaint" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "DonationCampaign_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DonationIntent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "campaignId" TEXT,
    "walletId" TEXT NOT NULL,
    "donorUserId" TEXT,
    "amountPkr" INTEGER NOT NULL,
    "transactionReference" TEXT NOT NULL,
    "donorName" TEXT,
    "donorEmail" TEXT,
    "donorPhone" TEXT,
    "receiptKey" TEXT,
    "receiptMime" TEXT,
    "receiptSize" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "verifiedAt" DATETIME,
    CONSTRAINT "DonationIntent_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "DonationCampaign" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "DonationIntent_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "WalletAccount" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DonationIntent_donorUserId_fkey" FOREIGN KEY ("donorUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DonationVerification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "intentId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "accountCheckNote" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DonationVerification_intentId_fkey" FOREIGN KEY ("intentId") REFERENCES "DonationIntent" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DonationVerification_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DonationExpense" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT,
    "amountPkr" INTEGER NOT NULL,
    "purpose" TEXT NOT NULL,
    "documentation" TEXT NOT NULL,
    "spentAt" DATETIME NOT NULL,
    "publishedAt" DATETIME,
    "recordedById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DonationExpense_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "DonationCampaign" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "DonationExpense_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DonationAudit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "details" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DonationAudit_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "WalletAccount_method_key" ON "WalletAccount"("method");

-- CreateIndex
CREATE UNIQUE INDEX "DonationCampaign_slug_key" ON "DonationCampaign"("slug");

-- CreateIndex
CREATE INDEX "DonationCampaign_status_createdAt_idx" ON "DonationCampaign"("status", "createdAt");

-- CreateIndex
CREATE INDEX "DonationCampaign_complaintId_status_idx" ON "DonationCampaign"("complaintId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DonationIntent_code_key" ON "DonationIntent"("code");

-- CreateIndex
CREATE INDEX "DonationIntent_status_createdAt_idx" ON "DonationIntent"("status", "createdAt");

-- CreateIndex
CREATE INDEX "DonationIntent_campaignId_status_idx" ON "DonationIntent"("campaignId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DonationIntent_walletId_transactionReference_key" ON "DonationIntent"("walletId", "transactionReference");

-- CreateIndex
CREATE INDEX "DonationVerification_intentId_createdAt_idx" ON "DonationVerification"("intentId", "createdAt");

-- CreateIndex
CREATE INDEX "DonationExpense_publishedAt_spentAt_idx" ON "DonationExpense"("publishedAt", "spentAt");

-- CreateIndex
CREATE INDEX "DonationExpense_campaignId_idx" ON "DonationExpense"("campaignId");

-- CreateIndex
CREATE INDEX "DonationAudit_targetType_targetId_createdAt_idx" ON "DonationAudit"("targetType", "targetId", "createdAt");
