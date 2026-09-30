-- CreateTable
CREATE TABLE "CrmContact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "organization" TEXT,
    "category" TEXT NOT NULL,
    "phone" TEXT,
    "normalizedPhone" TEXT,
    "email" TEXT,
    "normalizedEmail" TEXT,
    "whatsapp" TEXT,
    "serviceArea" TEXT,
    "notes" TEXT,
    "nextFollowUpAt" DATETIME,
    "ownerId" TEXT,
    "ngoId" TEXT,
    "departmentId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CrmContact_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CrmContact_ngoId_fkey" FOREIGN KEY ("ngoId") REFERENCES "PartnerNgo" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CrmContact_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ContactInteraction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contactId" TEXT NOT NULL,
    "actorId" TEXT,
    "channel" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "happenedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nextFollowUpAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContactInteraction_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "CrmContact" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ContactInteraction_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ContactCaseLink" (
    "contactId" TEXT NOT NULL,
    "complaintId" TEXT NOT NULL,

    PRIMARY KEY ("contactId", "complaintId"),
    CONSTRAINT "ContactCaseLink_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "CrmContact" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ContactCaseLink_complaintId_fkey" FOREIGN KEY ("complaintId") REFERENCES "Complaint" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ContactProjectLink" (
    "contactId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,

    PRIMARY KEY ("contactId", "projectId"),
    CONSTRAINT "ContactProjectLink_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "CrmContact" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ContactProjectLink_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "NgoProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CrmContact_category_nextFollowUpAt_idx" ON "CrmContact"("category", "nextFollowUpAt");

-- CreateIndex
CREATE INDEX "CrmContact_normalizedPhone_idx" ON "CrmContact"("normalizedPhone");

-- CreateIndex
CREATE INDEX "CrmContact_normalizedEmail_idx" ON "CrmContact"("normalizedEmail");

-- CreateIndex
CREATE INDEX "CrmContact_ownerId_idx" ON "CrmContact"("ownerId");

-- CreateIndex
CREATE INDEX "ContactInteraction_contactId_happenedAt_idx" ON "ContactInteraction"("contactId", "happenedAt");
