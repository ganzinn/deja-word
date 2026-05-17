-- CreateTable
CREATE TABLE "meaning_text" (
    "id" TEXT NOT NULL,
    "meaning_id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "meaning_text_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "meaning_text_meaning_id_idx" ON "meaning_text"("meaning_id");

-- AddForeignKey
ALTER TABLE "meaning_text" ADD CONSTRAINT "meaning_text_meaning_id_fkey" FOREIGN KEY ("meaning_id") REFERENCES "meaning"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: 既存 meaning.text → meaning_text に 1 行ずつコピー
INSERT INTO "meaning_text" ("id", "meaning_id", "text", "sort_order")
SELECT gen_random_uuid()::text, "id", "text", 0
FROM "meaning";

-- AlterTable
ALTER TABLE "meaning" DROP COLUMN "text";
