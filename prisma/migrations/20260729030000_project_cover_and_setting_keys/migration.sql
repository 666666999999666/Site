-- Add a backwards-compatible optional project cover.
ALTER TABLE "Project" ADD COLUMN "coverImage" TEXT;

-- The public About page uses `email`. Preserve an existing legacy
-- `about_email` value without overwriting a non-empty canonical value.
UPDATE "Setting" AS target
SET "value" = legacy."value"
FROM "Setting" AS legacy
WHERE target."key" = 'email'
  AND legacy."key" = 'about_email'
  AND target."value" = ''
  AND legacy."value" <> '';

INSERT INTO "Setting" ("id", "key", "value")
SELECT
  md5('canonical-email:' || legacy."id"),
  'email',
  legacy."value"
FROM "Setting" AS legacy
WHERE legacy."key" = 'about_email'
  AND NOT EXISTS (
    SELECT 1
    FROM "Setting" AS target
    WHERE target."key" = 'email'
  )
ON CONFLICT ("key") DO NOTHING;
