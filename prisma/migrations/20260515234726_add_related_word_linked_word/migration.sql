-- AlterTable
ALTER TABLE "related_word" ADD COLUMN     "linked_word_id" TEXT;

-- CreateIndex
CREATE INDEX "related_word_linked_word_id_idx" ON "related_word"("linked_word_id");

-- AddForeignKey
ALTER TABLE "related_word" ADD CONSTRAINT "related_word_linked_word_id_fkey" FOREIGN KEY ("linked_word_id") REFERENCES "word"("id") ON DELETE SET NULL ON UPDATE CASCADE;
