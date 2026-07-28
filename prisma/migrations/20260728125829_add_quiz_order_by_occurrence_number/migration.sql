-- AlterTable
ALTER TABLE "drill" ADD COLUMN     "order_by_occurrence_number" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "quiz_default_setting" ADD COLUMN     "order_by_occurrence_number" BOOLEAN;
