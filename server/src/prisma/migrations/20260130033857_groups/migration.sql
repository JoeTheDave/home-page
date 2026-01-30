/*
  Warnings:

  - Added the required column `groupId` to the `Bookmark` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "Bookmark_userId_deleted_orderId_idx";

-- AlterTable
ALTER TABLE "Bookmark" ADD COLUMN     "groupId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "BookmarkGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookmarkGroup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BookmarkGroup_userId_idx" ON "BookmarkGroup"("userId");

-- CreateIndex
CREATE INDEX "BookmarkGroup_userId_deleted_idx" ON "BookmarkGroup"("userId", "deleted");

-- CreateIndex
CREATE INDEX "Bookmark_groupId_deleted_orderId_idx" ON "Bookmark"("groupId", "deleted", "orderId");

-- AddForeignKey
ALTER TABLE "BookmarkGroup" ADD CONSTRAINT "BookmarkGroup_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bookmark" ADD CONSTRAINT "Bookmark_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "BookmarkGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
