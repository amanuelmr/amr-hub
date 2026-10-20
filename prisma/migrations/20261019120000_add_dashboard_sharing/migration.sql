-- AlterTable
ALTER TABLE "Dashboard" ADD COLUMN     "description" TEXT,
ADD COLUMN     "editors" TEXT NOT NULL DEFAULT '[]',
ADD COLUMN     "viewers" TEXT NOT NULL DEFAULT '[]';

-- CreateTable
CREATE TABLE "DashboardStar" (
    "dashboardId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DashboardStar_pkey" PRIMARY KEY ("dashboardId","userId")
);

-- CreateIndex
CREATE INDEX "DashboardStar_userId_idx" ON "DashboardStar"("userId");

-- AddForeignKey
ALTER TABLE "DashboardStar" ADD CONSTRAINT "DashboardStar_dashboardId_fkey" FOREIGN KEY ("dashboardId") REFERENCES "Dashboard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DashboardStar" ADD CONSTRAINT "DashboardStar_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Dashboards previously shared with the workspace keep that audience.
UPDATE "Dashboard" SET "viewers" = '[{"type":"WORKSPACE"}]' WHERE "visibility" = 'WORKSPACE';
