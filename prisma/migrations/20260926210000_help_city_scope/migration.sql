-- Existing help articles are legacy Karachi guidance. No content is rewritten.
ALTER TABLE "HelpArticle" ADD COLUMN "cityId" TEXT REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "HelpArticle_cityId_published_language_idx" ON "HelpArticle"("cityId", "published", "language");
