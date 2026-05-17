/*
  Warnings:

  - A unique constraint covering the columns `[occurrence_id,occurrence_number]` on the table `word_occurrence` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "word_occurrence" ADD COLUMN     "occurrence_number" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "word_occurrence_occurrence_id_occurrence_number_key" ON "word_occurrence"("occurrence_id", "occurrence_number");
