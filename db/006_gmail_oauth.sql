-- Additive only: preserve administrators, users, orders, learning and curriculum.
CREATE TABLE IF NOT EXISTS gmail_oauth_states (
 state_hash text PRIMARY KEY, admin_id uuid NOT NULL REFERENCES users(id),
 session_hash text NOT NULL, encrypted_verifier text NOT NULL,
 expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS gmail_oauth_states_expiry ON gmail_oauth_states(expires_at);
CREATE TABLE IF NOT EXISTS gmail_credentials (
 id text PRIMARY KEY CHECK(id='owner'), admin_id uuid NOT NULL REFERENCES users(id),
 sender text NOT NULL CHECK(sender='sdqtyc@gmail.com'),
 encrypted_refresh_token text NOT NULL, client_id_hash text NOT NULL,
 connected_at timestamptz NOT NULL DEFAULT now(), tested_at timestamptz
);
