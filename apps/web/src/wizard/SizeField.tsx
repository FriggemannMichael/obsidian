import React from 'react';

const SizeField = ({
    value,
    onChange,
}: {
    value: number | undefined;
    onChange: (v: number | undefined) => void;
}) => (
    <label className="size-field">
        Ungefähre Größe (cm)
        <input
            type="number"
            inputMode="numeric"
            min={1}
            max={300}
            value={value ?? ''}
            onChange={(e) => {
                const n = e.target.valueAsNumber;
                onChange(Number.isFinite(n) ? n : undefined);
            }}
        />
    </label>
);

export default SizeField;
