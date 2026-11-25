ALTER TABLE payment_events DROP CONSTRAINT payment_events_event_type_check;
ALTER TABLE payment_events ADD COLUMN reason text;
ALTER TABLE payment_events ADD CONSTRAINT payment_events_type_reason_check CHECK (
  (event_type = 'CREATED' AND reason IS NULL) OR
  (event_type = 'VOIDED' AND reason IS NOT NULL AND length(btrim(reason)) BETWEEN 1 AND 2000)
);
CREATE UNIQUE INDEX payment_events_one_void ON payment_events(payment_id) WHERE event_type = 'VOIDED';