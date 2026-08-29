import React from 'react';
import type { BodyRegionCode } from '@tattoo-studio/contracts';
import BodyRegionPicker from '../../shared/BodyRegionPicker';
import ReferenceUploader from '../ReferenceUploader';
import SizeField from '../SizeField';

const MotifStep = ({
    regions,
    onRegions,
    sizeCm,
    onSizeCm,
    description,
    onDescription,
    imageIds,
    onImageIds,
}: {
    regions: BodyRegionCode[];
    onRegions: (r: BodyRegionCode[]) => void;
    sizeCm: number | undefined;
    onSizeCm: (v: number | undefined) => void;
    description: string;
    onDescription: (v: string) => void;
    imageIds: string[];
    onImageIds: (ids: string[]) => void;
}) => (
    <section>
        <h2>Wohin soll dein Tattoo?</h2>
        <BodyRegionPicker mode="edit" value={regions} onChange={onRegions} />
        <SizeField value={sizeCm} onChange={onSizeCm} />
        <label>
            Beschreibung (kurz, optional)
            <textarea
                rows={5}
                maxLength={2000}
                value={description}
                onChange={(e) => onDescription(e.target.value)}
                placeholder="Stil, Wirkung, Farbe, Cover-up ja/nein …"
            />
        </label>
        <h3>Referenzbilder (bis 5)</h3>
        <ReferenceUploader value={imageIds} onChange={onImageIds} />
    </section>
);

export default MotifStep;
