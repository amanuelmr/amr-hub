-- AlterTable
ALTER TABLE "SavedView" ADD COLUMN     "description" TEXT,
ADD COLUMN     "editors" TEXT NOT NULL DEFAULT '[]',
ADD COLUMN     "viewers" TEXT NOT NULL DEFAULT '[]';


-- Filters previously shared with the whole workspace keep that audience.
UPDATE "SavedView" SET "viewers" = '[{"type":"WORKSPACE"}]' WHERE "visibility" = 'WORKSPACE';
