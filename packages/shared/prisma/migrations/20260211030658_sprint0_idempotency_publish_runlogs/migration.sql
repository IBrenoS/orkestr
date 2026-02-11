/*
  Warnings:

  - A unique constraint covering the columns `[tenant_id,source,external_id]` on the table `events` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "run_log_level" AS ENUM ('INFO', 'WARN', 'ERROR');

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "external_id" TEXT;

-- AlterTable
ALTER TABLE "workflows" ADD COLUMN     "published_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "run_logs" (
    "id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "step_run_id" UUID,
    "level" "run_log_level" NOT NULL DEFAULT 'INFO',
    "message" TEXT NOT NULL,
    "details" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "run_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "run_logs_run_id_idx" ON "run_logs"("run_id");

-- CreateIndex
CREATE INDEX "run_logs_step_run_id_idx" ON "run_logs"("step_run_id");

-- CreateIndex
CREATE INDEX "run_logs_created_at_idx" ON "run_logs"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "events_tenant_id_source_external_id_key" ON "events"("tenant_id", "source", "external_id");

-- AddForeignKey
ALTER TABLE "run_logs" ADD CONSTRAINT "run_logs_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "run_logs" ADD CONSTRAINT "run_logs_step_run_id_fkey" FOREIGN KEY ("step_run_id") REFERENCES "step_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
