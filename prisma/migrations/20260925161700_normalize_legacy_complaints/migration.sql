-- Preserve older complaint rows while moving their statuses to the phase 3 workflow.
UPDATE "Complaint" SET "status" = 'SUBMITTED' WHERE "status" = 'Submitted';
UPDATE "Complaint" SET "status" = 'UNDER_REVIEW' WHERE "status" = 'In review';
UPDATE "Complaint" SET "status" = 'IN_PROGRESS' WHERE "status" = 'In progress';
UPDATE "Complaint" SET "status" = 'RESOLVED' WHERE "status" = 'Resolved';

-- Give existing complaints a baseline activity event without altering their owners.
INSERT INTO "CaseEvent" ("id", "complaintId", "actorId", "kind", "summary", "visibility", "createdAt")
SELECT 'legacy-' || lower(hex(randomblob(16))), "id", "userId", 'SUBMITTED', 'Complaint submitted', 'PUBLIC', "createdAt"
FROM "Complaint";
