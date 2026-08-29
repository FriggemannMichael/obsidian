import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import BookingFlow from './BookingFlow';

vi.mock('../api/bookingApi', () => ({
    getServiceTypes: vi.fn().mockResolvedValue({
        items: [
            {
                id: 'consultation',
                name: 'Tattoo-Beratung',
                description: 'Idee und Machbarkeit gemeinsam klären.',
                durationMinutes: 30,
                depositCents: 0,
            },
        ],
    }),
    getAvailability: vi.fn(),
    createBookingRequest: vi.fn(),
}));

describe('BookingFlow', () => {
    it('shows the service types returned by the API', async () => {
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

        render(
            <QueryClientProvider client={client}>
                <BookingFlow />
            </QueryClientProvider>,
        );

        expect(screen.getByRole('heading', { name: /Deine Idee/i })).toBeTruthy();
        expect(
            await screen.findByRole('button', { name: /Tattoo-Beratung/i }),
        ).toBeTruthy();
    });
});
