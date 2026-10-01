-- Phase 4: Custom Domains Integration
-- Safe to run repeatedly (all statements are idempotent).

-- Custom domain for store (e.g., shop.example.com)
ALTER TABLE stores ADD COLUMN IF NOT EXISTS custom_domain TEXT UNIQUE;

-- Verification status of the custom domain (DNS records verified)
ALTER TABLE stores ADD COLUMN IF NOT EXISTS custom_domain_verified BOOLEAN NOT NULL DEFAULT FALSE;

-- Index for faster lookups when resolving custom domains in middleware
CREATE INDEX IF NOT EXISTS idx_stores_custom_domain ON stores(custom_domain);