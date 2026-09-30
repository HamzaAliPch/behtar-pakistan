-- Additive fields. Existing complaints retain their original area and location.
ALTER TABLE "Complaint" ADD COLUMN "streetOrBlock" TEXT;
ALTER TABLE "Complaint" ADD COLUMN "landmark" TEXT;
ALTER TABLE "Complaint" ADD COLUMN "privateDirections" TEXT;
ALTER TABLE "Complaint" ADD COLUMN "areaSource" TEXT;
ALTER TABLE "Complaint" ADD COLUMN "submissionKey" TEXT;
CREATE UNIQUE INDEX "Complaint_submissionKey_key" ON "Complaint"("submissionKey");
