-- AlterEnum
ALTER TYPE "QuizResult" ADD VALUE 'TIMEOUT';

-- AlterTable
ALTER TABLE "drill" ADD COLUMN     "timeout_seconds" INTEGER;

-- AlterTable
ALTER TABLE "quiz_default_setting" ADD COLUMN     "timeout_seconds" INTEGER;
