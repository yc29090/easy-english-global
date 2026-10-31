-- Additive migration: never drop accounts, curriculum, membership or progress.
ALTER TABLE progress ADD COLUMN IF NOT EXISTS next_review_at timestamptz;
ALTER TABLE progress ADD COLUMN IF NOT EXISTS mastery_streak integer NOT NULL DEFAULT 0;
UPDATE progress SET next_review_at=updated_at + CASE status
 WHEN 'unmastered' THEN interval '10 minutes'
 WHEN 'review' THEN interval '1 hour'
 WHEN 'mastered' THEN interval '3 days'
 ELSE interval '1 day' END WHERE next_review_at IS NULL;
ALTER TABLE progress ALTER COLUMN next_review_at SET NOT NULL;
CREATE INDEX IF NOT EXISTS progress_review_due ON progress(user_id,next_review_at);
ALTER TABLE materials ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS learning_state (
 user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 last_material_id text REFERENCES materials(id) ON DELETE SET NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS practice_progress (
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 dialogue_id text NOT NULL,
 role text NOT NULL CHECK(role IN ('a','b')),
 turn_index integer NOT NULL CHECK(turn_index>=0),
 completed_count integer NOT NULL DEFAULT 0 CHECK(completed_count>=0),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,dialogue_id)
);
