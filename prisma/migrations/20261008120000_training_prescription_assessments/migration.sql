ALTER TABLE "Injury" ADD COLUMN "loadRestriction" TEXT;
ALTER TABLE "Injury" ADD COLUMN "redFlags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
CREATE TABLE "TrainingPrescriptionAssessment" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "ruleVersion" TEXT NOT NULL,
  "outcome" TEXT NOT NULL,
  "sessionIds" TEXT[],
  "snapshot" JSONB NOT NULL,
  "result" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TrainingPrescriptionAssessment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TrainingPrescriptionAssessment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "TrainingPrescriptionAssessment_userId_createdAt_idx" ON "TrainingPrescriptionAssessment"("userId", "createdAt");
