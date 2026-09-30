-- CreateIndex
CREATE INDEX "Complaint_publicVisible_publicLatitude_publicLongitude_idx" ON "Complaint"("publicVisible", "publicLatitude", "publicLongitude");
