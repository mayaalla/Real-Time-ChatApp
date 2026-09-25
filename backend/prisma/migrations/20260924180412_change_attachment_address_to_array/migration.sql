/*
  Warnings:

  - The `attachmentAddress` column on the `Message` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "Message" DROP COLUMN "attachmentAddress",
ADD COLUMN     "attachmentAddress" TEXT[];
