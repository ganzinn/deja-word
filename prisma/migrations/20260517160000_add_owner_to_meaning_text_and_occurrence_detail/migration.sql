-- AlterTable: meaning_text に owner_id を追加 (nullable で追加 → backfill → NOT NULL)
ALTER TABLE "meaning_text" ADD COLUMN "owner_id" TEXT;

-- Backfill: 親 meaning の owner_id を継承
UPDATE "meaning_text" SET "owner_id" = "meaning"."owner_id"
FROM "meaning"
WHERE "meaning_text"."meaning_id" = "meaning"."id";

ALTER TABLE "meaning_text" ALTER COLUMN "owner_id" SET NOT NULL;

-- CreateIndex
CREATE INDEX "meaning_text_owner_id_idx" ON "meaning_text"("owner_id");

-- AddForeignKey
ALTER TABLE "meaning_text" ADD CONSTRAINT "meaning_text_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AlterTable: occurrence_detail に owner_id を追加 (nullable で追加 → backfill → NOT NULL)
ALTER TABLE "occurrence_detail" ADD COLUMN "owner_id" TEXT;

-- Backfill: 親 word_occurrence の owner_id を継承
UPDATE "occurrence_detail" SET "owner_id" = "word_occurrence"."owner_id"
FROM "word_occurrence"
WHERE "occurrence_detail"."word_occurrence_id" = "word_occurrence"."id";

ALTER TABLE "occurrence_detail" ALTER COLUMN "owner_id" SET NOT NULL;

-- CreateIndex
CREATE INDEX "occurrence_detail_owner_id_idx" ON "occurrence_detail"("owner_id");

-- AddForeignKey
ALTER TABLE "occurrence_detail" ADD CONSTRAINT "occurrence_detail_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
