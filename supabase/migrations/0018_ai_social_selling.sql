-- AI social selling & conversational checkout engine.
-- Adds `social_channels` (Facebook / Instagram / WhatsApp connections) and
-- `ai_chat_sessions` (conversational checkout threads) defined in
-- src/db/schema.ts and used by /api/webhooks/social and
-- src/lib/ai/social-sales-bot.ts.
-- Safe to run repeatedly (all statements are idempotent).

CREATE TABLE IF NOT EXISTS social_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  platform text NOT NULL,
  access_token text DEFAULT '',
  page_id text DEFAULT '',
  page_key text DEFAULT '',
  is_connected boolean NOT NULL DEFAULT FALSE,
  is_auto_reply_enabled boolean NOT NULL DEFAULT TRUE,
  ai_persona_prompt text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS social_channels_store_platform_unique
  ON social_channels(store_id, platform);
CREATE INDEX IF NOT EXISTS social_channels_store_id_idx ON social_channels(store_id);
CREATE INDEX IF NOT EXISTS social_channels_page_key_idx ON social_channels(page_key);

CREATE TABLE IF NOT EXISTS ai_chat_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  customer_phone_or_psid text NOT NULL,
  customer_name text DEFAULT '',
  platform text NOT NULL,
  conversation_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  extracted_order_data jsonb NOT NULL DEFAULT '{"items":[],"address":"","phone":"","name":""}'::jsonb,
  status text NOT NULL DEFAULT 'ACTIVE',
  order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ai_chat_sessions_thread_unique
  ON ai_chat_sessions(store_id, platform, customer_phone_or_psid);
CREATE INDEX IF NOT EXISTS ai_chat_sessions_store_id_idx ON ai_chat_sessions(store_id);
CREATE INDEX IF NOT EXISTS ai_chat_sessions_status_idx ON ai_chat_sessions(status);
