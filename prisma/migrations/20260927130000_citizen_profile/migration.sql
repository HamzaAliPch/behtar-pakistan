CREATE TABLE "CitizenProfile" (
    "userId" TEXT NOT NULL PRIMARY KEY,
    "phone" TEXT,
    "cityId" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CitizenProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CitizenProfile_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "CitizenProfile_cityId_idx" ON "CitizenProfile"("cityId");
