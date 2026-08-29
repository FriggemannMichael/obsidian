import { randomUUID } from 'node:crypto';
import type { BookingRequest, CreateBookingRequest } from '@tattoo-studio/contracts';
import { sql, type Kysely } from 'kysely';
import type { Database } from './database/types.js';

export interface BookingRequestRepository {
    readonly persistence: 'memory' | 'postgres';
    check(): Promise<void>;
    create(input: CreateBookingRequest): Promise<BookingRequest>;
    close?(): Promise<void>;
}

export class MemoryBookingRequestRepository implements BookingRequestRepository {
    readonly persistence = 'memory' as const;
    readonly #requests = new Map<string, BookingRequest>();

    async check(): Promise<void> {}

    async create(input: CreateBookingRequest): Promise<BookingRequest> {
        const request: BookingRequest = {
            ...input,
            id: randomUUID(),
            status: 'submitted',
            createdAt: new Date().toISOString(),
        };

        this.#requests.set(request.id, request);
        return request;
    }
}

export class PostgresBookingRequestRepository implements BookingRequestRepository {
    readonly persistence = 'postgres' as const;

    constructor(private readonly database: Kysely<Database>) {}

    async check(): Promise<void> {
        await sql`select 1`.execute(this.database);
    }

    async create(input: CreateBookingRequest): Promise<BookingRequest> {
        const id = randomUUID();
        const createdAt = new Date().toISOString();

        await this.database
            .insertInto('booking_request')
            .values({
                id,
                service_type_id: input.serviceTypeId,
                slot_id: input.slot.id,
                requested_starts_at: input.slot.startsAt,
                requested_ends_at: input.slot.endsAt,
                customer_first_name: input.customer.firstName,
                customer_last_name: input.customer.lastName,
                customer_email: input.customer.email,
                customer_phone: input.customer.phone,
                tattoo_idea: input.tattooIdea,
                chayns_person_id: input.chaynsPersonId ?? null,
                status: 'submitted',
                accepted_terms_at: createdAt,
            })
            .executeTakeFirstOrThrow();

        return {
            ...input,
            id,
            status: 'submitted',
            createdAt,
        };
    }

    async close(): Promise<void> {
        await this.database.destroy();
    }
}
