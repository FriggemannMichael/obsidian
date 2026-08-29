import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('./api/inquiryApi', () => ({
    getClientToken: vi.fn(() => 'tok'),
    getServiceTypes: vi.fn().mockResolvedValue([
        { id: 'small-tattoo', name: 'Kleines Tattoo', description: 'x', durationMinutes: 120, preBufferMinutes: 15, postBufferMinutes: 15, bookingMode: 'request', depositTier: 'D50', depositCents: 5000 },
    ]),
    getAvailability: vi.fn().mockResolvedValue({ timezone: 'Europe/Berlin', serviceType: {}, slots: [] }),
    uploadImage: vi.fn(),
    createInquiry: vi.fn(),
}));
import { createInquiry } from './api/inquiryApi';
import Wizard from './Wizard';

const wrap = () => {
    const c = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(<QueryClientProvider client={c}><Wizard /></QueryClientProvider>);
};

beforeEach(() => localStorage.clear());
afterEach(() => vi.clearAllMocks());

it('walks the four steps and submits a schema-valid payload', async () => {
    (createInquiry as ReturnType<typeof vi.fn>).mockResolvedValue({ inquiryId: crypto.randomUUID(), status: 'NEW', reference: 'abcd1234', createdAt: '2026-08-29T10:00:00.000Z' });
    wrap();

    fireEvent.click(await screen.findByRole('button', { name: /Kleines Tattoo/i }));
    fireEvent.click(await screen.findByRole('button', { name: /weiter/i }));            // -> Zeit
    fireEvent.click(await screen.findByRole('button', { name: /Kein Wunschtermin/i }));
    fireEvent.click(await screen.findByRole('button', { name: /weiter/i }));            // -> Motiv

    fireEvent.click(await screen.findByLabelText('Brust'));
    fireEvent.click(screen.getByRole('button', { name: /weiter/i }));                   // -> Kontakt

    fireEvent.change(screen.getByLabelText('Vorname'), { target: { value: 'Ann' } });
    fireEvent.change(screen.getByLabelText('Nachname'), { target: { value: 'Roe' } });
    fireEvent.change(screen.getByLabelText('E-Mail'), { target: { value: 'a@b.de' } });
    fireEvent.change(screen.getByLabelText('Telefon'), { target: { value: '+49 111 222' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /absenden/i }));

    await waitFor(() => expect(createInquiry).toHaveBeenCalledTimes(1));
    const payload = (createInquiry as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(payload).toMatchObject({ serviceTypeId: 'small-tattoo', bodyRegions: ['front.chest'], acceptsTerms: true });
    expect(await screen.findByText(/abcd1234/)).toBeTruthy();
    expect(localStorage.getItem('tattoo.draft')).toBeNull();
});

it('blocks step 3 -> 4 without a body region', async () => {
    wrap();
    fireEvent.click(await screen.findByRole('button', { name: /Kleines Tattoo/i }));
    fireEvent.click(await screen.findByRole('button', { name: /weiter/i }));
    fireEvent.click(await screen.findByRole('button', { name: /Kein Wunschtermin/i }));
    fireEvent.click(await screen.findByRole('button', { name: /weiter/i }));
    fireEvent.click(screen.getByRole('button', { name: /weiter/i }));
    expect(screen.getByText(/mindestens eine Körperstelle/i)).toBeTruthy();
});
