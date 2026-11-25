ALTER TABLE shared_drafts ADD COLUMN status text NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','CONFIRMED'));
ALTER TABLE shared_drafts ADD COLUMN confirmed_batch_id uuid;
ALTER TABLE shared_drafts ADD COLUMN confirmed_by uuid REFERENCES users(id);
ALTER TABLE shared_drafts ADD COLUMN confirmation_key uuid UNIQUE;
ALTER TABLE shared_drafts ADD CONSTRAINT shared_drafts_confirmation_consistency CHECK(
 (status='OPEN' AND confirmed_batch_id IS NULL AND confirmed_by IS NULL AND confirmation_key IS NULL) OR
 (status='CONFIRMED' AND confirmed_batch_id IS NOT NULL AND confirmed_by IS NOT NULL AND confirmation_key IS NOT NULL)
);
