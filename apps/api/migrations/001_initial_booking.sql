CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE service_type (
    id text PRIMARY KEY,
    name text NOT NULL,
    description text NOT NULL DEFAULT '',
    duration_minutes integer NOT NULL CHECK (duration_minutes > 0),
    pre_buffer_minutes integer NOT NULL DEFAULT 0 CHECK (pre_buffer_minutes >= 0),
    post_buffer_minutes integer NOT NULL DEFAULT 0 CHECK (post_buffer_minutes >= 0),
    booking_mode text NOT NULL DEFAULT 'request' CHECK (booking_mode IN ('request','direct')),
    deposit_tier text NOT NULL DEFAULT 'NONE' CHECK (deposit_tier IN ('NONE','D50','D100','D150')),
    deposit_cents integer NOT NULL DEFAULT 0 CHECK (deposit_cents >= 0),
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE artist (
    id text PRIMARY KEY,
    display_name text NOT NULL,
    bio text NOT NULL DEFAULT '',
    timezone text NOT NULL DEFAULT 'Europe/Berlin',
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE resource (
    id text PRIMARY KEY,
    name text NOT NULL,
    kind text NOT NULL CHECK (kind IN ('station','consult')),
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE artist_service (
    artist_id text NOT NULL REFERENCES artist(id),
    service_type_id text NOT NULL REFERENCES service_type(id),
    PRIMARY KEY (artist_id, service_type_id)
);

CREATE TABLE availability_rule (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    artist_id text NOT NULL REFERENCES artist(id),
    weekday integer NOT NULL CHECK (weekday BETWEEN 1 AND 7),
    start_local time NOT NULL,
    end_local time NOT NULL,
    valid_from date NOT NULL,
    valid_to date,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (end_local > start_local)
);

CREATE TABLE blocked_period (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    artist_id text REFERENCES artist(id),
    resource_id text REFERENCES resource(id),
    starts_at timestamptz NOT NULL,
    ends_at timestamptz NOT NULL,
    reason text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (ends_at > starts_at),
    CHECK (num_nonnulls(artist_id, resource_id) >= 1)
);

CREATE TABLE customer (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    chayns_person_id text UNIQUE,
    first_name text NOT NULL,
    last_name text NOT NULL,
    email text NOT NULL,
    phone text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE appointment_block (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    artist_id text NOT NULL REFERENCES artist(id),
    resource_id text NOT NULL REFERENCES resource(id),
    service_type_id text NOT NULL REFERENCES service_type(id),
    customer_id uuid NOT NULL REFERENCES customer(id),
    starts_at timestamptz NOT NULL,
    ends_at timestamptz NOT NULL,
    session_starts_at timestamptz NOT NULL,
    session_ends_at timestamptz NOT NULL,
    status text NOT NULL CHECK (status IN ('HELD','PAYMENT_PENDING','CONFIRMED','COMPLETED','EXPIRED','CANCELLED')),
    expires_at timestamptz,
    hold_client_token text,
    idempotency_key text,
    deposit_cents integer NOT NULL DEFAULT 0 CHECK (deposit_cents >= 0),
    decline_reason text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (ends_at > starts_at)
);

ALTER TABLE appointment_block
  ADD CONSTRAINT appointment_block_artist_no_overlap
  EXCLUDE USING gist (artist_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&)
  WHERE (status IN ('HELD','PAYMENT_PENDING','CONFIRMED'));

ALTER TABLE appointment_block
  ADD CONSTRAINT appointment_block_resource_no_overlap
  EXCLUDE USING gist (resource_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&)
  WHERE (status IN ('HELD','PAYMENT_PENDING','CONFIRMED'));

CREATE INDEX appointment_block_expiry_idx ON appointment_block (status, expires_at);
CREATE INDEX appointment_block_client_token_idx ON appointment_block (hold_client_token) WHERE hold_client_token IS NOT NULL;
CREATE INDEX appointment_block_artist_start_idx ON appointment_block (artist_id, starts_at);

CREATE TABLE appointment (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    block_id uuid NOT NULL UNIQUE REFERENCES appointment_block(id),
    service_type_id text NOT NULL REFERENCES service_type(id),
    customer_status text NOT NULL DEFAULT 'BOOKED'
        CHECK (customer_status IN ('BOOKED','CHECKED_IN','DONE','NO_SHOW')),
    deposit_received_cents integer CHECK (deposit_received_cents >= 0),
    deposit_received_at timestamptz,
    deposit_method text,
    notes text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE idempotency_key (
    key text PRIMARY KEY,
    route text NOT NULL,
    request_hash text NOT NULL,
    response_json jsonb NOT NULL,
    status_code integer NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL
);

CREATE TABLE outbox_event (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    type text NOT NULL,
    payload jsonb NOT NULL,
    status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','SENT','FAILED')),
    attempts integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    sent_at timestamptz
);
CREATE INDEX outbox_event_pending_idx ON outbox_event (created_at) WHERE status = 'PENDING';

CREATE TABLE audit_event (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    actor text NOT NULL,
    action text NOT NULL,
    entity_type text NOT NULL,
    entity_id text NOT NULL,
    before jsonb,
    after jsonb,
    at timestamptz NOT NULL DEFAULT now()
);

-- Legacy: abgelöst durch Spec C (Anfrage-Wizard). Hält den alten
-- /api/v1/booking-requests-Postgres-Pfad funktionsfähig.
CREATE TABLE booking_request (
    id uuid PRIMARY KEY,
    service_type_id text NOT NULL REFERENCES service_type(id),
    slot_id text NOT NULL,
    requested_starts_at timestamptz NOT NULL,
    requested_ends_at timestamptz NOT NULL,
    customer_first_name text NOT NULL,
    customer_last_name text NOT NULL,
    customer_email text NOT NULL,
    customer_phone text NOT NULL,
    tattoo_idea text NOT NULL,
    chayns_person_id text,
    status text NOT NULL DEFAULT 'submitted',
    accepted_terms_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (requested_ends_at > requested_starts_at)
);
