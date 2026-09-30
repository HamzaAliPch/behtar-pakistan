-- Historical financial records remain unallocated until an admin records a city.
ALTER TABLE "DonationCampaign" ADD COLUMN "cityId" TEXT REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DonationIntent" ADD COLUMN "cityId" TEXT REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DonationExpense" ADD COLUMN "cityId" TEXT REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "DonationCampaign_cityId_status_idx" ON "DonationCampaign"("cityId", "status");
CREATE INDEX "DonationIntent_cityId_status_idx" ON "DonationIntent"("cityId", "status");
CREATE INDEX "DonationExpense_cityId_status_idx" ON "DonationExpense"("cityId", "status");
