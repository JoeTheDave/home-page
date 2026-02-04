-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isAdmin" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "AllowedEmail" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AllowedEmail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AllowedEmail_email_key" ON "AllowedEmail"("email");

-- Seed admin email
INSERT INTO "AllowedEmail" ("id", "email", "createdAt") 
VALUES (gen_random_uuid(), 'joethedave@gmail.com', CURRENT_TIMESTAMP)
ON CONFLICT (email) DO NOTHING;

-- Make joethedave@gmail.com admin if user exists
UPDATE "User" SET "isAdmin" = true WHERE "email" = 'joethedave@gmail.com';
