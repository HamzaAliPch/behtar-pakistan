-- CreateTable
CREATE TABLE "AssistantUsage" (
    "day" TEXT NOT NULL PRIMARY KEY,
    "requests" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL
);
