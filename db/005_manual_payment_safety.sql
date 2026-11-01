-- Preserve every order and all account/content data. If inconsistent legacy
-- orders exist, index creation fails and the entire migration rolls back.
DROP INDEX IF EXISTS one_pending_order;
CREATE UNIQUE INDEX IF NOT EXISTS one_pending_mock_order ON orders(user_id)
 WHERE status='pending' AND payment_method IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS one_active_manual_order ON orders(user_id)
 WHERE status IN ('pending','payment_claimed') AND payment_method IS NOT NULL;
CREATE TABLE IF NOT EXISTS order_notifications (
 order_id uuid PRIMARY KEY REFERENCES orders(id),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','sent','failed')),
 attempts integer NOT NULL DEFAULT 0,
 updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO order_notifications(order_id)
 SELECT id FROM orders WHERE payment_method IS NOT NULL AND status='payment_claimed'
 ON CONFLICT DO NOTHING;
