-- CreateEnum
CREATE TYPE "Category" AS ENUM ('BIRTHDAY', 'TASK', 'REMINDER', 'SWAP', 'STATUS');

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "category" "Category" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "data" JSONB,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "eventId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wish" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "birthdayUserId" TEXT NOT NULL,
    "birthdayDate" DATE NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "fromName" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Wish_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Preference" (
    "userId" TEXT NOT NULL,
    "quietFrom" TEXT,
    "quietTo" TEXT,
    "mutedCategories" TEXT[],

    CONSTRAINT "Preference_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE INDEX "Notification_userId_orgId_createdAt_idx" ON "Notification"("userId", "orgId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_userId_eventId_key" ON "Notification"("userId", "eventId");

-- CreateIndex
CREATE INDEX "Wish_orgId_birthdayDate_idx" ON "Wish"("orgId", "birthdayDate");
