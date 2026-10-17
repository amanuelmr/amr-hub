-- AlterTable
ALTER TABLE "Issue" ADD COLUMN     "environment" TEXT,
ADD COLUMN     "fixVersionId" TEXT,
ADD COLUMN     "flagged" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "originalEstimateMinutes" INTEGER,
ADD COLUMN     "parentId" TEXT,
ADD COLUMN     "rank" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "remainingEstimateMinutes" INTEGER,
ADD COLUMN     "resolution" TEXT,
ADD COLUMN     "resolvedAt" TIMESTAMP(3),
ADD COLUMN     "startDate" TIMESTAMP(3),
ADD COLUMN     "timeSpentMinutes" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Comment" ADD COLUMN     "editedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "SavedView" ADD COLUMN     "jql" TEXT;

-- AlterTable
ALTER TABLE "Cycle" ADD COLUMN     "committedPoints" INTEGER,
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "completedPoints" INTEGER,
ADD COLUMN     "goal" TEXT,
ADD COLUMN     "startedAt" TIMESTAMP(3),
ADD COLUMN     "state" TEXT NOT NULL DEFAULT 'FUTURE';

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "boardConfig" TEXT,
ADD COLUMN     "boardType" TEXT NOT NULL DEFAULT 'SCRUM',
ADD COLUMN     "leadUserId" TEXT;

-- CreateTable
CREATE TABLE "Version" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'UNRELEASED',
    "startDate" TIMESTAMP(3),
    "releaseDate" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Component" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "leadUserId" TEXT,
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Component_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IssueComponent" (
    "issueId" TEXT NOT NULL,
    "componentId" TEXT NOT NULL,

    CONSTRAINT "IssueComponent_pkey" PRIMARY KEY ("issueId","componentId")
);

-- CreateTable
CREATE TABLE "IssueLink" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IssueLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IssueWatcher" (
    "issueId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IssueWatcher_pkey" PRIMARY KEY ("issueId","userId")
);

-- CreateTable
CREATE TABLE "IssueVote" (
    "issueId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IssueVote_pkey" PRIMARY KEY ("issueId","userId")
);

-- CreateTable
CREATE TABLE "Worklog" (
    "id" TEXT NOT NULL,
    "minutes" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "comment" TEXT,
    "issueId" TEXT NOT NULL,
    "userId" TEXT,
    "author" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Worklog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "issueId" TEXT NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "trigger" TEXT NOT NULL,
    "conditions" TEXT NOT NULL DEFAULT '{}',
    "actions" TEXT NOT NULL DEFAULT '[]',
    "runCount" INTEGER NOT NULL DEFAULT 0,
    "lastRunAt" TIMESTAMP(3),
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dashboard" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gadgets" TEXT NOT NULL DEFAULT '[]',
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Dashboard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectStar" (
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectStar_pkey" PRIMARY KEY ("projectId","userId")
);

-- CreateTable
CREATE TABLE "IssueView" (
    "issueId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IssueView_pkey" PRIMARY KEY ("issueId","userId")
);

-- CreateIndex
CREATE INDEX "Version_projectId_idx" ON "Version"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "Version_projectId_name_key" ON "Version"("projectId", "name");

-- CreateIndex
CREATE INDEX "Component_projectId_idx" ON "Component"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "Component_projectId_name_key" ON "Component"("projectId", "name");

-- CreateIndex
CREATE INDEX "IssueComponent_componentId_idx" ON "IssueComponent"("componentId");

-- CreateIndex
CREATE INDEX "IssueLink_targetId_idx" ON "IssueLink"("targetId");

-- CreateIndex
CREATE UNIQUE INDEX "IssueLink_sourceId_targetId_type_key" ON "IssueLink"("sourceId", "targetId", "type");

-- CreateIndex
CREATE INDEX "IssueWatcher_userId_idx" ON "IssueWatcher"("userId");

-- CreateIndex
CREATE INDEX "IssueVote_userId_idx" ON "IssueVote"("userId");

-- CreateIndex
CREATE INDEX "Worklog_issueId_startedAt_idx" ON "Worklog"("issueId", "startedAt");

-- CreateIndex
CREATE INDEX "Worklog_userId_idx" ON "Worklog"("userId");

-- CreateIndex
CREATE INDEX "Attachment_issueId_idx" ON "Attachment"("issueId");

-- CreateIndex
CREATE INDEX "AutomationRule_projectId_trigger_idx" ON "AutomationRule"("projectId", "trigger");

-- CreateIndex
CREATE INDEX "Dashboard_organizationId_userId_idx" ON "Dashboard"("organizationId", "userId");

-- CreateIndex
CREATE INDEX "ProjectStar_userId_idx" ON "ProjectStar"("userId");

-- CreateIndex
CREATE INDEX "IssueView_userId_viewedAt_idx" ON "IssueView"("userId", "viewedAt");

-- CreateIndex
CREATE INDEX "Issue_parentId_idx" ON "Issue"("parentId");

-- CreateIndex
CREATE INDEX "Issue_fixVersionId_idx" ON "Issue"("fixVersionId");

-- CreateIndex
CREATE INDEX "Issue_projectId_rank_idx" ON "Issue"("projectId", "rank");

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Issue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_fixVersionId_fkey" FOREIGN KEY ("fixVersionId") REFERENCES "Version"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_leadUserId_fkey" FOREIGN KEY ("leadUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Version" ADD CONSTRAINT "Version_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Component" ADD CONSTRAINT "Component_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueComponent" ADD CONSTRAINT "IssueComponent_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueComponent" ADD CONSTRAINT "IssueComponent_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "Component"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueLink" ADD CONSTRAINT "IssueLink_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueLink" ADD CONSTRAINT "IssueLink_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "Issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueWatcher" ADD CONSTRAINT "IssueWatcher_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueWatcher" ADD CONSTRAINT "IssueWatcher_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueVote" ADD CONSTRAINT "IssueVote_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueVote" ADD CONSTRAINT "IssueVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Worklog" ADD CONSTRAINT "Worklog_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Worklog" ADD CONSTRAINT "Worklog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationRule" ADD CONSTRAINT "AutomationRule_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dashboard" ADD CONSTRAINT "Dashboard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dashboard" ADD CONSTRAINT "Dashboard_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectStar" ADD CONSTRAINT "ProjectStar_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectStar" ADD CONSTRAINT "ProjectStar_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueView" ADD CONSTRAINT "IssueView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Backfill: seed a stable backlog/board order from existing sequence numbers,
-- mark already-completed issues resolved, and promote the current dated cycle
-- of each project to the active sprint.
UPDATE "Issue" SET "rank" = "sequence" * 1000;
UPDATE "Issue" SET "resolution" = 'DONE', "resolvedAt" = "updatedAt" WHERE "status" = 'DONE';
UPDATE "Cycle" SET "state" = 'CLOSED', "completedAt" = "endDate" WHERE "endDate" < NOW();
UPDATE "Cycle" SET "state" = 'ACTIVE', "startedAt" = "startDate" WHERE "startDate" <= NOW() AND "endDate" >= NOW();
UPDATE "Issue" SET "kind" = 'STORY' WHERE "kind" = 'FEATURE';
