-- AlterTable
ALTER TABLE "drill" ADD COLUMN     "initial_correct_remaining" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "reset_remaining" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "vague_remaining" INTEGER NOT NULL DEFAULT 2;

-- AlterTable
ALTER TABLE "quiz_default_setting" ADD COLUMN     "drill_initial_correct_remaining" INTEGER,
ADD COLUMN     "drill_reset_remaining" INTEGER,
ADD COLUMN     "drill_vague_remaining" INTEGER;
