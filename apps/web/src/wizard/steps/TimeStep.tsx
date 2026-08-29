import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { getAvailability } from '../api/inquiryApi';

const dateTime = new Intl.DateTimeFormat('de-DE', {
    weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
});

const twoDaysOut = () => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + 2);
    return d.toISOString().slice(0, 10);
};

const TimeStep = ({
    serviceTypeId,
    value,
    onSelect,
}: {
    serviceTypeId: string;
    value?: string;
    onSelect: (startsAt: string | undefined, artistId: string) => void;
}) => {
    const q = useQuery({
        queryKey: ['availability', serviceTypeId],
        queryFn: () => getAvailability(serviceTypeId, 'any', twoDaysOut()),
    });
    return (
        <section>
            <h2>Welcher Zeitpunkt passt?</h2>
            <button type="button" className={!value ? 'is-selected' : ''} onClick={() => onSelect(undefined, 'any')}>
                Kein Wunschtermin
            </button>
            {q.isPending && <p>Lade freie Zeiten …</p>}
            <div className="slot-grid">
                {q.data?.slots.map((slot) => (
                    <button
                        key={slot.id}
                        type="button"
                        className={value === slot.startsAt ? 'is-selected' : ''}
                        onClick={() => onSelect(slot.startsAt, slot.artistId)}
                    >
                        {dateTime.format(new Date(slot.startsAt))}
                    </button>
                ))}
            </div>
        </section>
    );
};

export default TimeStep;
