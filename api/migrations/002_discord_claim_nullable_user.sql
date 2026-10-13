BEGIN;
-- Claim codes are created before a Discord identity is known. The bot binds the user atomically when claimed.
ALTER TABLE discord_links ALTER COLUMN discord_user_id DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS discord_links_order_unique_idx ON discord_links(order_id);
COMMIT;
