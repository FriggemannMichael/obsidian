import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { getServiceTypes } from '../api/inquiryApi';

const currency = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });

const ServiceStep = ({ value, onSelect }: { value?: string; onSelect: (id: string) => void }) => {
    const q = useQuery({ queryKey: ['service-types'], queryFn: getServiceTypes });
    return (
        <section>
            <h2>Was planst du?</h2>
            {q.isPending && <p>Lade Terminarten …</p>}
            {q.isError && <p className="error">Terminarten konnten nicht geladen werden.</p>}
            <div className="service-list">
                {q.data?.map((s) => (
                    <button
                        key={s.id}
                        type="button"
                        className={`service-card${s.id === value ? ' service-card--selected' : ''}`}
                        onClick={() => onSelect(s.id)}
                    >
                        <strong>{s.name}</strong>
                        <small>{s.description}</small>
                        <span>
                            {s.durationMinutes} Min.
                            {s.depositCents > 0 && ` · ${currency.format(s.depositCents / 100)} Anzahlung`}
                        </span>
                    </button>
                ))}
            </div>
        </section>
    );
};

export default ServiceStep;
