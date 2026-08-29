import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createInquiry, getClientToken, getServiceTypes } from './inquiryApi';

beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('fetch', vi.fn());
});
afterEach(() => vi.unstubAllGlobals());

it('persists a client token', () => {
    const a = getClientToken();
    const b = getClientToken();
    expect(a).toBe(b);
    expect(localStorage.getItem('tattoo.clientToken')).toBe(a);
});

it('parses the service type list', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => ({
            items: [
                {
                    id: 'small-tattoo', name: 'Kleines Tattoo', description: 'x', durationMinutes: 120,
                    preBufferMinutes: 15, postBufferMinutes: 15, bookingMode: 'request', depositTier: 'D50', depositCents: 5000,
                },
            ],
        }),
    });
    const items = await getServiceTypes();
    expect(items[0]!.id).toBe('small-tattoo');
});

it('sends idempotency and client-token headers on createInquiry', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => ({
            inquiryId: crypto.randomUUID(), status: 'NEW', reference: 'abcd1234',
            createdAt: '2026-08-29T10:00:00.000Z',
        }),
    });
    await createInquiry({
        serviceTypeId: 'small-tattoo', preferredArtistId: 'any', bodyRegions: ['front.chest'],
        description: '', referenceImageIds: [],
        customer: { firstName: 'Ann', lastName: 'Roe', email: 'a@b.de', phone: '+49 111 222' },
        acceptsTerms: true,
    });
    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(init.headers['X-Client-Token']).toBeTruthy();
    expect(init.headers['Idempotency-Key']).toBeTruthy();
});
