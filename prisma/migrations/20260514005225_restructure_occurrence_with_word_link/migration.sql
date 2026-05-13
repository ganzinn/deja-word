-- DropForeignKey
ALTER TABLE "occurrence" DROP CONSTRAINT "occurrence_word_id_fkey";

-- DropForeignKey
ALTER TABLE "occurrence_detail" DROP CONSTRAINT "occurrence_detail_occurrence_id_fkey";

-- DropIndex
DROP INDEX "occurrence_word_id_idx";

-- DropIndex
DROP INDEX "occurrence_detail_occurrence_id_idx";

-- AlterTable
ALTER TABLE "occurrence" DROP COLUMN "word_id";

-- AlterTable
ALTER TABLE "occurrence_detail" DROP COLUMN "occurrence_id",
ADD COLUMN     "word_occurrence_id" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "word_occurrence" (
    "id" TEXT NOT NULL,
    "word_id" TEXT NOT NULL,
    "occurrence_id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "word_occurrence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "word_occurrence_word_id_idx" ON "word_occurrence"("word_id");

-- CreateIndex
CREATE INDEX "word_occurrence_occurrence_id_idx" ON "word_occurrence"("occurrence_id");

-- CreateIndex
CREATE INDEX "word_occurrence_owner_id_idx" ON "word_occurrence"("owner_id");

-- CreateIndex
CREATE UNIQUE INDEX "word_occurrence_word_id_occurrence_id_key" ON "word_occurrence"("word_id", "occurrence_id");

-- CreateIndex
CREATE UNIQUE INDEX "occurrence_owner_id_location_key" ON "occurrence"("owner_id", "location");

-- CreateIndex
CREATE INDEX "occurrence_detail_word_occurrence_id_idx" ON "occurrence_detail"("word_occurrence_id");

-- AddForeignKey
ALTER TABLE "word_occurrence" ADD CONSTRAINT "word_occurrence_word_id_fkey" FOREIGN KEY ("word_id") REFERENCES "word"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "word_occurrence" ADD CONSTRAINT "word_occurrence_occurrence_id_fkey" FOREIGN KEY ("occurrence_id") REFERENCES "occurrence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "word_occurrence" ADD CONSTRAINT "word_occurrence_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "occurrence_detail" ADD CONSTRAINT "occurrence_detail_word_occurrence_id_fkey" FOREIGN KEY ("word_occurrence_id") REFERENCES "word_occurrence"("id") ON DELETE CASCADE ON UPDATE CASCADE;
