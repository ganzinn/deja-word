-- CreateEnum
CREATE TYPE "QuizFormat" AS ENUM ('CHOICE', 'SELF_JUDGE', 'MULTI_MEANING');

-- CreateEnum
CREATE TYPE "QuizResult" AS ENUM ('CORRECT', 'INCORRECT', 'GAVE_UP');

-- CreateEnum
CREATE TYPE "QuizMode" AS ENUM ('TEST', 'DRILL');

-- CreateTable
CREATE TABLE "quiz_answer" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "word_id" TEXT NOT NULL,
    "mode" "QuizMode" NOT NULL,
    "format" "QuizFormat" NOT NULL,
    "result" "QuizResult" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quiz_answer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drill" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "occurrence_id" TEXT NOT NULL,
    "range_from" INTEGER NOT NULL,
    "range_to" INTEGER NOT NULL,
    "format" "QuizFormat" NOT NULL,
    "round_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "drill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drill_word" (
    "drill_id" TEXT NOT NULL,
    "word_id" TEXT NOT NULL,
    "remaining" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "drill_word_pkey" PRIMARY KEY ("drill_id","word_id")
);

-- CreateIndex
CREATE INDEX "quiz_answer_owner_id_word_id_idx" ON "quiz_answer"("owner_id", "word_id");

-- CreateIndex
CREATE INDEX "quiz_answer_word_id_idx" ON "quiz_answer"("word_id");

-- CreateIndex
CREATE INDEX "drill_owner_id_idx" ON "drill"("owner_id");

-- CreateIndex
CREATE INDEX "drill_occurrence_id_idx" ON "drill"("occurrence_id");

-- CreateIndex
CREATE INDEX "drill_word_word_id_idx" ON "drill_word"("word_id");

-- AddForeignKey
ALTER TABLE "quiz_answer" ADD CONSTRAINT "quiz_answer_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_answer" ADD CONSTRAINT "quiz_answer_word_id_fkey" FOREIGN KEY ("word_id") REFERENCES "word"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drill" ADD CONSTRAINT "drill_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drill" ADD CONSTRAINT "drill_occurrence_id_fkey" FOREIGN KEY ("occurrence_id") REFERENCES "occurrence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drill_word" ADD CONSTRAINT "drill_word_drill_id_fkey" FOREIGN KEY ("drill_id") REFERENCES "drill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drill_word" ADD CONSTRAINT "drill_word_word_id_fkey" FOREIGN KEY ("word_id") REFERENCES "word"("id") ON DELETE CASCADE ON UPDATE CASCADE;
