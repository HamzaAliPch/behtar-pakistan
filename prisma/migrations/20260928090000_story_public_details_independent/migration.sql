ALTER TABLE "Complaint" ADD COLUMN "storyPublicApprovedAt" DATETIME;

-- Preserve existing approved stories and their public title/area approval.
UPDATE "Complaint"
SET "storyPublicApprovedAt" = "publicApprovedAt"
WHERE "publicApprovedAt" IS NOT NULL
  AND "publicTitle" IS NOT NULL
  AND "publicArea" IS NOT NULL
  AND "district" IS NOT NULL;

CREATE TABLE "PasswordResetToken" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" DATETIME NOT NULL,
  "usedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");
CREATE INDEX "PasswordResetToken_userId_expiresAt_idx" ON "PasswordResetToken"("userId", "expiresAt");
CREATE TABLE "PasswordResetThrottle" (
  "key" TEXT NOT NULL PRIMARY KEY,
  "requests" INTEGER NOT NULL DEFAULT 0,
  "blockedUntil" DATETIME,
  "updatedAt" DATETIME NOT NULL
);
