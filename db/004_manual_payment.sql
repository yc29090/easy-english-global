-- Manual-payment claims are never proof of settlement.
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK(status IN ('pending','mock_paid','payment_claimed','paid','rejected'));
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS claimed_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES users(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
ALTER TABLE orders ADD CONSTRAINT orders_payment_method_check CHECK(payment_method IS NULL OR payment_method IN ('wechat','alipay'));
CREATE INDEX IF NOT EXISTS orders_manual_review_idx ON orders(claimed_at DESC) WHERE status='payment_claimed';
