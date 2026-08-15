-- CreateEnum
CREATE TYPE "InboxKind" AS ENUM ('BLOG', 'IDEA', 'TODO');

-- CreateEnum
CREATE TYPE "InboxStatus" AS ENUM ('RECEIVED', 'APPLIED', 'FAILED');

-- CreateEnum
CREATE TYPE "InboxTargetType" AS ENUM ('BLOG', 'IDEA', 'TODO');

-- CreateEnum
CREATE TYPE "IdeaConversionTarget" AS ENUM ('BLOG', 'TODO');

-- Keep existing Todo priorities unchanged while allowing Inbox-created Todos to
-- express that no priority was supplied.
ALTER TABLE "Todo" ALTER COLUMN "priority" DROP NOT NULL;
ALTER TABLE "Todo" ADD COLUMN "projectId" TEXT;
ALTER TABLE "Todo" ADD COLUMN "completionCriteria" TEXT;
ALTER TABLE "Todo" ADD COLUMN "sourceInboxItemId" TEXT;
ALTER TABLE "Post" ADD COLUMN "sourceInboxItemId" TEXT;

-- CreateTable
CREATE TABLE "TodoSubtask" (
  "id" TEXT NOT NULL,
  "todoId" TEXT NOT NULL,
  "title" VARCHAR(300) NOT NULL,
  "completed" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TodoSubtask_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TodoSubtask_title_check" CHECK (char_length(btrim("title")) > 0),
  CONSTRAINT "TodoSubtask_sortOrder_check" CHECK ("sortOrder" >= 0)
);

-- CreateTable
CREATE TABLE "InboxItem" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "kind" "InboxKind" NOT NULL,
  "status" "InboxStatus" NOT NULL DEFAULT 'RECEIVED',
  "rawInput" TEXT NOT NULL,
  "rawSha256" CHAR(64) NOT NULL,
  "parsedBody" TEXT NOT NULL,
  "parserVersion" INTEGER NOT NULL,
  "requestKey" VARCHAR(200) NOT NULL,
  "failureCode" VARCHAR(64),
  "failureMessage" VARCHAR(500),
  "appliedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InboxItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InboxItem_rawSha256_check" CHECK ("rawSha256" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "InboxItem_requestKey_check" CHECK (char_length(btrim("requestKey")) > 0),
  CONSTRAINT "InboxItem_parserVersion_check" CHECK ("parserVersion" > 0)
);

-- CreateTable
CREATE TABLE "InboxExecution" (
  "inboxItemId" TEXT NOT NULL,
  "targetType" "InboxTargetType" NOT NULL,
  "targetId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InboxExecution_pkey" PRIMARY KEY ("inboxItemId")
);

-- CreateTable
CREATE TABLE "InboxEvent" (
  "id" TEXT NOT NULL,
  "inboxItemId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "eventType" VARCHAR(64) NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Idea" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "sourceInboxItemId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Idea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdeaConversion" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "ideaId" TEXT NOT NULL,
  "targetType" "IdeaConversionTarget" NOT NULL,
  "requestKey" VARCHAR(200) NOT NULL,
  "postId" TEXT,
  "todoId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IdeaConversion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "IdeaConversion_target_check" CHECK (
    ("postId" IS NULL AND "todoId" IS NULL)
    OR ("targetType" = 'BLOG' AND "postId" IS NOT NULL AND "todoId" IS NULL)
    OR ("targetType" = 'TODO' AND "postId" IS NULL AND "todoId" IS NOT NULL)
  ),
  CONSTRAINT "IdeaConversion_requestKey_check" CHECK (char_length(btrim("requestKey")) > 0)
);

-- CreateTable (implicit Idea <-> Project many-to-many relation)
CREATE TABLE "_IdeaToProject" (
  "A" TEXT NOT NULL,
  "B" TEXT NOT NULL
);

-- Data invariants
ALTER TABLE "Todo" ADD CONSTRAINT "Todo_priority_check"
  CHECK ("priority" IS NULL OR "priority" BETWEEN 0 AND 2);

-- CreateIndex
CREATE UNIQUE INDEX "Post_sourceInboxItemId_key" ON "Post"("sourceInboxItemId");
CREATE UNIQUE INDEX "Todo_sourceInboxItemId_key" ON "Todo"("sourceInboxItemId");
CREATE INDEX "Todo_projectId_idx" ON "Todo"("projectId");
CREATE INDEX "TodoSubtask_todoId_sortOrder_idx" ON "TodoSubtask"("todoId", "sortOrder");
CREATE UNIQUE INDEX "InboxItem_ownerId_requestKey_key" ON "InboxItem"("ownerId", "requestKey");
CREATE INDEX "InboxItem_ownerId_createdAt_idx" ON "InboxItem"("ownerId", "createdAt" DESC);
CREATE INDEX "InboxItem_ownerId_kind_status_createdAt_idx" ON "InboxItem"("ownerId", "kind", "status", "createdAt" DESC);
CREATE INDEX "InboxExecution_targetType_targetId_idx" ON "InboxExecution"("targetType", "targetId");
CREATE INDEX "InboxEvent_inboxItemId_createdAt_idx" ON "InboxEvent"("inboxItemId", "createdAt");
CREATE INDEX "InboxEvent_actorUserId_createdAt_idx" ON "InboxEvent"("actorUserId", "createdAt");
CREATE UNIQUE INDEX "Idea_sourceInboxItemId_key" ON "Idea"("sourceInboxItemId");
CREATE INDEX "Idea_ownerId_createdAt_idx" ON "Idea"("ownerId", "createdAt" DESC);
CREATE UNIQUE INDEX "IdeaConversion_postId_key" ON "IdeaConversion"("postId");
CREATE UNIQUE INDEX "IdeaConversion_todoId_key" ON "IdeaConversion"("todoId");
CREATE UNIQUE INDEX "IdeaConversion_ownerId_requestKey_key" ON "IdeaConversion"("ownerId", "requestKey");
CREATE INDEX "IdeaConversion_ideaId_createdAt_idx" ON "IdeaConversion"("ideaId", "createdAt");
CREATE UNIQUE INDEX "_IdeaToProject_AB_unique" ON "_IdeaToProject"("A", "B");
CREATE INDEX "_IdeaToProject_B_index" ON "_IdeaToProject"("B");

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_sourceInboxItemId_fkey"
  FOREIGN KEY ("sourceInboxItemId") REFERENCES "InboxItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Todo" ADD CONSTRAINT "Todo_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Todo" ADD CONSTRAINT "Todo_sourceInboxItemId_fkey"
  FOREIGN KEY ("sourceInboxItemId") REFERENCES "InboxItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TodoSubtask" ADD CONSTRAINT "TodoSubtask_todoId_fkey"
  FOREIGN KEY ("todoId") REFERENCES "Todo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InboxItem" ADD CONSTRAINT "InboxItem_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InboxExecution" ADD CONSTRAINT "InboxExecution_inboxItemId_fkey"
  FOREIGN KEY ("inboxItemId") REFERENCES "InboxItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InboxEvent" ADD CONSTRAINT "InboxEvent_inboxItemId_fkey"
  FOREIGN KEY ("inboxItemId") REFERENCES "InboxItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InboxEvent" ADD CONSTRAINT "InboxEvent_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Idea" ADD CONSTRAINT "Idea_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Idea" ADD CONSTRAINT "Idea_sourceInboxItemId_fkey"
  FOREIGN KEY ("sourceInboxItemId") REFERENCES "InboxItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IdeaConversion" ADD CONSTRAINT "IdeaConversion_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IdeaConversion" ADD CONSTRAINT "IdeaConversion_ideaId_fkey"
  FOREIGN KEY ("ideaId") REFERENCES "Idea"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IdeaConversion" ADD CONSTRAINT "IdeaConversion_postId_fkey"
  FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "IdeaConversion" ADD CONSTRAINT "IdeaConversion_todoId_fkey"
  FOREIGN KEY ("todoId") REFERENCES "Todo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "_IdeaToProject" ADD CONSTRAINT "_IdeaToProject_A_fkey"
  FOREIGN KEY ("A") REFERENCES "Idea"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_IdeaToProject" ADD CONSTRAINT "_IdeaToProject_B_fkey"
  FOREIGN KEY ("B") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Raw Inbox content is append-only. Normal status and failure updates remain allowed.
CREATE FUNCTION prevent_inbox_raw_mutation() RETURNS trigger AS $$
BEGIN
  IF NEW."rawInput" IS DISTINCT FROM OLD."rawInput"
    OR NEW."rawSha256" IS DISTINCT FROM OLD."rawSha256" THEN
    RAISE EXCEPTION 'InboxItem raw input and hash are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "InboxItem_raw_immutable"
BEFORE UPDATE OF "rawInput", "rawSha256" ON "InboxItem"
FOR EACH ROW EXECUTE FUNCTION prevent_inbox_raw_mutation();
