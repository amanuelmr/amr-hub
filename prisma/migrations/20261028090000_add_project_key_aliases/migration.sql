-- CreateTable
CREATE TABLE "ProjectKeyAlias" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectKeyAlias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectKeyAlias_organizationId_key_key" ON "ProjectKeyAlias"("organizationId", "key");

-- CreateIndex
CREATE INDEX "ProjectKeyAlias_projectId_idx" ON "ProjectKeyAlias"("projectId");

-- AddForeignKey
ALTER TABLE "ProjectKeyAlias" ADD CONSTRAINT "ProjectKeyAlias_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
