import type { LegacyServiceType as ServiceType, ServiceTypeId } from '@tattoo-studio/contracts';

export const serviceTypes: ServiceType[] = [
    {
        id: 'consultation',
        name: 'Tattoo-Beratung',
        description: 'Idee, Körperstelle, Stil, Machbarkeit und Preisrahmen gemeinsam klären.',
        durationMinutes: 30,
        depositCents: 0,
    },
    {
        id: 'small-tattoo',
        name: 'Kleines Tattoo',
        description: 'Für abgestimmte, kleinere Motive mit bis zu zwei Stunden Studiozeit.',
        durationMinutes: 120,
        depositCents: 5000,
    },
    {
        id: 'day-session',
        name: 'Tagessitzung',
        description: 'Längerer Termin für größere oder aufwendige Tattoo-Projekte.',
        durationMinutes: 360,
        depositCents: 15000,
    },
];

export const findServiceType = (id: ServiceTypeId) =>
    serviceTypes.find((serviceType) => serviceType.id === id);
