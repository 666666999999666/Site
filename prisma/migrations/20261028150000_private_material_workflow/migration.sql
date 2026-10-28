-- Additive migration: preserve existing rows, public content and conversion history.
ALTER TYPE "TodoStatus" ADD VALUE IF NOT EXISTS 'PAUSED';
ALTER TYPE "TodoStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';
ALTER TABLE "Todo" ADD COLUMN "statusReason" VARCHAR(1000);
ALTER TABLE "InboxItem" ADD COLUMN "source" VARCHAR(200) NOT NULL DEFAULT 'inbox';
CREATE TYPE "IdeaDiscussionStatus" AS ENUM ('STORED', 'WANT_DISCUSS', 'DISCUSSED', 'ARCHIVED');
ALTER TABLE "Idea"
  ADD COLUMN "rawInput" TEXT,
  ADD COLUMN "source" VARCHAR(200) NOT NULL DEFAULT 'manual',
  ADD COLUMN "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "discussionStatus" "IdeaDiscussionStatus" NOT NULL DEFAULT 'STORED',
  ADD COLUMN "discussionSummary" TEXT;
-- Prefer the exact original Inbox bytes; manually created legacy Ideas keep the
-- earliest available content, without claiming to recover earlier edited text.
UPDATE "Idea" SET "rawInput" = "content", "capturedAt" = "createdAt", "source" = 'legacy';
UPDATE "Idea" AS i SET "rawInput" = x."rawInput", "capturedAt" = x."createdAt", "source" = 'inbox'
  FROM "InboxItem" AS x WHERE i."sourceInboxItemId" = x."id";
CREATE INDEX "Idea_ownerId_discussionStatus_updatedAt_idx" ON "Idea"("ownerId", "discussionStatus", "updatedAt" DESC);

-- Immutable provenance is separate from editable material interpretation.
CREATE FUNCTION "protect_idea_provenance"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."rawInput" IS DISTINCT FROM NEW."rawInput"
     OR OLD."source" IS DISTINCT FROM NEW."source"
     OR OLD."capturedAt" IS DISTINCT FROM NEW."capturedAt" THEN
    RAISE EXCEPTION 'Idea original capture is immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "Idea_provenance_immutable" BEFORE UPDATE OF "rawInput", "source", "capturedAt"
  ON "Idea" FOR EACH ROW EXECUTE FUNCTION "protect_idea_provenance"();

-- Replace only known untouched template biography strings; never overwrite
-- authored settings, projects, or article content.
UPDATE "Setting" SET "value" = '记录 Agent 应用与 Python 后端开发的学习和实践。'
  WHERE "key" = 'home_tagline' AND "value" = '记录思考、项目和对现代 Web 开发的探索。';
UPDATE "Setting" SET "value" = 'Agent 应用 / Python 后端开发'
  WHERE "key" = 'home_role' AND "value" = '开发者 / 持续学习者';
UPDATE "Setting" SET "value" = '计算机相关专业硕士背景，关注 Agent 应用与 Python 后端开发。'
  WHERE "key" = 'about_intro' AND "value" = '你好，我是一名热爱构建 Web 应用的开发者。';
UPDATE "Setting" SET "value" = 'Python,Agent 应用'
  WHERE "key" = 'about_skills' AND "value" = 'TypeScript,React,Next.js,Node.js,Docker,Git,Python,Rust';
UPDATE "Setting" SET "value" = '整理学习笔记，记录 Agent 应用和 Python 后端开发中的问题与实践。'
  WHERE "key" = 'about_whatido' AND "value" = '';

ALTER TABLE "IdeaConversion" ADD COLUMN "inputDigest" CHAR(64);
