-- Add indexes for common query patterns
CREATE INDEX idx_event_pubkey ON Event(pubkey);
CREATE INDEX idx_event_kind ON Event(kind);
CREATE INDEX idx_event_created_at ON Event(created_at);
CREATE INDEX idx_event_pubkey_kind ON Event(pubkey, kind);
