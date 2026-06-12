-- CreateTable
CREATE TABLE "quiz_default_setting" (
    "user_id" TEXT NOT NULL,
    "occurrence_id" TEXT,
    "range_from" INTEGER,
    "range_to" INTEGER,
    "format" "QuizFormat",
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quiz_default_setting_pkey" PRIMARY KEY ("user_id")
);

-- CreateIndex
CREATE INDEX "quiz_default_setting_occurrence_id_idx" ON "quiz_default_setting"("occurrence_id");

-- AddForeignKey
ALTER TABLE "quiz_default_setting" ADD CONSTRAINT "quiz_default_setting_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_default_setting" ADD CONSTRAINT "quiz_default_setting_occurrence_id_fkey" FOREIGN KEY ("occurrence_id") REFERENCES "occurrence"("id") ON DELETE SET NULL ON UPDATE CASCADE;
