CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE service_type (
    id text PRIMARY KEY,
    name text NOT NULL,
    duration_minutes integer NOT NULL CHECK (duration_minutes > 0),
    deposit_cents integer NOT NULL CHECK (deposit_cents >= 0),
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO service_type (id, name, duration_minutes, deposit_cents)
VALUES
    ('consultation', 'Tattoo-Beratung', 30, 0),
    ('small-tattoo', 'Kleines Tattoo', 120, 5000),
    ('day-session', 'Tagessitzung', 360, 15000)
ON CONFLICT (id) DO NOTHING;

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
    status text NOT NULL DEFAULT 'submitted'
        CHECK (status IN ('submitted', 'in_review', 'accepted', 'declined', 'cancelled')),
    accepted_terms_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (requested_ends_at > requested_starts_at)
);

CREATE INDEX booking_request_status_created_idx
    ON booking_request (status, created_at DESC);

CREATE INDEX booking_request_chayns_person_idx
    ON booking_request (chayns_person_id)
    WHERE chayns_person_id IS NOT NULL;

CREATE TABLE bookable_resource (
    id text PRIMARY KEY,
    name text NOT NULL,
    timezone text NOT NULL DEFAULT 'Europe/Berlin',
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO bookable_resource (id, name)
VALUES ('main-studio', 'Tattoo Studio')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE appointment_hold (
    id uuid PRIMARY KEY,
    booking_request_id uuid NOT NULL REFERENCES booking_request(id),
    resource_id text NOT NULL REFERENCES bookable_resource(id),
    starts_at timestamptz NOT NULL,
    ends_at timestamptz NOT NULL,
    expires_at timestamptz NOT NULL,
    status text NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'converted', 'expired', 'cancelled')),
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (ends_at > starts_at),
    CHECK (expires_at > created_at),
    EXCLUDE USING gist (
        resource_id WITH =,
        tstzrange(starts_at, ends_at, '[)') WITH &&
    ) WHERE (status IN ('active', 'converted'))
);

CREATE INDEX appointment_hold_expiry_idx
    ON appointment_hold (expires_at)
    WHERE status = 'active';
