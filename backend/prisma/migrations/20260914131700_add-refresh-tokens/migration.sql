-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: add-refresh-tokens
--
-- Decision log
-- ============
-- Storage engine : Postgres table (not Redis) — keeps auth state durable and
--                  queryable without an extra infrastructure dependency.
-- Expiry policy  : Filter, don't auto-delete.
--                  Every token lookup WHERE expiry > NOW() AND revoked = FALSE.
--                  Stale rows are swept lazily: run the DELETE below on login,
--                  or schedule it as a cron job — both are safe.
--
--   DELETE FROM "RefreshToken" WHERE expiry < NOW();
--
-- ─────────────────────────────────────────────────────────────────────────────

-- CreateTable
CREATE TABLE "RefreshToken" (
    -- opaque random value (e.g. crypto.randomBytes(32).toString('hex'))
    "token"     TEXT        NOT NULL,

    -- who owns this token
    "ownerId"   TEXT        NOT NULL,

    -- absolute UTC instant the token expires (set to NOW() + 7 days on issue)
    "expiry"    TIMESTAMP(3) NOT NULL,

    -- set to TRUE when the token is consumed during rotation or explicit logout
    "revoked"   BOOLEAN     NOT NULL DEFAULT false,

    -- audit: when was this token first issued
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("token")
);

-- Index: per-user lookups (logout-all / token rotation)
CREATE INDEX "RefreshToken_ownerId_idx" ON "RefreshToken"("ownerId");

-- Index: fast bulk expiry sweeps
CREATE INDEX "RefreshToken_expiry_idx" ON "RefreshToken"("expiry");

-- Foreign key → User; CASCADE so tokens vanish when a user account is deleted
ALTER TABLE "RefreshToken"
    ADD CONSTRAINT "RefreshToken_ownerId_fkey"
    FOREIGN KEY ("ownerId")
    REFERENCES "User"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;
