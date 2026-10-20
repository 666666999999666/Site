-- Optional editorial metadata: existing posts and older application versions remain valid.
-- This migration does not rewrite article content or independent summaries.
ALTER TABLE "Post" ADD COLUMN "contentFormat" TEXT;
ALTER TABLE "Post" ADD COLUMN "readHint" TEXT;
