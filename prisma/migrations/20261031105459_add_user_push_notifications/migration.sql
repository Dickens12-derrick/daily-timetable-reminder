-- DropIndex
DROP INDEX "Activity_date_startTime_idx";

-- AlterTable
ALTER TABLE "Activity" ADD COLUMN "userId" TEXT;

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "timeZone" TEXT NOT NULL DEFAULT 'UTC',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "PushDelivery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "activityId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "deliveredAt" DATETIME,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "PushDelivery_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PushDelivery_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "PushSubscription" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- CreateIndex
CREATE INDEX "PushSubscription_timeZone_idx" ON "PushSubscription"("timeZone");

-- CreateIndex
CREATE UNIQUE INDEX "PushDelivery_activityId_subscriptionId_key" ON "PushDelivery"("activityId", "subscriptionId");

-- CreateIndex
CREATE INDEX "Activity_userId_date_startTime_idx" ON "Activity"("userId", "date", "startTime");
