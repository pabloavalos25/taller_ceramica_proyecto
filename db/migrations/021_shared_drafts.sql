CREATE TABLE shared_drafts (
 id uuid PRIMARY KEY, kind text NOT NULL CHECK(kind IN ('KILN','MATERIAL')),
 data jsonb NOT NULL CHECK(jsonb_typeof(data)='object'), version integer NOT NULL CHECK(version>0),
 created_by uuid NOT NULL, updated_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(created_by) REFERENCES users(id), FOREIGN KEY(updated_by) REFERENCES users(id)
);
CREATE INDEX shared_drafts_kind_updated_idx ON shared_drafts(kind,updated_at DESC,id DESC);
CREATE TABLE shared_draft_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), draft_id uuid NOT NULL REFERENCES shared_drafts(id),
 actor_id uuid NOT NULL, actor_role text NOT NULL DEFAULT 'ADMIN' CHECK(actor_role='ADMIN'),
 idempotency_key uuid NOT NULL UNIQUE, request_fingerprint text NOT NULL CHECK(request_fingerprint ~ '^[0-9a-f]{64}$'),
 result_version integer NOT NULL CHECK(result_version>0), created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(actor_id,actor_role) REFERENCES users(id,role)
);
