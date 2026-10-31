CREATE TABLE IF NOT EXISTS users (
 id uuid PRIMARY KEY, email text NOT NULL UNIQUE, password_hash text NOT NULL,
 role text NOT NULL DEFAULT 'user' CHECK(role IN ('user','admin')),
 membership text NOT NULL DEFAULT 'free' CHECK(membership IN ('free','trial','lifetime')),
 trial_until timestamptz, disabled boolean NOT NULL DEFAULT false,
 must_change_password boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS password_resets (
 token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS scenes (
 id text PRIMARY KEY, title_en text NOT NULL, title_zh text NOT NULL,
 category text NOT NULL CHECK(category IN ('life','business'))
);
CREATE TABLE IF NOT EXISTS materials (
 id text PRIMARY KEY, kind text NOT NULL CHECK(kind IN ('word','phrase')),
 english text NOT NULL, chinese text NOT NULL, scene_id text NOT NULL REFERENCES scenes(id),
 is_free boolean NOT NULL DEFAULT false, audio_normal text, audio_slow text,
 UNIQUE(kind, english)
);
CREATE TABLE IF NOT EXISTS progress (
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 material_id text NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
 status text NOT NULL CHECK(status IN ('learned','unmastered','mastered','review')),
 updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,material_id)
);
CREATE TABLE IF NOT EXISTS orders (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), amount_fen integer NOT NULL DEFAULT 9900 CHECK(amount_fen=9900),
 currency text NOT NULL DEFAULT 'CNY' CHECK(currency='CNY'), status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','mock_paid')),
 created_at timestamptz NOT NULL DEFAULT now(), paid_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS one_pending_order ON orders(user_id) WHERE status='pending';
CREATE TABLE IF NOT EXISTS audit_log (
 id uuid PRIMARY KEY, actor_id uuid NOT NULL REFERENCES users(id), target_id uuid REFERENCES users(id),
 action text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS rate_limits (
 key text PRIMARY KEY, hits integer NOT NULL, expires_at timestamptz NOT NULL
);
