-- CreateTable
CREATE TABLE "FiredEvent" (
    "eventKey" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "firedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FiredEvent_pkey" PRIMARY KEY ("eventKey")
);

-- CreateTable
CREATE TABLE "RotationCursor" (
    "ruleId" TEXT NOT NULL,
    "currentPosition" INTEGER NOT NULL,
    "lastAdvancedOn" DATE,

    CONSTRAINT "RotationCursor_pkey" PRIMARY KEY ("ruleId")
);

-- CreateIndex
CREATE INDEX "FiredEvent_orgId_firedAt_idx" ON "FiredEvent"("orgId", "firedAt");
