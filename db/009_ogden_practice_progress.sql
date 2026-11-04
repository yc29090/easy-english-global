-- Additive: mode-specific review schedules do not change shared mastery or legacy records.
CREATE TABLE IF NOT EXISTS ogden_practice_progress(
 user_id uuid NOT NULL REFERENCES users(id), item_id text NOT NULL REFERENCES ogden_items(id),
 mode text NOT NULL CHECK(mode IN ('study','build','express','listening','speaking')),
 status text NOT NULL CHECK(status IN ('learned','mastered','unmastered','review')),
 mastery_streak integer NOT NULL DEFAULT 0 CHECK(mastery_streak>=0),
 next_review_at timestamptz NOT NULL,attempts integer NOT NULL CHECK(attempts>0),
 updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(user_id,item_id,mode)
);
CREATE INDEX IF NOT EXISTS ogden_mode_due ON ogden_practice_progress(user_id,mode,next_review_at);
-- Existing events remain immutable. Old mode histories become conservatively due for review;
-- their previous shared progress/status/schedule is left exactly as it was.
WITH ranked AS (
 SELECT user_id,item_id,mode,status,created_at,
 count(*) OVER(PARTITION BY user_id,item_id,mode)::int AS attempts,
 row_number() OVER(PARTITION BY user_id,item_id,mode ORDER BY created_at DESC,request_id DESC) AS position
 FROM ogden_practice_events
)
INSERT INTO ogden_practice_progress(user_id,item_id,mode,status,mastery_streak,next_review_at,attempts,updated_at)
 SELECT user_id,item_id,mode,status,CASE WHEN status='mastered' THEN 1 ELSE 0 END,created_at,attempts,created_at
 FROM ranked WHERE position=1
 ON CONFLICT(user_id,item_id,mode) DO NOTHING;
