-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "QuizFormat" ADD VALUE 'SELF_JUDGE_TG';
ALTER TYPE "QuizFormat" ADD VALUE 'SELF_JUDGE_TG_JA_EN';
