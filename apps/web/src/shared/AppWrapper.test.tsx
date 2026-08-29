import React from 'react';
import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import AppWrapper from './AppWrapper';

it('renders its children', async () => {
    render(<AppWrapper><p>hallo welt</p></AppWrapper>);
    expect(await screen.findByText('hallo welt')).toBeTruthy();
});
