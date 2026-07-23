/*
  Warnings:

  - You are about to drop the column `display_name` on the `users` table. All the data in the column will be lost.
  - Added the required column `name` to the `users` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "users" DROP COLUMN "display_name",
ADD COLUMN     "email_verified" TIMESTAMP(3),
ADD COLUMN     "image" TEXT,
ADD COLUMN     "name" TEXT NOT NULL,
ALTER COLUMN "password_hash" DROP NOT NULL;
