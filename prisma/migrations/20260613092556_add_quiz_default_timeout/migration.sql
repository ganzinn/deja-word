/*
  Warnings:

  - You are about to drop the column `timeout_seconds` on the `quiz_default_setting` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "quiz_default_setting" DROP COLUMN "timeout_seconds";

-- CreateTable
CREATE TABLE "quiz_default_timeout" (
    "user_id" TEXT NOT NULL,
    "format" "QuizFormat" NOT NULL,
    "timeout_seconds" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quiz_default_timeout_pkey" PRIMARY KEY ("user_id","format")
);

-- CreateIndex
CREATE INDEX "quiz_default_timeout_user_id_idx" ON "quiz_default_timeout"("user_id");

-- AddForeignKey
ALTER TABLE "quiz_default_timeout" ADD CONSTRAINT "quiz_default_timeout_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
