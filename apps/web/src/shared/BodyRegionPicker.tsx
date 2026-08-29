import React from 'react';
import { bodyRegionLabels, type BodyRegionCode } from '@tattoo-studio/contracts';
import { BACK_REGIONS, FRONT_REGIONS, FigureFrame } from './bodyFigure';

type Props = {
    value: BodyRegionCode[];
    onChange?: (next: BodyRegionCode[]) => void;
    mode: 'edit' | 'view';
};

const BodyRegionPicker = ({ value, onChange, mode }: Props) => {
    const selected = new Set<string>(value);
    const interactive = mode === 'edit' && Boolean(onChange);

    const toggle = (code: BodyRegionCode) => {
        if (!onChange) return;
        onChange(value.includes(code) ? value.filter((c) => c !== code) : [...value, code]);
    };

    return (
        <div className="body-picker">
            <div className="body-picker__figures">
                <figure>
                    <figcaption>Vorderseite</figcaption>
                    <FigureFrame
                        regions={FRONT_REGIONS}
                        selected={selected}
                        onToggle={toggle}
                        interactive={interactive}
                    />
                </figure>
                <figure>
                    <figcaption>Rückseite</figcaption>
                    <FigureFrame
                        regions={BACK_REGIONS}
                        selected={selected}
                        onToggle={toggle}
                        interactive={interactive}
                    />
                </figure>
            </div>
            <ul className="body-picker__chips">
                {value.map((code) => (
                    <li key={code}>
                        {bodyRegionLabels[code]}
                        {interactive && (
                            <button
                                type="button"
                                aria-label={`${bodyRegionLabels[code]} entfernen`}
                                onClick={() => toggle(code)}
                            >
                                ✕
                            </button>
                        )}
                    </li>
                ))}
            </ul>
        </div>
    );
};

export default BodyRegionPicker;
