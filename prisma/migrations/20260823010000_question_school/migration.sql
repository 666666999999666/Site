-- CreateEnum
CREATE TYPE "QuestionCardState" AS ENUM ('NEW', 'LEARNING', 'REVIEW', 'RELEARNING');

-- CreateEnum
CREATE TYPE "QuestionRating" AS ENUM ('AGAIN', 'HARD', 'GOOD', 'EASY');

-- CreateEnum
CREATE TYPE "QuestionReviewSource" AS ENUM ('TYPED', 'DIRECT_REVEAL');

-- CreateEnum
CREATE TYPE "QuestionRevealMode" AS ENUM ('TYPED', 'DIRECT_REVEAL');

-- CreateEnum
CREATE TYPE "QuestionResetReason" AS ENUM ('CONTENT_RESET', 'ANSWER_CLEARED', 'ANSWER_COMPLETED');

-- CreateEnum
CREATE TYPE "QuestionImageFieldType" AS ENUM ('PROMPT', 'REFERENCE');

-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "promptMarkdown" TEXT NOT NULL,
    "referenceAnswerMarkdown" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "newQueueAt" TIMESTAMP(3),
    "latestRating" "QuestionRating",
    "contentVersion" INTEGER NOT NULL DEFAULT 1,
    "scheduleVersion" INTEGER NOT NULL DEFAULT 1,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "stability" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "difficulty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "elapsedDays" INTEGER NOT NULL DEFAULT 0,
    "scheduledDays" INTEGER NOT NULL DEFAULT 0,
    "learningSteps" INTEGER NOT NULL DEFAULT 0,
    "reps" INTEGER NOT NULL DEFAULT 0,
    "lapses" INTEGER NOT NULL DEFAULT 0,
    "state" "QuestionCardState" NOT NULL DEFAULT 'NEW',
    "lastReviewAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Question_promptMarkdown_check" CHECK (
        char_length("promptMarkdown") <= 100000
        AND "promptMarkdown" ~ '[^[:space:]]'
    ),
    CONSTRAINT "Question_referenceAnswerMarkdown_check" CHECK (
        "referenceAnswerMarkdown" IS NULL
        OR (
            char_length("referenceAnswerMarkdown") <= 100000
            AND "referenceAnswerMarkdown" ~ '[^[:space:]]'
        )
    ),
    CONSTRAINT "Question_pending_queue_check" CHECK (
        "referenceAnswerMarkdown" IS NOT NULL OR "newQueueAt" IS NULL
    ),
    CONSTRAINT "Question_ready_new_queue_check" CHECK (
        "state" <> 'NEW'
        OR "referenceAnswerMarkdown" IS NULL
        OR "newQueueAt" IS NOT NULL
    ),
    CONSTRAINT "Question_versions_check" CHECK (
        "contentVersion" >= 1 AND "scheduleVersion" >= 1
    ),
    CONSTRAINT "Question_card_numbers_check" CHECK (
        "stability" >= 0
        AND "difficulty" >= 0
        AND "elapsedDays" >= 0
        AND "scheduledDays" >= 0
        AND "learningSteps" >= 0
        AND "reps" >= 0
        AND "lapses" >= 0
    ),
    CONSTRAINT "Question_lastReviewAt_check" CHECK (
        ("state" = 'NEW' AND "lastReviewAt" IS NULL)
        OR ("state" <> 'NEW' AND "lastReviewAt" IS NOT NULL)
    )
);

-- CreateTable
CREATE TABLE "QuestionReviewTicket" (
    "id" TEXT NOT NULL,
    "reviewKey" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ownerId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "contentVersion" INTEGER NOT NULL,
    "scheduleVersion" INTEGER NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "answerDigest" CHAR(64),
    "revealMode" "QuestionRevealMode",
    "revealedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "successorTicketId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuestionReviewTicket_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "QuestionReviewTicket_versions_check" CHECK (
        "contentVersion" >= 1 AND "scheduleVersion" >= 1
    ),
    CONSTRAINT "QuestionReviewTicket_expiry_check" CHECK (
        "expiresAt" > "issuedAt"
    ),
    CONSTRAINT "QuestionReviewTicket_terminal_state_check" CHECK (
        NOT ("cancelledAt" IS NOT NULL AND "consumedAt" IS NOT NULL)
    ),
    CONSTRAINT "QuestionReviewTicket_digest_check" CHECK (
        "answerDigest" IS NULL OR "answerDigest" ~ '^[0-9a-f]{64}$'
    ),
    CONSTRAINT "QuestionReviewTicket_reveal_state_check" CHECK (
        (
            "revealMode" IS NULL
            AND "revealedAt" IS NULL
            AND "answerDigest" IS NULL
        )
        OR (
            "revealMode" = 'TYPED'
            AND "revealedAt" IS NOT NULL
            AND (
                "answerDigest" IS NOT NULL
                OR "cancelledAt" IS NOT NULL
                OR "consumedAt" IS NOT NULL
            )
        )
        OR (
            "revealMode" = 'DIRECT_REVEAL'
            AND "revealedAt" IS NOT NULL
            AND "answerDigest" IS NULL
        )
    ),
    CONSTRAINT "QuestionReviewTicket_digest_lifetime_check" CHECK (
        "answerDigest" IS NULL
        OR (
            "revealMode" = 'TYPED'
            AND "revealedAt" IS NOT NULL
            AND "cancelledAt" IS NULL
            AND "consumedAt" IS NULL
        )
    ),
    CONSTRAINT "QuestionReviewTicket_consumed_check" CHECK (
        "consumedAt" IS NULL
        OR (
            "cancelledAt" IS NULL
            AND "revealMode" IS NOT NULL
            AND "revealedAt" IS NOT NULL
        )
    ),
    CONSTRAINT "QuestionReviewTicket_successor_check" CHECK (
        "successorTicketId" IS NULL
        OR "cancelledAt" IS NOT NULL
        OR "consumedAt" IS NOT NULL
    ),
    CONSTRAINT "QuestionReviewTicket_timestamps_check" CHECK (
        ("revealedAt" IS NULL OR "revealedAt" >= "issuedAt")
        AND ("cancelledAt" IS NULL OR "cancelledAt" >= "issuedAt")
        AND ("consumedAt" IS NULL OR "consumedAt" >= "revealedAt")
    )
);

-- CreateTable
CREATE TABLE "QuestionReviewLog" (
    "id" TEXT NOT NULL,
    "reviewKey" UUID NOT NULL,
    "questionId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "source" "QuestionReviewSource" NOT NULL,
    "rating" "QuestionRating" NOT NULL,
    "stateBefore" "QuestionCardState" NOT NULL,
    "reviewedAt" TIMESTAMP(3) NOT NULL,
    "reviewDate" DATE NOT NULL,
    "beforeCard" JSONB NOT NULL,
    "afterCard" JSONB NOT NULL,
    "fsrsReviewLog" JSONB NOT NULL,
    "schedulerVersion" VARCHAR(32) NOT NULL,
    "parametersSnapshot" JSONB NOT NULL,
    "contentVersion" INTEGER NOT NULL,
    "scheduleVersionBefore" INTEGER NOT NULL,
    "scheduleVersionAfter" INTEGER NOT NULL,
    "revisionCount" INTEGER NOT NULL DEFAULT 0,
    "ratingLockedAt" TIMESTAMP(3),
    "advancedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuestionReviewLog_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "QuestionReviewLog_versions_check" CHECK (
        "contentVersion" >= 1
        AND "scheduleVersionBefore" >= 1
        AND "scheduleVersionAfter" = "scheduleVersionBefore" + 1
        AND "revisionCount" >= 0
    ),
    CONSTRAINT "QuestionReviewLog_json_check" CHECK (
        jsonb_typeof("beforeCard") = 'object'
        AND jsonb_typeof("afterCard") = 'object'
        AND jsonb_typeof("fsrsReviewLog") = 'object'
        AND jsonb_typeof("parametersSnapshot") = 'object'
    ),
    CONSTRAINT "QuestionReviewLog_schedulerVersion_check" CHECK (
        "schedulerVersion" = '5.4.1'
    ),
    CONSTRAINT "QuestionReviewLog_advanced_check" CHECK (
        "advancedAt" IS NULL OR "ratingLockedAt" IS NOT NULL
    ),
    CONSTRAINT "QuestionReviewLog_direct_reveal_check" CHECK (
        "source" <> 'DIRECT_REVEAL'
        OR ("rating" = 'AGAIN' AND "ratingLockedAt" IS NOT NULL)
    )
);

-- CreateTable
CREATE TABLE "QuestionAttempt" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "reviewLogId" TEXT NOT NULL,
    "answerMarkdown" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionAttempt_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "QuestionAttempt_answerMarkdown_check" CHECK (
        char_length("answerMarkdown") <= 100000
        AND "answerMarkdown" ~ '[^[:space:]]'
    )
);

-- CreateTable
CREATE TABLE "QuestionScheduleResetLog" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "reason" "QuestionResetReason" NOT NULL,
    "resetAt" TIMESTAMP(3) NOT NULL,
    "beforeCard" JSONB NOT NULL,
    "afterCard" JSONB NOT NULL,
    "contentVersionBefore" INTEGER NOT NULL,
    "contentVersionAfter" INTEGER NOT NULL,
    "scheduleVersionBefore" INTEGER NOT NULL,
    "scheduleVersionAfter" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionScheduleResetLog_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "QuestionScheduleResetLog_versions_check" CHECK (
        "contentVersionBefore" >= 1
        AND "contentVersionAfter" = "contentVersionBefore" + 1
        AND "scheduleVersionBefore" >= 1
        AND "scheduleVersionAfter" = "scheduleVersionBefore" + 1
    ),
    CONSTRAINT "QuestionScheduleResetLog_json_check" CHECK (
        jsonb_typeof("beforeCard") = 'object'
        AND jsonb_typeof("afterCard") = 'object'
    )
);

-- CreateTable
CREATE TABLE "QuestionPreference" (
    "userId" TEXT NOT NULL,
    "dailyNewLimit" INTEGER NOT NULL DEFAULT 10,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuestionPreference_pkey" PRIMARY KEY ("userId"),
    CONSTRAINT "QuestionPreference_dailyNewLimit_check" CHECK (
        "dailyNewLimit" BETWEEN 1 AND 100
    )
);

-- CreateTable
CREATE TABLE "QuestionImage" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "storageKey" VARCHAR(200) NOT NULL,
    "mimeType" VARCHAR(64) NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unreferencedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionImage_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "QuestionImage_storageKey_check" CHECK (
        "storageKey" <> ''
        AND "storageKey" NOT IN ('.', '..')
        AND position('/' IN "storageKey") = 0
        AND position(chr(92) IN "storageKey") = 0
    ),
    CONSTRAINT "QuestionImage_mimeType_check" CHECK (
        "mimeType" IN ('image/jpeg', 'image/png', 'image/gif', 'image/webp')
    ),
    CONSTRAINT "QuestionImage_byteSize_check" CHECK (
        "byteSize" BETWEEN 1 AND 5242880
    ),
    CONSTRAINT "QuestionImage_sha256_check" CHECK (
        "sha256" ~ '^[0-9a-f]{64}$'
    )
);

-- CreateTable
CREATE TABLE "QuestionImageReference" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "imageId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "fieldType" "QuestionImageFieldType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionImageReference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Question_id_ownerId_key" ON "Question"("id", "ownerId");
CREATE INDEX "Question_ownerId_enabled_state_dueAt_id_idx" ON "Question"("ownerId", "enabled", "state", "dueAt", "id");
CREATE INDEX "Question_ownerId_enabled_newQueueAt_id_idx" ON "Question"("ownerId", "enabled", "newQueueAt", "id");
CREATE INDEX "Question_ownerId_updatedAt_id_idx" ON "Question"("ownerId", "updatedAt" DESC, "id");

CREATE UNIQUE INDEX "QuestionReviewTicket_reviewKey_key" ON "QuestionReviewTicket"("reviewKey");
CREATE UNIQUE INDEX "QuestionReviewTicket_successorTicketId_key" ON "QuestionReviewTicket"("successorTicketId");
CREATE UNIQUE INDEX "QuestionReviewTicket_id_ownerId_key" ON "QuestionReviewTicket"("id", "ownerId");
CREATE UNIQUE INDEX "QuestionReviewTicket_reviewKey_questionId_ownerId_key" ON "QuestionReviewTicket"("reviewKey", "questionId", "ownerId");
CREATE UNIQUE INDEX "QuestionReviewTicket_successorTicketId_ownerId_key" ON "QuestionReviewTicket"("successorTicketId", "ownerId");
CREATE INDEX "QuestionReviewTicket_ownerId_expiresAt_idx" ON "QuestionReviewTicket"("ownerId", "expiresAt");
CREATE INDEX "QuestionReviewTicket_questionId_issuedAt_idx" ON "QuestionReviewTicket"("questionId", "issuedAt" DESC);
CREATE UNIQUE INDEX "QuestionReviewTicket_one_active_per_owner" ON "QuestionReviewTicket"("ownerId")
    WHERE "cancelledAt" IS NULL AND "consumedAt" IS NULL;

CREATE UNIQUE INDEX "QuestionReviewLog_reviewKey_key" ON "QuestionReviewLog"("reviewKey");
CREATE UNIQUE INDEX "QuestionReviewLog_id_questionId_ownerId_key" ON "QuestionReviewLog"("id", "questionId", "ownerId");
CREATE UNIQUE INDEX "QuestionReviewLog_reviewKey_questionId_ownerId_key" ON "QuestionReviewLog"("reviewKey", "questionId", "ownerId");
CREATE INDEX "QuestionReviewLog_ownerId_reviewDate_idx" ON "QuestionReviewLog"("ownerId", "reviewDate");
CREATE INDEX "QuestionReviewLog_ownerId_reviewDate_stateBefore_idx" ON "QuestionReviewLog"("ownerId", "reviewDate", "stateBefore");
CREATE INDEX "QuestionReviewLog_questionId_reviewedAt_id_idx" ON "QuestionReviewLog"("questionId", "reviewedAt" DESC, "id");
CREATE UNIQUE INDEX "QuestionReviewLog_one_unadvanced_per_owner" ON "QuestionReviewLog"("ownerId")
    WHERE "advancedAt" IS NULL;

CREATE UNIQUE INDEX "QuestionAttempt_reviewLogId_key" ON "QuestionAttempt"("reviewLogId");
CREATE UNIQUE INDEX "QuestionAttempt_reviewLogId_questionId_ownerId_key" ON "QuestionAttempt"("reviewLogId", "questionId", "ownerId");
CREATE INDEX "QuestionAttempt_questionId_createdAt_id_idx" ON "QuestionAttempt"("questionId", "createdAt" DESC, "id");
CREATE INDEX "QuestionAttempt_ownerId_createdAt_idx" ON "QuestionAttempt"("ownerId", "createdAt" DESC);

CREATE INDEX "QuestionScheduleResetLog_questionId_resetAt_id_idx" ON "QuestionScheduleResetLog"("questionId", "resetAt" DESC, "id");
CREATE INDEX "QuestionScheduleResetLog_ownerId_resetAt_idx" ON "QuestionScheduleResetLog"("ownerId", "resetAt" DESC);

CREATE UNIQUE INDEX "QuestionImage_storageKey_key" ON "QuestionImage"("storageKey");
CREATE UNIQUE INDEX "QuestionImage_id_ownerId_key" ON "QuestionImage"("id", "ownerId");
CREATE INDEX "QuestionImage_ownerId_createdAt_idx" ON "QuestionImage"("ownerId", "createdAt" DESC);
CREATE INDEX "QuestionImage_unreferencedAt_idx" ON "QuestionImage"("unreferencedAt");

CREATE UNIQUE INDEX "QuestionImageReference_imageId_questionId_fieldType_key" ON "QuestionImageReference"("imageId", "questionId", "fieldType");
CREATE INDEX "QuestionImageReference_questionId_fieldType_idx" ON "QuestionImageReference"("questionId", "fieldType");
CREATE INDEX "QuestionImageReference_ownerId_imageId_idx" ON "QuestionImageReference"("ownerId", "imageId");

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "QuestionReviewTicket" ADD CONSTRAINT "QuestionReviewTicket_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QuestionReviewTicket" ADD CONSTRAINT "QuestionReviewTicket_questionId_ownerId_fkey" FOREIGN KEY ("questionId", "ownerId") REFERENCES "Question"("id", "ownerId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QuestionReviewTicket" ADD CONSTRAINT "QuestionReviewTicket_successorTicketId_ownerId_fkey" FOREIGN KEY ("successorTicketId", "ownerId") REFERENCES "QuestionReviewTicket"("id", "ownerId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "QuestionReviewLog" ADD CONSTRAINT "QuestionReviewLog_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QuestionReviewLog" ADD CONSTRAINT "QuestionReviewLog_questionId_ownerId_fkey" FOREIGN KEY ("questionId", "ownerId") REFERENCES "Question"("id", "ownerId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QuestionReviewLog" ADD CONSTRAINT "QuestionReviewLog_reviewKey_questionId_ownerId_fkey" FOREIGN KEY ("reviewKey", "questionId", "ownerId") REFERENCES "QuestionReviewTicket"("reviewKey", "questionId", "ownerId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "QuestionAttempt" ADD CONSTRAINT "QuestionAttempt_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QuestionAttempt" ADD CONSTRAINT "QuestionAttempt_questionId_ownerId_fkey" FOREIGN KEY ("questionId", "ownerId") REFERENCES "Question"("id", "ownerId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QuestionAttempt" ADD CONSTRAINT "QuestionAttempt_reviewLogId_questionId_ownerId_fkey" FOREIGN KEY ("reviewLogId", "questionId", "ownerId") REFERENCES "QuestionReviewLog"("id", "questionId", "ownerId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "QuestionScheduleResetLog" ADD CONSTRAINT "QuestionScheduleResetLog_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QuestionScheduleResetLog" ADD CONSTRAINT "QuestionScheduleResetLog_questionId_ownerId_fkey" FOREIGN KEY ("questionId", "ownerId") REFERENCES "Question"("id", "ownerId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "QuestionPreference" ADD CONSTRAINT "QuestionPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "QuestionImage" ADD CONSTRAINT "QuestionImage_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "QuestionImageReference" ADD CONSTRAINT "QuestionImageReference_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QuestionImageReference" ADD CONSTRAINT "QuestionImageReference_imageId_ownerId_fkey" FOREIGN KEY ("imageId", "ownerId") REFERENCES "QuestionImage"("id", "ownerId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QuestionImageReference" ADD CONSTRAINT "QuestionImageReference_questionId_ownerId_fkey" FOREIGN KEY ("questionId", "ownerId") REFERENCES "Question"("id", "ownerId") ON DELETE RESTRICT ON UPDATE CASCADE;
