-- AlterTable
ALTER TABLE "drill" ADD COLUMN     "choice_first_meaning_text_only" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "quiz_default_setting" ADD COLUMN     "choice_first_meaning_text_only" BOOLEAN;
