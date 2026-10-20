-- AlterTable
ALTER TABLE "Issue" ADD COLUMN "statusChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill from the last status change, or creation when it never moved.
UPDATE "Issue" SET "statusChangedAt" = COALESCE(
  (SELECT MAX(a."createdAt") FROM "Activity" a WHERE a."issueId" = "Issue"."id" AND a."type" = 'STATUS_CHANGED'),
  "Issue"."createdAt"
);
