import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { BodyRegionCode } from '@tattoo-studio/contracts';
import BodyRegionPicker from './BodyRegionPicker';

const Harness = ({ onChange }: { onChange: (v: BodyRegionCode[]) => void }) => {
    const [v, setV] = useState<BodyRegionCode[]>([]);
    return (
        <BodyRegionPicker
            mode="edit"
            value={v}
            onChange={(next) => {
                setV(next);
                onChange(next);
            }}
        />
    );
};

it('toggles regions on click and supports multi-select', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('Oberarm links'));
    fireEvent.click(screen.getByLabelText('Brust'));
    expect(onChange).toHaveBeenLastCalledWith(['front.upper_arm.left', 'front.chest']);
    fireEvent.click(screen.getByLabelText('Oberarm links'));
    expect(onChange).toHaveBeenLastCalledWith(['front.chest']);
});

it('view mode is not interactive', () => {
    render(<BodyRegionPicker mode="view" value={['front.chest']} />);
    const region = screen.getByLabelText('Brust');
    expect(region.getAttribute('tabindex')).toBeNull();
    expect(screen.getByText('Brust')).toBeTruthy(); // chip
});
