CREATE TABLE users (
 id TEXT PRIMARY KEY,
 email TEXT NOT NULL UNIQUE COLLATE NOCASE,
 created_at INTEGER NOT NULL
) STRICT;
CREATE TABLE email_codes (
 email TEXT PRIMARY KEY COLLATE NOCASE,
 code_hash TEXT NOT NULL,
 salt TEXT NOT NULL,
 expires_at INTEGER NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0,
 sent_at INTEGER NOT NULL
) STRICT;
CREATE TABLE sessions (
 token_hash TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 expires_at INTEGER NOT NULL,
 created_at INTEGER NOT NULL
) STRICT;
CREATE INDEX sessions_user ON sessions(user_id);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE TABLE user_items (
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 item_id INTEGER NOT NULL CHECK(item_id>0),
 status TEXT CHECK(status IN ('saved','watched')),
 rating TEXT CHECK(rating IN ('like','dislike')),
 corrections TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(corrections)),
 card TEXT CHECK(card IS NULL OR json_valid(card)),
 updated_at INTEGER NOT NULL,
 PRIMARY KEY(user_id,item_id)
) STRICT;
CREATE INDEX items_user_status ON user_items(user_id,status,updated_at);
CREATE TABLE rate_limits (
 bucket TEXT PRIMARY KEY,
 count INTEGER NOT NULL,
 expires_at INTEGER NOT NULL
) STRICT;
