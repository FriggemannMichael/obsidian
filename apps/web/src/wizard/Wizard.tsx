import React, { useEffect, useState } from 'react';
import { createInquirySchema, type BodyRegionCode, type CreateInquiry } from '@tattoo-studio/contracts';
import { createInquiry } from './api/inquiryApi';
import ServiceStep from './steps/ServiceStep';
import TimeStep from './steps/TimeStep';
import MotifStep from './steps/MotifStep';
import ContactStep from './steps/ContactStep';
import Confirmation from './steps/Confirmation';

type Customer = { firstName: string; lastName: string; email: string; phone: string };

type Draft = {
    serviceTypeId?: string;
    preferredArtistId: string;
    preferredStartsAt?: string;
    bodyRegions: BodyRegionCode[];
    sizeCm?: number;
    description: string;
    imageIds: string[];
    customer: Customer;
    acceptsTerms: boolean;
};

const EMPTY: Draft = {
    preferredArtistId: 'any',
    bodyRegions: [],
    description: '',
    imageIds: [],
    customer: { firstName: '', lastName: '', email: '', phone: '' },
    acceptsTerms: false,
};

const DRAFT_KEY = 'tattoo.draft';

const loadDraft = (): Draft => {
    try {
        const raw = localStorage.getItem(DRAFT_KEY);
        return raw ? { ...EMPTY, ...(JSON.parse(raw) as Partial<Draft>) } : EMPTY;
    } catch {
        return EMPTY;
    }
};

const dateTime = new Intl.DateTimeFormat('de-DE', {
    weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
});

const Wizard = () => {
    const [step, setStep] = useState(0);
    const [draft, setDraft] = useState<Draft>(loadDraft);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string>();
    const [reference, setReference] = useState<string>();

    useEffect(() => {
        try {
            localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
        } catch {
            /* ignore */
        }
    }, [draft]);

    const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

    if (reference) return <Confirmation reference={reference} />;

    const submit = async () => {
        setError(undefined);
        const payload: CreateInquiry = {
            serviceTypeId: draft.serviceTypeId ?? '',
            preferredArtistId: draft.preferredArtistId,
            preferredStartsAt: draft.preferredStartsAt,
            bodyRegions: draft.bodyRegions,
            sizeCm: draft.sizeCm,
            description: draft.description,
            referenceImageIds: draft.imageIds,
            customer: draft.customer,
            acceptsTerms: true,
        };
        const parsed = createInquirySchema.safeParse(payload);
        if (!parsed.success) {
            setError('Bitte prüfe deine Angaben — etwas fehlt oder ist ungültig.');
            return;
        }
        setSubmitting(true);
        try {
            const res = await createInquiry(parsed.data);
            localStorage.removeItem(DRAFT_KEY);
            setReference(res.reference);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Absenden fehlgeschlagen.');
        } finally {
            setSubmitting(false);
        }
    };

    const next = () => setStep((s) => Math.min(s + 1, 3));
    const canLeaveMotif = draft.bodyRegions.length > 0;

    return (
        <main className="booking-page">
            {step === 0 && (
                <>
                    <ServiceStep value={draft.serviceTypeId} onSelect={(id) => set({ serviceTypeId: id })} />
                    <button type="button" disabled={!draft.serviceTypeId} onClick={next}>Weiter</button>
                </>
            )}
            {step === 1 && draft.serviceTypeId && (
                <>
                    <TimeStep
                        serviceTypeId={draft.serviceTypeId}
                        value={draft.preferredStartsAt}
                        onSelect={(startsAt, artistId) =>
                            set({ preferredStartsAt: startsAt, preferredArtistId: artistId })
                        }
                    />
                    <button type="button" onClick={next}>Weiter</button>
                </>
            )}
            {step === 2 && (
                <>
                    <MotifStep
                        regions={draft.bodyRegions}
                        onRegions={(r) => set({ bodyRegions: r })}
                        sizeCm={draft.sizeCm}
                        onSizeCm={(v) => set({ sizeCm: v })}
                        description={draft.description}
                        onDescription={(v) => set({ description: v })}
                        imageIds={draft.imageIds}
                        onImageIds={(ids) => set({ imageIds: ids })}
                    />
                    {!canLeaveMotif && <p className="error">Bitte wähle mindestens eine Körperstelle.</p>}
                    <button type="button" disabled={!canLeaveMotif} onClick={next}>Weiter</button>
                </>
            )}
            {step === 3 && (
                <ContactStep
                    customer={draft.customer}
                    onCustomer={(c) => set({ customer: c })}
                    acceptsTerms={draft.acceptsTerms}
                    onAcceptsTerms={(v) => set({ acceptsTerms: v })}
                    summary={{
                        serviceName: draft.serviceTypeId ?? '',
                        when: draft.preferredStartsAt ? dateTime.format(new Date(draft.preferredStartsAt)) : null,
                    }}
                    onSubmit={() => {
                        if (draft.acceptsTerms) void submit();
                    }}
                    submitting={submitting}
                    error={error}
                />
            )}
        </main>
    );
};

export default Wizard;
