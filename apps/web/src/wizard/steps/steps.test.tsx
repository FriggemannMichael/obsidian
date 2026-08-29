import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

vi.mock('../api/inquiryApi', () => ({
    getServiceTypes: vi.fn().mockResolvedValue([
        { id: 'small-tattoo', name: 'Kleines Tattoo', description: 'x', durationMinutes: 120, preBufferMinutes: 15, postBufferMinutes: 15, bookingMode: 'request', depositTier: 'D50', depositCents: 5000 },
    ]),
    getAvailability: vi.fn().mockResolvedValue({ timezone: 'Europe/Berlin', serviceType: {}, slots: [] }),
}));
import ServiceStep from './ServiceStep';
import ContactStep from './ContactStep';

const wrap = (ui: React.ReactNode) => {
    const c = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(<QueryClientProvider client={c}>{ui}</QueryClientProvider>);
};

it('ServiceStep renders cards and reports selection', async () => {
    const onSelect = vi.fn();
    wrap(<ServiceStep onSelect={onSelect} />);
    fireEvent.click(await screen.findByRole('button', { name: /Kleines Tattoo/i }));
    expect(onSelect).toHaveBeenCalledWith('small-tattoo');
});

it('ContactStep disables submit until consent is checked', () => {
    const onSubmit = vi.fn();
    wrap(
        <ContactStep
            customer={{ firstName: 'Ann', lastName: 'Roe', email: 'a@b.de', phone: '+49 111 222' }}
            onCustomer={() => {}}
            acceptsTerms={false}
            onAcceptsTerms={() => {}}
            summary={{ serviceName: 'Kleines Tattoo', when: null }}
            onSubmit={onSubmit}
            submitting={false}
        />,
    );
    const btn = screen.getByRole('button', { name: /absenden/i });
    fireEvent.click(btn);
    expect(onSubmit).not.toHaveBeenCalled();
});
