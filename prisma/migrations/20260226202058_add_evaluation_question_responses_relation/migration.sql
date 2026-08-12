/*
  Warnings:

  - Added the required column `evaluation_id` to the `question_responses` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "question_responses" ADD COLUMN     "evaluation_id" UUID NOT NULL;

-- CreateIndex
CREATE INDEX "question_responses_evaluation_id_idx" ON "question_responses"("evaluation_id");

-- AddForeignKey
ALTER TABLE "question_responses" ADD CONSTRAINT "question_responses_evaluation_id_fkey" FOREIGN KEY ("evaluation_id") REFERENCES "evaluations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
