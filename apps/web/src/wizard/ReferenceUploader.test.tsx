import React, { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('./api/inquiryApi', () => ({
    uploadImage: vi.fn(),
}));
import { uploadImage } from './api/inquiryApi';
import ReferenceUploader from './ReferenceUploader';

const Harness = () => {
    const [ids, setIds] = useState<string[]>([]);
    return (
        <>
            <ReferenceUploader value={ids} onChange={setIds} />
            <output data-testid="ids">{ids.join(',')}</output>
        </>
    );
};

afterEach(() => vi.clearAllMocks());
globalThis.URL.createObjectURL = vi.fn(() => 'blob:x');

it('uploads a picked file and records the id', async () => {
    (uploadImage as ReturnType<typeof vi.fn>).mockResolvedValue({ uploadId: 'up-1', url: '/v1/uploads/up-1', contentType: 'image/png', width: 10, height: 10, byteSize: 5 });
    render(<Harness />);
    const file = new File(['x'], 'a.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText(/foto/i), { target: { files: [file] } });
    await waitFor(() => expect(screen.getByTestId('ids').textContent).toBe('up-1'));
});

it('shows an error and lets the user retry', async () => {
    (uploadImage as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('kaputt'));
    render(<Harness />);
    fireEvent.change(screen.getByLabelText(/foto/i), { target: { files: [new File(['x'], 'a.png', { type: 'image/png' })] } });
    expect(await screen.findByRole('button', { name: /erneut/i })).toBeTruthy();
});
