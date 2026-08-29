import type { Kysely, Selectable } from 'kysely';
import type {
    AppointmentBlockTable,
    ArtistTable,
    AvailabilityRuleTable,
    BlockedPeriodTable,
    BlockStatus,
    Database,
    ResourceTable,
    ServiceTypeTable,
} from '../database/types.js';

export type ServiceTypeRow = Selectable<ServiceTypeTable>;
export type ArtistRow = Selectable<ArtistTable>;
export type ResourceRow = Selectable<ResourceTable>;
export type AvailabilityRuleRow = Selectable<AvailabilityRuleTable>;
export type BlockedPeriodRow = Selectable<BlockedPeriodTable>;
export type BlockingBlockRow = Pick<
    Selectable<AppointmentBlockTable>,
    'artist_id' | 'resource_id' | 'starts_at' | 'ends_at' | 'status'
>;

const BLOCKING = ['HELD', 'PAYMENT_PENDING', 'CONFIRMED'] as const satisfies readonly BlockStatus[];

export const getServiceType = (db: Kysely<Database>, id: string) =>
    db.selectFrom('service_type').selectAll().where('id', '=', id).executeTakeFirst();

export const getActiveArtistsForService = (db: Kysely<Database>, serviceTypeId: string) =>
    db
        .selectFrom('artist')
        .innerJoin('artist_service', 'artist_service.artist_id', 'artist.id')
        .where('artist_service.service_type_id', '=', serviceTypeId)
        .where('artist.active', '=', true)
        .selectAll('artist')
        .execute();

export const getActiveResources = (db: Kysely<Database>, kind: 'station' | 'consult') =>
    db
        .selectFrom('resource')
        .selectAll()
        .where('kind', '=', kind)
        .where('active', '=', true)
        .execute();

export const getAvailabilityRules = (
    db: Kysely<Database>,
    artistIds: string[],
    fromDate: string,
    toDate: string,
) =>
    db
        .selectFrom('availability_rule')
        .selectAll()
        .where('artist_id', 'in', artistIds.length ? artistIds : ['__none__'])
        .where('valid_from', '<', toDate)
        .where((eb) => eb.or([eb('valid_to', 'is', null), eb('valid_to', '>', fromDate)]))
        .execute();

export const getBlockedPeriods = (
    db: Kysely<Database>,
    artistIds: string[],
    resourceIds: string[],
    from: Date,
    to: Date,
) =>
    db
        .selectFrom('blocked_period')
        .selectAll()
        .where('starts_at', '<', to)
        .where('ends_at', '>', from)
        .where((eb) =>
            eb.or([
                eb('artist_id', 'in', artistIds.length ? artistIds : ['__none__']),
                eb('resource_id', 'in', resourceIds.length ? resourceIds : ['__none__']),
            ]),
        )
        .execute();

export const getBlockingBlocks = (
    db: Kysely<Database>,
    artistIds: string[],
    from: Date,
    to: Date,
): Promise<BlockingBlockRow[]> =>
    db
        .selectFrom('appointment_block')
        .select(['artist_id', 'resource_id', 'starts_at', 'ends_at', 'status'])
        .where('artist_id', 'in', artistIds.length ? artistIds : ['__none__'])
        .where('status', 'in', BLOCKING)
        .where('starts_at', '<', to)
        .where('ends_at', '>', from)
        .execute();
