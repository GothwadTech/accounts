-- Run after SQL 11. Additive: preserve existing Google links and support multiple accounts.
-- One Google identity can authorize many Gothwad accounts; each account has one Google link.
CREATE TABLE IF NOT EXISTS auth_external_account_links (
    issuer TEXT NOT NULL, subject TEXT NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider_email TEXT NOT NULL, created_at TEXT NOT NULL,
    created_passwordless INTEGER NOT NULL DEFAULT 0 CHECK (created_passwordless IN (0, 1)),
    PRIMARY KEY (issuer, user_id)
);
CREATE INDEX IF NOT EXISTS idx_external_accounts_subject ON auth_external_account_links(issuer, subject);
CREATE TABLE IF NOT EXISTS auth_schema_versions (version TEXT PRIMARY KEY);
INSERT OR IGNORE INTO auth_external_account_links
    (issuer, subject, user_id, provider_email, created_at, created_passwordless)
    SELECT issuer, subject, user_id, provider_email, created_at, created_passwordless FROM auth_external_identities
    WHERE NOT EXISTS (SELECT 1 FROM auth_schema_versions WHERE version = '12_google_account_links');
INSERT OR IGNORE INTO auth_schema_versions (version) VALUES ('12_google_account_links');

