-- AlterTable
ALTER TABLE "users" ADD COLUMN     "institution" VARCHAR(150);

-- CreateTable
CREATE TABLE "email_logs" (
    "id" UUID NOT NULL,
    "article_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluator_embeddings" (
    "id" UUID NOT NULL,
    "evaluator_id" UUID NOT NULL,
    "vector" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evaluator_embeddings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "email_logs_article_id_idx" ON "email_logs"("article_id");

-- CreateIndex
CREATE INDEX "email_logs_type_sent_at_idx" ON "email_logs"("type", "sent_at");

-- CreateIndex
CREATE UNIQUE INDEX "evaluator_embeddings_evaluator_id_key" ON "evaluator_embeddings"("evaluator_id");

-- AddForeignKey
ALTER TABLE "evaluator_embeddings" ADD CONSTRAINT "evaluator_embeddings_evaluator_id_fkey" FOREIGN KEY ("evaluator_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
