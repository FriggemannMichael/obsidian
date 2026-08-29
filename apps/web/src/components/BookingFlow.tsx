import React, { useMemo, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
    createBookingRequestSchema,
    type AvailabilitySlot,
    type CreateBookingRequest,
    type ServiceType,
    type ServiceTypeId,
} from '@tattoo-studio/contracts';
import { useForm } from 'react-hook-form';
import { createBookingRequest, getAvailability, getServiceTypes } from '../api/bookingApi';

const currency = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const dateTime = new Intl.DateTimeFormat('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
});

const ServiceCard = ({
    serviceType,
    selected,
    onSelect,
}: {
    serviceType: ServiceType;
    selected: boolean;
    onSelect: () => void;
}) => (
    <button
        className={`service-card${selected ? ' service-card--selected' : ''}`}
        type="button"
        onClick={onSelect}
    >
        <span className="service-card__marker" aria-hidden="true" />
        <span>
            <strong>{serviceType.name}</strong>
            <small>{serviceType.description}</small>
        </span>
        <span className="service-card__meta">
            {serviceType.durationMinutes} Min.
            {serviceType.depositCents > 0 && (
                <small>{currency.format(serviceType.depositCents / 100)} Anzahlung</small>
            )}
        </span>
    </button>
);

const BookingFlow = () => {
    const [serviceTypeId, setServiceTypeId] = useState<ServiceTypeId>();
    const [selectedSlot, setSelectedSlot] = useState<AvailabilitySlot>();
    const [submittedId, setSubmittedId] = useState<string>();

    const serviceTypesQuery = useQuery({ queryKey: ['service-types'], queryFn: getServiceTypes });
    const availabilityQuery = useQuery({
        queryKey: ['availability', serviceTypeId],
        queryFn: () => getAvailability(serviceTypeId as ServiceTypeId),
        enabled: Boolean(serviceTypeId),
    });

    const selectedService = useMemo(
        () => serviceTypesQuery.data?.items.find((item) => item.id === serviceTypeId),
        [serviceTypeId, serviceTypesQuery.data],
    );

    const {
        register,
        handleSubmit,
        formState: { errors },
    } = useForm<CreateBookingRequest>({
        resolver: zodResolver(createBookingRequestSchema),
        defaultValues: {
            serviceTypeId: 'consultation',
            customer: { firstName: '', lastName: '', email: '', phone: '' },
            tattooIdea: '',
        },
    });

    const mutation = useMutation({
        mutationFn: createBookingRequest,
        onSuccess: ({ request }) => setSubmittedId(request.id),
    });

    const submit = handleSubmit((values) => {
        if (!serviceTypeId || !selectedSlot) {
            return;
        }

        mutation.mutate({
            ...values,
            serviceTypeId,
            slot: {
                id: selectedSlot.id,
                startsAt: selectedSlot.startsAt,
                endsAt: selectedSlot.endsAt,
            },
        });
    });

    if (submittedId) {
        return (
            <main className="booking-page">
                <section className="success-card">
                    <span className="success-card__icon">✓</span>
                    <p className="eyebrow">Anfrage eingegangen</p>
                    <h1>Danke, wir schauen uns deine Idee an.</h1>
                    <p>
                        Deine Referenznummer lautet <strong>{submittedId.slice(0, 8)}</strong>. Der
                        Termin ist noch nicht verbindlich; das Studio bestätigt ihn nach der
                        Motivprüfung und fordert eine mögliche Anzahlung anschließend über chayns an.
                    </p>
                </section>
            </main>
        );
    }

    return (
        <main className="booking-page">
            <header className="hero">
                <p className="eyebrow">Tattoo Studio · Ahaus</p>
                <h1>Deine Idee.<br />Unser nächstes Projekt.</h1>
                <p className="hero__copy">
                    Wähle einen passenden Terminrahmen und erzähle uns, was du vorhast. Wir prüfen
                    jede Anfrage persönlich, bevor ein Termin verbindlich wird.
                </p>
                <div className="steps" aria-label="Buchungsschritte">
                    <span className="steps__item steps__item--active">01 Art</span>
                    <span className={serviceTypeId ? 'steps__item steps__item--active' : 'steps__item'}>
                        02 Zeit
                    </span>
                    <span className={selectedSlot ? 'steps__item steps__item--active' : 'steps__item'}>
                        03 Idee
                    </span>
                </div>
            </header>

            <section className="booking-panel">
                <div className="section-heading">
                    <span>01</span>
                    <div><h2>Was planst du?</h2><p>Der Zeitbedarf kann nach der Prüfung noch angepasst werden.</p></div>
                </div>

                {serviceTypesQuery.isPending && <p>Lade Terminarten …</p>}
                {serviceTypesQuery.isError && <p className="error">Terminarten konnten nicht geladen werden.</p>}
                <div className="service-list">
                    {serviceTypesQuery.data?.items.map((serviceType) => (
                        <ServiceCard
                            key={serviceType.id}
                            serviceType={serviceType}
                            selected={serviceType.id === serviceTypeId}
                            onSelect={() => {
                                setServiceTypeId(serviceType.id);
                                setSelectedSlot(undefined);
                            }}
                        />
                    ))}
                </div>

                {serviceTypeId && (
                    <div className="flow-section">
                        <div className="section-heading">
                            <span>02</span>
                            <div><h2>Welcher Zeitpunkt passt?</h2><p>Erste freie Vorschläge für die kommenden 14 Tage.</p></div>
                        </div>
                        {availabilityQuery.isPending && <p>Lade freie Zeiten …</p>}
                        {availabilityQuery.isError && <p className="error">Freie Zeiten konnten nicht geladen werden.</p>}
                        <div className="slot-grid">
                            {availabilityQuery.data?.slots.map((slot) => (
                                <button
                                    className={`slot${selectedSlot?.id === slot.id ? ' slot--selected' : ''}`}
                                    key={slot.id}
                                    type="button"
                                    onClick={() => setSelectedSlot(slot)}
                                >
                                    {dateTime.format(new Date(slot.startsAt))}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {selectedSlot && selectedService && (
                    <form className="flow-section request-form" onSubmit={submit}>
                        <div className="section-heading">
                            <span>03</span>
                            <div><h2>Erzähl uns von deinem Tattoo</h2><p>Je genauer die Angaben, desto schneller können wir antworten.</p></div>
                        </div>
                        <div className="form-grid">
                            <label>Vorname<input {...register('customer.firstName')} autoComplete="given-name" /></label>
                            <label>Nachname<input {...register('customer.lastName')} autoComplete="family-name" /></label>
                            <label>E-Mail<input {...register('customer.email')} type="email" autoComplete="email" /></label>
                            <label>Telefon<input {...register('customer.phone')} type="tel" autoComplete="tel" /></label>
                        </div>
                        <label>
                            Motiv, Körperstelle und ungefähre Größe
                            <textarea {...register('tattooIdea')} rows={6} placeholder="Zum Beispiel: florales Motiv am rechten Unterarm, etwa 12 cm …" />
                            {errors.tattooIdea && <small className="error">Bitte beschreibe deine Idee mit mindestens 20 Zeichen.</small>}
                        </label>
                        <label className="consent">
                            <input {...register('acceptsTerms')} type="checkbox" />
                            <span>Ich stimme der Verarbeitung meiner Angaben zur Bearbeitung der Anfrage zu.</span>
                        </label>
                        {Object.keys(errors).length > 0 && (
                            <p className="error">
                                Bitte prüfe die markierten Pflichtangaben und deine Einwilligung.
                            </p>
                        )}
                        <div className="request-summary">
                            <div><small>Auswahl</small><strong>{selectedService.name}</strong></div>
                            <div><small>Zeitpunkt</small><strong>{dateTime.format(new Date(selectedSlot.startsAt))}</strong></div>
                            <button className="primary-button" disabled={mutation.isPending} type="submit">
                                {mutation.isPending ? 'Wird gesendet …' : 'Anfrage absenden'}
                            </button>
                        </div>
                        {mutation.isError && <p className="error">{mutation.error.message}</p>}
                    </form>
                )}
            </section>
        </main>
    );
};

export default BookingFlow;
