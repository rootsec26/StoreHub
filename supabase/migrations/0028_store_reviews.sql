-- Store reviews: shoppers rate a storefront 1-5 stars with an optional comment.
-- Safe to run repeatedly (all statements are idempotent).

CREATE TABLE IF NOT EXISTS store_reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  customer_name TEXT NOT NULL DEFAULT '',
  rating INTEGER NOT NULL DEFAULT 5,
  comment TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS store_reviews_store_id_idx
  ON store_reviews(store_id);
CREATE INDEX IF NOT EXISTS store_reviews_created_at_idx
  ON store_reviews(created_at);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.store_reviews'::regclass
      AND conname = 'store_reviews_rating_range'
  ) THEN
    ALTER TABLE store_reviews
      ADD CONSTRAINT store_reviews_rating_range CHECK (rating BETWEEN 1 AND 5);
  END IF;
END $$;
