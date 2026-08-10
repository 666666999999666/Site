-- Remote Markdown import replaces the legacy fixed-credential stdio importer.
-- Existing clients must reconnect so the new draft:import scope is explicitly consented.
UPDATE "McpCredential"
SET
  "scopes" = array_replace("scopes", 'draft:create', 'draft:import'),
  "revokedAt" = COALESCE("revokedAt", CURRENT_TIMESTAMP),
  "updatedAt" = CURRENT_TIMESTAMP
WHERE 'draft:create' = ANY("scopes");

-- Every OAuth client must explicitly consent to the new import scope. Revoking
-- all OAuth credential records also makes any still-valid JWT fail immediately.
UPDATE "McpCredential"
SET
  "revokedAt" = COALESCE("revokedAt", CURRENT_TIMESTAMP),
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "kind" = 'OAUTH';

UPDATE "McpApproval"
SET "requiredScope" = 'draft:import'
WHERE "requiredScope" = 'draft:create';

DELETE FROM "OauthClient";
