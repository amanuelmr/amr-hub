-- AlterTable
ALTER TABLE "Project" ADD COLUMN "background" TEXT,
ADD COLUMN "url" TEXT;

-- AlterTable
ALTER TABLE "Version" ADD COLUMN "driverId" TEXT;

-- AddForeignKey
ALTER TABLE "Version" ADD CONSTRAINT "Version_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "member"("id") ON DELETE SET NULL ON UPDATE CASCADE;
