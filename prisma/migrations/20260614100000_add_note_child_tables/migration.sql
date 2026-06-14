-- CreateTable
CREATE TABLE "meaning_note" (
    "id" TEXT NOT NULL,
    "meaning_id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "meaning_note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "example_note" (
    "id" TEXT NOT NULL,
    "example_id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "example_note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "related_word_note" (
    "id" TEXT NOT NULL,
    "related_word_id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "related_word_note_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "meaning_note_meaning_id_idx" ON "meaning_note"("meaning_id");

-- CreateIndex
CREATE INDEX "meaning_note_owner_id_idx" ON "meaning_note"("owner_id");

-- CreateIndex
CREATE INDEX "example_note_example_id_idx" ON "example_note"("example_id");

-- CreateIndex
CREATE INDEX "example_note_owner_id_idx" ON "example_note"("owner_id");

-- CreateIndex
CREATE INDEX "related_word_note_related_word_id_idx" ON "related_word_note"("related_word_id");

-- CreateIndex
CREATE INDEX "related_word_note_owner_id_idx" ON "related_word_note"("owner_id");

-- AddForeignKey
ALTER TABLE "meaning_note" ADD CONSTRAINT "meaning_note_meaning_id_fkey" FOREIGN KEY ("meaning_id") REFERENCES "meaning"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meaning_note" ADD CONSTRAINT "meaning_note_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "example_note" ADD CONSTRAINT "example_note_example_id_fkey" FOREIGN KEY ("example_id") REFERENCES "example"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "example_note" ADD CONSTRAINT "example_note_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "related_word_note" ADD CONSTRAINT "related_word_note_related_word_id_fkey" FOREIGN KEY ("related_word_id") REFERENCES "related_word"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "related_word_note" ADD CONSTRAINT "related_word_note_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migrate existing single-column notes into the new child tables (sort_order 0).
INSERT INTO "meaning_note" ("id", "meaning_id", "owner_id", "text", "sort_order")
SELECT gen_random_uuid()::text, "id", "owner_id", "note", 0
FROM "meaning"
WHERE "note" IS NOT NULL AND btrim("note") <> '';

INSERT INTO "example_note" ("id", "example_id", "owner_id", "text", "sort_order")
SELECT gen_random_uuid()::text, "id", "owner_id", "note", 0
FROM "example"
WHERE "note" IS NOT NULL AND btrim("note") <> '';

INSERT INTO "related_word_note" ("id", "related_word_id", "owner_id", "text", "sort_order")
SELECT gen_random_uuid()::text, "id", "owner_id", "note", 0
FROM "related_word"
WHERE "note" IS NOT NULL AND btrim("note") <> '';

-- AlterTable (drop old single-value note columns after migrating data)
ALTER TABLE "example" DROP COLUMN "note";

-- AlterTable
ALTER TABLE "meaning" DROP COLUMN "note";

-- AlterTable
ALTER TABLE "related_word" DROP COLUMN "note";
