-- Independent Modern Basic English namespace. No writes to legacy tables.
CREATE TABLE ogden_sources(id text PRIMARY KEY, details jsonb NOT NULL);
CREATE TABLE ogden_original_references(id text PRIMARY KEY, source_id text NOT NULL REFERENCES ogden_sources(id), details jsonb NOT NULL);
CREATE TABLE ogden_items(
 id text PRIMARY KEY, kind text NOT NULL CHECK(kind IN ('word','operator','pattern','combination','expression')),
 version integer NOT NULL CHECK(version>0), payload jsonb NOT NULL,
 review_status text NOT NULL CHECK(review_status IN ('draft','approved','retired'))
);
CREATE TABLE ogden_item_versions(
 item_id text NOT NULL REFERENCES ogden_items(id), version integer NOT NULL,
 payload jsonb NOT NULL, PRIMARY KEY(item_id,version)
);
CREATE TABLE ogden_content_reviews(
 id text PRIMARY KEY, item_id text NOT NULL REFERENCES ogden_items(id), version integer NOT NULL,
 status text NOT NULL CHECK(status IN ('draft','approved','rejected')), reviewer text NOT NULL,
 notes text NOT NULL, reviewed_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(item_id,version) REFERENCES ogden_item_versions(item_id,version)
);
CREATE TABLE ogden_installs(version text PRIMARY KEY, content_hash text NOT NULL);
CREATE TABLE ogden_progress(
 user_id uuid NOT NULL REFERENCES users(id), item_id text NOT NULL REFERENCES ogden_items(id),
 status text NOT NULL CHECK(status IN ('learned','mastered','unmastered','review')),
 mastery_streak integer NOT NULL DEFAULT 0 CHECK(mastery_streak>=0),
 next_review_at timestamptz NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,item_id)
);
CREATE INDEX ogden_due ON ogden_progress(user_id,next_review_at);
CREATE TABLE ogden_practice_events(
 user_id uuid NOT NULL REFERENCES users(id), request_id uuid NOT NULL,
 item_id text NOT NULL REFERENCES ogden_items(id), item_version integer NOT NULL,
 mode text NOT NULL CHECK(mode IN ('study','build','express','listening','speaking')),
 status text NOT NULL CHECK(status IN ('learned','mastered','unmastered','review')),
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,request_id),
 FOREIGN KEY(item_id,item_version) REFERENCES ogden_item_versions(item_id,version)
);
