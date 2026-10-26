-- CreateTable
CREATE TABLE "IssueWebLink" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IssueWebLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IssueWebLink_issueId_idx" ON "IssueWebLink"("issueId");

-- AddForeignKey
ALTER TABLE "IssueWebLink" ADD CONSTRAINT "IssueWebLink_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
