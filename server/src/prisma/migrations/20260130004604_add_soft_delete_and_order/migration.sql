-- AlterTable
ALTER TABLE "Bookmark" ADD COLUMN     "deleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "orderId" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Bookmark_userId_deleted_orderId_idx" ON "Bookmark"("userId", "deleted", "orderId");
