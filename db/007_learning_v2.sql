-- Additive only: existing curriculum, progress, users and orders are immutable here.
CREATE TABLE IF NOT EXISTS learning_word_links (
 word_id text NOT NULL REFERENCES materials(id), phrase_id text NOT NULL REFERENCES materials(id),
 relation text NOT NULL CHECK(relation IN ('exact','inflection')), PRIMARY KEY(word_id,phrase_id)
);
CREATE INDEX IF NOT EXISTS learning_word_links_phrase ON learning_word_links(phrase_id);
CREATE TABLE IF NOT EXISTS learning_dialogue_links (
 phrase_id text NOT NULL REFERENCES materials(id), dialogue_id text NOT NULL REFERENCES curriculum_dialogues(id),
 relation text NOT NULL CHECK(relation IN ('exact_line','same_scene')), PRIMARY KEY(phrase_id,dialogue_id)
);
CREATE TABLE IF NOT EXISTS learning_pattern_variants (
 id text PRIMARY KEY, template_id text NOT NULL, template_en text NOT NULL, template_zh text NOT NULL,
 word_id text NOT NULL REFERENCES materials(id), english text NOT NULL, chinese text NOT NULL,
 is_free boolean NOT NULL, sort_order integer NOT NULL
);
CREATE TABLE IF NOT EXISTS learning_v2_installs (version text PRIMARY KEY, content_hash text NOT NULL);
CREATE TABLE IF NOT EXISTS learning_exercise_events (
 id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES users(id),request_id uuid NOT NULL,
 mode text NOT NULL CHECK(mode IN ('listening','expression','pattern')),
 material_id text REFERENCES materials(id),variant_id text REFERENCES learning_pattern_variants(id),
 succeeded boolean NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 CHECK((mode IN ('listening','expression') AND material_id IS NOT NULL AND variant_id IS NULL) OR (mode='pattern' AND material_id IS NULL AND variant_id IS NOT NULL)),
 UNIQUE(user_id,request_id)
);
CREATE TABLE IF NOT EXISTS learning_exercise_progress (
 user_id uuid NOT NULL REFERENCES users(id),mode text NOT NULL CHECK(mode IN ('listening','expression','pattern')),
 target_id text NOT NULL,attempts integer NOT NULL CHECK(attempts>0),successes integer NOT NULL CHECK(successes>=0 AND successes<=attempts),
 last_succeeded boolean NOT NULL,streak integer NOT NULL CHECK(streak>=0),
 next_review_at timestamptz NOT NULL,updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(user_id,mode,target_id)
);
CREATE INDEX IF NOT EXISTS learning_exercise_review ON learning_exercise_progress(user_id,mode,last_succeeded,next_review_at);
