import {
    availabilityResponseSchema,
    createBookingRequestResponseSchema,
    serviceTypesResponseSchema,
    type CreateBookingRequest,
    type ServiceTypeId,
} from '@tattoo-studio/contracts';

const API_BASE_URL = (process.env.PUBLIC_BOOKING_API_URL || 'http://localhost:3000/api/v1').replace(
    /\/$/,
    '',
);

const getJson = async (path: string, init?: RequestInit) => {
    const response = await fetch(`${API_BASE_URL}${path}`, {
        ...init,
        headers: {
            'Content-Type': 'application/json',
            ...init?.headers,
        },
    });

    const body: unknown = await response.json();

    if (!response.ok) {
        const message =
            typeof body === 'object' && body && 'message' in body
                ? String(body.message)
                : 'Die Anfrage konnte nicht verarbeitet werden.';
        throw new Error(message);
    }

    return body;
};

export const getServiceTypes = async () =>
    serviceTypesResponseSchema.parse(await getJson('/service-types'));

export const getAvailability = async (serviceTypeId: ServiceTypeId) => {
    const from = new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Europe/Berlin',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(new Date());
    const params = new URLSearchParams({ serviceTypeId, from, days: '14' });

    return availabilityResponseSchema.parse(await getJson(`/availability?${params}`));
};

export const createBookingRequest = async (input: CreateBookingRequest) =>
    createBookingRequestResponseSchema.parse(
        await getJson('/booking-requests', {
            method: 'POST',
            body: JSON.stringify(input),
        }),
    );
