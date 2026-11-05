-- CreateEnum
CREATE TYPE "RuleType" AS ENUM ('BIRTHDAY', 'ROTATION', 'TASK');

-- CreateEnum
CREATE TYPE "Frequency" AS ENUM ('ONCE', 'DAILY', 'WEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('PENDING', 'DONE', 'OVERDUE', 'SKIPPED');

-- CreateEnum
CREATE TYPE "SwapStatus" AS ENUM ('OPEN', 'ACCEPTED', 'DECLINED');

-- CreateTable
CREATE TABLE "Rule" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "type" "RuleType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "frequency" "Frequency" NOT NULL,
    "dayOfWeek" INTEGER,
    "dayOfMonth" INTEGER,
    "timeOfDay" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "targetGroupId" TEXT,
    "assigneeIds" TEXT[],
    "reminderHoursBefore" INTEGER,
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RotationSlot" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "RotationSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "assigneeIds" TEXT[],
    "dueAt" TIMESTAMP(3) NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'PENDING',
    "completedAt" TIMESTAMP(3),
    "occurrenceKey" TEXT NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SwapRequest" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "status" "SwapStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SwapRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Rule_orgId_idx" ON "Rule"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "RotationSlot_ruleId_position_key" ON "RotationSlot"("ruleId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "Task_occurrenceKey_key" ON "Task"("occurrenceKey");

-- CreateIndex
CREATE INDEX "Task_orgId_dueAt_idx" ON "Task"("orgId", "dueAt");

-- AddForeignKey
ALTER TABLE "RotationSlot" ADD CONSTRAINT "RotationSlot_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "Rule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "Rule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SwapRequest" ADD CONSTRAINT "SwapRequest_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
