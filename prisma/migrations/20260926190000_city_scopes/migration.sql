-- CreateTable
CREATE TABLE "CityMembership" (
    "userId" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("userId", "cityId"),
    CONSTRAINT "CityMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CityMembership_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Existing records remain in place. Their city is unallocated until an admin verifies the assignment.
ALTER TABLE "CrmContact" ADD COLUMN "cityId" TEXT REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Department" ADD COLUMN "cityId" TEXT REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PartnerNgo" ADD COLUMN "cityId" TEXT REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VolunteerApplication" ADD COLUMN "cityId" TEXT REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- CreateIndex
CREATE INDEX "CityMembership_cityId_userId_idx" ON "CityMembership"("cityId", "userId");
