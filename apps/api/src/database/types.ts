import type { ColumnType, Generated } from 'kysely';

type Ts = ColumnType<Date, Date | string, Date | string>;
type TsDefault = ColumnType<Date, Date | string | undefined, Date | string>;

export interface ServiceTypeTable {
    id: string;
    name: string;
    description: ColumnType<string, string | undefined, string>;
    duration_minutes: number;
    pre_buffer_minutes: ColumnType<number, number | undefined, number>;
    post_buffer_minutes: ColumnType<number, number | undefined, number>;
    booking_mode: ColumnType<'request' | 'direct', 'request' | 'direct' | undefined, 'request' | 'direct'>;
    deposit_tier: ColumnType<
        'NONE' | 'D50' | 'D100' | 'D150',
        'NONE' | 'D50' | 'D100' | 'D150' | undefined,
        string
    >;
    deposit_cents: ColumnType<number, number | undefined, number>;
    active: ColumnType<boolean, boolean | undefined, boolean>;
    created_at: TsDefault;
}

export interface ArtistTable {
    id: string;
    display_name: string;
    bio: ColumnType<string, string | undefined, string>;
    timezone: ColumnType<string, string | undefined, string>;
    active: ColumnType<boolean, boolean | undefined, boolean>;
    created_at: TsDefault;
}

export interface ResourceTable {
    id: string;
    name: string;
    kind: 'station' | 'consult';
    active: ColumnType<boolean, boolean | undefined, boolean>;
    created_at: TsDefault;
}

export interface ArtistServiceTable {
    artist_id: string;
    service_type_id: string;
}

export interface AvailabilityRuleTable {
    id: Generated<string>;
    artist_id: string;
    weekday: number;
    start_local: string;
    end_local: string;
    valid_from: ColumnType<string, string, string>;
    valid_to: ColumnType<string | null, string | null, string | null>;
    created_at: TsDefault;
}

export interface BlockedPeriodTable {
    id: Generated<string>;
    artist_id: string | null;
    resource_id: string | null;
    starts_at: Ts;
    ends_at: Ts;
    reason: ColumnType<string, string | undefined, string>;
    created_at: TsDefault;
}

export interface CustomerTable {
    id: Generated<string>;
    chayns_person_id: string | null;
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    created_at: TsDefault;
}

export type BlockStatus =
    | 'HELD'
    | 'PAYMENT_PENDING'
    | 'CONFIRMED'
    | 'COMPLETED'
    | 'EXPIRED'
    | 'CANCELLED';

export interface AppointmentBlockTable {
    id: Generated<string>;
    artist_id: string;
    resource_id: string;
    service_type_id: string;
    customer_id: string;
    starts_at: Ts;
    ends_at: Ts;
    session_starts_at: Ts;
    session_ends_at: Ts;
    status: BlockStatus;
    expires_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
    hold_client_token: string | null;
    idempotency_key: string | null;
    deposit_cents: ColumnType<number, number | undefined, number>;
    decline_reason: string | null;
    created_at: TsDefault;
    updated_at: TsDefault;
}

export interface AppointmentTable {
    id: Generated<string>;
    block_id: string;
    service_type_id: string;
    customer_status: ColumnType<
        'BOOKED' | 'CHECKED_IN' | 'DONE' | 'NO_SHOW',
        string | undefined,
        string
    >;
    deposit_received_cents: number | null;
    deposit_received_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
    deposit_method: string | null;
    notes: string | null;
    created_at: TsDefault;
}

export interface IdempotencyKeyTable {
    key: string;
    route: string;
    request_hash: string;
    response_json: ColumnType<unknown, string, string>;
    status_code: number;
    created_at: TsDefault;
    expires_at: Ts;
}

export interface OutboxEventTable {
    id: Generated<string>;
    type: string;
    payload: ColumnType<unknown, string, string>;
    status: ColumnType<'PENDING' | 'SENT' | 'FAILED', string | undefined, string>;
    attempts: ColumnType<number, number | undefined, number>;
    created_at: TsDefault;
    sent_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
}

export interface AuditEventTable {
    id: Generated<string>;
    actor: string;
    action: string;
    entity_type: string;
    entity_id: string;
    before: ColumnType<unknown, string | null, string | null>;
    after: ColumnType<unknown, string | null, string | null>;
    at: TsDefault;
}

export interface BookingRequestTable {
    id: string;
    service_type_id: string;
    slot_id: string;
    requested_starts_at: Ts;
    requested_ends_at: Ts;
    customer_first_name: string;
    customer_last_name: string;
    customer_email: string;
    customer_phone: string;
    tattoo_idea: string;
    chayns_person_id: string | null;
    status: ColumnType<string, string | undefined, string>;
    accepted_terms_at: Ts;
    created_at: TsDefault;
}

export interface Database {
    service_type: ServiceTypeTable;
    artist: ArtistTable;
    resource: ResourceTable;
    artist_service: ArtistServiceTable;
    availability_rule: AvailabilityRuleTable;
    blocked_period: BlockedPeriodTable;
    customer: CustomerTable;
    appointment_block: AppointmentBlockTable;
    appointment: AppointmentTable;
    idempotency_key: IdempotencyKeyTable;
    outbox_event: OutboxEventTable;
    audit_event: AuditEventTable;
    booking_request: BookingRequestTable;
}
