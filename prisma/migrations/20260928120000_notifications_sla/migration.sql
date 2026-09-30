ALTER TABLE "CitizenProfile" ADD COLUMN "smsOptIn" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CitizenProfile" ADD COLUMN "whatsappOptIn" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Notification" ADD COLUMN "dedupeKey" TEXT;
ALTER TABLE "Notification" ADD COLUMN "kind" TEXT;
ALTER TABLE "Notification" ADD COLUMN "complaintId" TEXT;
CREATE UNIQUE INDEX "Notification_dedupeKey_key" ON "Notification"("dedupeKey");

CREATE TABLE "NotificationOutbox" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "dedupeKey" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "complaintId" TEXT,
  "channel" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "href" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "dueAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 3,
  "lastErrorCode" TEXT,
  "deliveredAt" DATETIME,
  "providerMessageId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "NotificationOutbox_dedupeKey_key" ON "NotificationOutbox"("dedupeKey");
CREATE INDEX "NotificationOutbox_status_dueAt_idx" ON "NotificationOutbox"("status", "dueAt");
CREATE INDEX "NotificationOutbox_complaintId_kind_status_idx" ON "NotificationOutbox"("complaintId", "kind", "status");
CREATE INDEX "NotificationOutbox_userId_createdAt_idx" ON "NotificationOutbox"("userId", "createdAt");

CREATE TABLE "NotificationDeliveryAttempt" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "outboxId" TEXT NOT NULL,
  "attempt" INTEGER NOT NULL,
  "status" TEXT NOT NULL,
  "errorCode" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NotificationDeliveryAttempt_outboxId_fkey" FOREIGN KEY ("outboxId") REFERENCES "NotificationOutbox" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "NotificationDeliveryAttempt_outboxId_attempt_key" ON "NotificationDeliveryAttempt"("outboxId", "attempt");

CREATE TABLE "NotificationWebhookEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "outboxId" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "NotificationWebhookEvent_outboxId_idx" ON "NotificationWebhookEvent"("outboxId");

CREATE TABLE "SlaPolicy" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "cityId" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "firstReviewHours" INTEGER NOT NULL,
  "verificationHours" INTEGER NOT NULL,
  "resolutionHours" INTEGER NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "approvedById" TEXT NOT NULL,
  "approvedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "SlaPolicy_cityId_category_version_key" ON "SlaPolicy"("cityId", "category", "version");
CREATE INDEX "SlaPolicy_cityId_category_active_idx" ON "SlaPolicy"("cityId", "category", "active");

CREATE TABLE "ComplaintSlaSnapshot" (
  "complaintId" TEXT NOT NULL PRIMARY KEY,
  "policyId" TEXT,
  "policyVersion" INTEGER,
  "capturedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "firstReviewTargetAt" DATETIME,
  "verificationTargetAt" DATETIME,
  "resolutionTargetAt" DATETIME,
  "firstReviewedAt" DATETIME,
  "verifiedOrAssignedAt" DATETIME,
  "resolutionProposedAt" DATETIME,
  CONSTRAINT "ComplaintSlaSnapshot_complaintId_fkey" FOREIGN KEY ("complaintId") REFERENCES "Complaint" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "ComplaintSlaSnapshot_firstReviewTargetAt_firstReviewedAt_idx" ON "ComplaintSlaSnapshot"("firstReviewTargetAt", "firstReviewedAt");
CREATE INDEX "ComplaintSlaSnapshot_verificationTargetAt_verifiedOrAssignedAt_idx" ON "ComplaintSlaSnapshot"("verificationTargetAt", "verifiedOrAssignedAt");
CREATE INDEX "ComplaintSlaSnapshot_resolutionTargetAt_resolutionProposedAt_idx" ON "ComplaintSlaSnapshot"("resolutionTargetAt", "resolutionProposedAt");
