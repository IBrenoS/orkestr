/*
  Warnings:

  - You are about to drop the column `details` on the `run_logs` table. All the data in the column will be lost.
  - You are about to drop the column `step_run_id` on the `run_logs` table. All the data in the column will be lost.
  - The `level` column on the `run_logs` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- DropForeignKey
ALTER TABLE "run_logs" DROP CONSTRAINT "run_logs_step_run_id_fkey";

-- DropIndex
DROP INDEX "run_logs_step_run_id_idx";

-- AlterTable
ALTER TABLE "run_logs" DROP COLUMN "details",
DROP COLUMN "step_run_id",
ADD COLUMN     "context" JSONB NOT NULL DEFAULT '{}',
DROP COLUMN "level",
ADD COLUMN     "level" TEXT NOT NULL DEFAULT 'info';

-- DropEnum
DROP TYPE "run_log_level";
