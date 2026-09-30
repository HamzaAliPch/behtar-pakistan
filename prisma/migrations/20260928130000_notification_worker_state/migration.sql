CREATE TABLE "NotificationWorkerState" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "leaseToken" TEXT,
    "leaseUntil" DATETIME,
    "lastStartedAt" DATETIME,
    "lastFinishedAt" DATETIME,
    "lastSuccessAt" DATETIME,
    "lastErrorCode" TEXT,
    "lastExamined" INTEGER NOT NULL DEFAULT 0,
    "lastDelivered" INTEGER NOT NULL DEFAULT 0,
    "lastRetry" INTEGER NOT NULL DEFAULT 0,
    "lastBlocked" INTEGER NOT NULL DEFAULT 0,
    "lastCancelled" INTEGER NOT NULL DEFAULT 0,
    "totalRuns" INTEGER NOT NULL DEFAULT 0,
    "totalFailures" INTEGER NOT NULL DEFAULT 0
);
