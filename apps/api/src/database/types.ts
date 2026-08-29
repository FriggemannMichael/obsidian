import type { ColumnType } from 'kysely';

type Timestamp = ColumnType<Date, Date | string, Date | string>;

export interface BookingRequestTable {
    id: string;
    service_type_id: string;
    slot_id: string;
    requested_starts_at: Timestamp;
    requested_ends_at: Timestamp;
    customer_first_name: string;
    customer_last_name: string;
    customer_email: string;
    customer_phone: string;
    tattoo_idea: string;
    chayns_person_id: string | null;
    status: 'submitted' | 'in_review' | 'accepted' | 'declined' | 'cancelled';
    accepted_terms_at: Timestamp;
    created_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface Database {
    booking_request: BookingRequestTable;
}
