CREATE TABLE inquiry (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    service_type_id text NOT NULL REFERENCES service_type(id),
    preferred_artist_id text REFERENCES artist(id),
    preferred_starts_at timestamptz,
    size_cm integer CHECK (size_cm > 0),
    description text NOT NULL DEFAULT '',
    status text NOT NULL CHECK (status IN ('NEW','IN_REVIEW','NEEDS_INFO','ACCEPTED','DECLINED')),
    studio_note text,
    needs_info_message text,
    decline_reason text,
    customer_id uuid NOT NULL REFERENCES customer(id),
    client_token text NOT NULL,
    accepted_terms_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX inquiry_status_created_idx ON inquiry (status, created_at DESC);

CREATE TABLE inquiry_region (
    inquiry_id uuid NOT NULL REFERENCES inquiry(id) ON DELETE CASCADE,
    region_code text NOT NULL,
    PRIMARY KEY (inquiry_id, region_code)
);

CREATE TABLE media_asset (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    purpose text NOT NULL CHECK (purpose IN ('inquiry_reference')),
    inquiry_id uuid REFERENCES inquiry(id) ON DELETE CASCADE,
    storage_key text NOT NULL,
    content_type text NOT NULL,
    original_filename text,
    byte_size integer NOT NULL CHECK (byte_size > 0),
    width integer,
    height integer,
    client_token text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    linked_at timestamptz
);
CREATE INDEX media_asset_inquiry_idx ON media_asset (inquiry_id);
CREATE INDEX media_asset_orphan_idx ON media_asset (created_at) WHERE inquiry_id IS NULL;

-- Legacy-Anfragepfad abgelöst durch die inquiry-Tabelle.
DROP TABLE IF EXISTS booking_request;
