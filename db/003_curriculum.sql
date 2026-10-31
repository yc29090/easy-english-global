-- Preserve all rows and identifiers. New curriculum is installed separately.
ALTER TABLE scenes DROP CONSTRAINT IF EXISTS scenes_category_check;
ALTER TABLE scenes ADD CONSTRAINT scenes_category_check CHECK(category IN ('life','travel','business'));
ALTER TABLE scenes ADD COLUMN IF NOT EXISTS difficulty integer NOT NULL DEFAULT 1 CHECK(difficulty BETWEEN 1 AND 3);
ALTER TABLE scenes ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
ALTER TABLE materials ADD COLUMN IF NOT EXISTS difficulty integer NOT NULL DEFAULT 1 CHECK(difficulty BETWEEN 1 AND 3);
CREATE TABLE IF NOT EXISTS curriculum_dialogues (
 id text PRIMARY KEY,
 scene_id text NOT NULL REFERENCES scenes(id),
 title_en text NOT NULL, title_zh text NOT NULL,
 category text NOT NULL CHECK(category IN ('life','travel','business')),
 difficulty integer NOT NULL CHECK(difficulty BETWEEN 1 AND 3),
 is_free boolean NOT NULL DEFAULT false,
 roles jsonb NOT NULL, turns jsonb NOT NULL,
 sort_order integer NOT NULL
);
CREATE INDEX IF NOT EXISTS curriculum_dialogue_scene ON curriculum_dialogues(scene_id,sort_order);
CREATE TABLE IF NOT EXISTS curriculum_installs (
 version text PRIMARY KEY, content_hash text NOT NULL, installed_at timestamptz NOT NULL DEFAULT now()
);
