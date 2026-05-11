-- CreateEnum
CREATE TYPE "ExampleKind" AS ENUM ('PHRASE', 'SENTENCE', 'TARGET', 'MINIMAL');

-- CreateEnum
CREATE TYPE "RelatedKind" AS ENUM ('SYNONYM', 'ANTONYM', 'DERIVATIVE');

-- CreateTable
CREATE TABLE "word" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "headword" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "word_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meaning" (
    "id" TEXT NOT NULL,
    "word_id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "part_of_speech" TEXT,
    "pronunciation" TEXT,
    "text" TEXT NOT NULL,
    "note" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "meaning_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "example" (
    "id" TEXT NOT NULL,
    "word_id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "kind" "ExampleKind" NOT NULL,
    "text" TEXT NOT NULL,
    "meaning" TEXT,
    "note" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "example_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "related_word" (
    "id" TEXT NOT NULL,
    "word_id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "kind" "RelatedKind",
    "term" TEXT NOT NULL,
    "part_of_speech" TEXT,
    "pronunciation" TEXT,
    "meaning" TEXT,
    "note" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "related_word_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memo" (
    "id" TEXT NOT NULL,
    "word_id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "memo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "occurrence" (
    "id" TEXT NOT NULL,
    "word_id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "occurrence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "occurrence_detail" (
    "id" TEXT NOT NULL,
    "occurrence_id" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "occurrence_detail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "word_owner_id_idx" ON "word"("owner_id");

-- CreateIndex
CREATE UNIQUE INDEX "word_owner_id_headword_key" ON "word"("owner_id", "headword");

-- CreateIndex
CREATE INDEX "meaning_word_id_idx" ON "meaning"("word_id");

-- CreateIndex
CREATE INDEX "meaning_owner_id_idx" ON "meaning"("owner_id");

-- CreateIndex
CREATE INDEX "example_word_id_idx" ON "example"("word_id");

-- CreateIndex
CREATE INDEX "example_owner_id_idx" ON "example"("owner_id");

-- CreateIndex
CREATE INDEX "related_word_word_id_idx" ON "related_word"("word_id");

-- CreateIndex
CREATE INDEX "related_word_owner_id_idx" ON "related_word"("owner_id");

-- CreateIndex
CREATE INDEX "memo_word_id_idx" ON "memo"("word_id");

-- CreateIndex
CREATE INDEX "memo_owner_id_idx" ON "memo"("owner_id");

-- CreateIndex
CREATE INDEX "occurrence_word_id_idx" ON "occurrence"("word_id");

-- CreateIndex
CREATE INDEX "occurrence_owner_id_idx" ON "occurrence"("owner_id");

-- CreateIndex
CREATE INDEX "occurrence_detail_occurrence_id_idx" ON "occurrence_detail"("occurrence_id");

-- AddForeignKey
ALTER TABLE "word" ADD CONSTRAINT "word_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meaning" ADD CONSTRAINT "meaning_word_id_fkey" FOREIGN KEY ("word_id") REFERENCES "word"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meaning" ADD CONSTRAINT "meaning_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "example" ADD CONSTRAINT "example_word_id_fkey" FOREIGN KEY ("word_id") REFERENCES "word"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "example" ADD CONSTRAINT "example_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "related_word" ADD CONSTRAINT "related_word_word_id_fkey" FOREIGN KEY ("word_id") REFERENCES "word"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "related_word" ADD CONSTRAINT "related_word_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memo" ADD CONSTRAINT "memo_word_id_fkey" FOREIGN KEY ("word_id") REFERENCES "word"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memo" ADD CONSTRAINT "memo_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "occurrence" ADD CONSTRAINT "occurrence_word_id_fkey" FOREIGN KEY ("word_id") REFERENCES "word"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "occurrence" ADD CONSTRAINT "occurrence_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "occurrence_detail" ADD CONSTRAINT "occurrence_detail_occurrence_id_fkey" FOREIGN KEY ("occurrence_id") REFERENCES "occurrence"("id") ON DELETE CASCADE ON UPDATE CASCADE;
