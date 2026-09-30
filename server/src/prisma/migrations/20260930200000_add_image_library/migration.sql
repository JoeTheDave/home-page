-- CreateTable
CREATE TABLE "Image" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "sha256" TEXT,
    "label" TEXT,
    "uploadedById" TEXT,
    "lastTouchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Image_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Image_url_key" ON "Image"("url");

-- CreateIndex
CREATE UNIQUE INDEX "Image_key_key" ON "Image"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Image_sha256_key" ON "Image"("sha256");

-- AddForeignKey
ALTER TABLE "Image" ADD CONSTRAINT "Image_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: track every S3 image a LIVE bookmark currently uses. Images referenced only by
-- soft-deleted bookmarks (and older orphans) stay untracked, so the sweep never touches them.
INSERT INTO "Image" ("id", "url", "key", "label", "uploadedById")
SELECT DISTINCT ON (b."image")
    gen_random_uuid()::text,
    b."image",
    substring(b."image" from '\.amazonaws\.com/(.*)$'),
    b."name",
    b."userId"
FROM "Bookmark" b
WHERE b."deleted" = false
  AND b."image" ~ '\.amazonaws\.com/.+'
ORDER BY b."image", b."createdAt" ASC;
