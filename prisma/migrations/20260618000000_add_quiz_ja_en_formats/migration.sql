-- AlterEnum
-- 日本語→英語の出題形式を追加（四択・自己判定・スペル確認）
ALTER TYPE "QuizFormat" ADD VALUE 'CHOICE_JA_EN';
ALTER TYPE "QuizFormat" ADD VALUE 'SELF_JUDGE_JA_EN';
ALTER TYPE "QuizFormat" ADD VALUE 'SPELLING';
