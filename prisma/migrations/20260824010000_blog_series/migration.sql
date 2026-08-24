-- Add first-class blog series without changing existing posts or MCP behavior.
CREATE TABLE "Series" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "coverImage" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Series_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Post"
    ADD COLUMN "seriesId" TEXT,
    ADD COLUMN "seriesOrder" INTEGER;

CREATE UNIQUE INDEX "Series_slug_key" ON "Series"("slug");
CREATE INDEX "Series_sortOrder_title_idx" ON "Series"("sortOrder", "title");
CREATE UNIQUE INDEX "Post_seriesId_seriesOrder_key" ON "Post"("seriesId", "seriesOrder");

ALTER TABLE "Post"
    ADD CONSTRAINT "Post_seriesId_fkey"
    FOREIGN KEY ("seriesId") REFERENCES "Series"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
