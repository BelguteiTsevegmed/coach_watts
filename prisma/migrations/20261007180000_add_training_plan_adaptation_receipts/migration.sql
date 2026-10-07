CREATE TABLE "TrainingPlanAdaptation" (
    "requestId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "trainingWeekId" TEXT NOT NULL,
    "output" JSONB NOT NULL,
    "workoutIds" TEXT[],
    "followUpsQueued" BOOLEAN NOT NULL DEFAULT false,
    "followUpError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TrainingPlanAdaptation_pkey" PRIMARY KEY ("requestId")
);

CREATE INDEX "TrainingPlanAdaptation_userId_planId_idx" ON "TrainingPlanAdaptation"("userId", "planId");
ALTER TABLE "TrainingPlanAdaptation" ADD CONSTRAINT "TrainingPlanAdaptation_planId_fkey"
    FOREIGN KEY ("planId") REFERENCES "TrainingPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
