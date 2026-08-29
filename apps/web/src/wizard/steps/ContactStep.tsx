import React from 'react';

type Customer = { firstName: string; lastName: string; email: string; phone: string };

const ContactStep = ({
    customer,
    onCustomer,
    acceptsTerms,
    onAcceptsTerms,
    summary,
    onSubmit,
    submitting,
    error,
}: {
    customer: Customer;
    onCustomer: (c: Customer) => void;
    acceptsTerms: boolean;
    onAcceptsTerms: (v: boolean) => void;
    summary: { serviceName: string; when: string | null };
    onSubmit: () => void;
    submitting: boolean;
    error?: string;
}) => {
    const field = (key: keyof Customer, label: string, type = 'text') => (
        <label>
            {label}
            <input
                type={type}
                value={customer[key]}
                onChange={(e) => onCustomer({ ...customer, [key]: e.target.value })}
            />
        </label>
    );
    return (
        <section>
            <h2>Kontakt</h2>
            <div className="form-grid">
                {field('firstName', 'Vorname')}
                {field('lastName', 'Nachname')}
                {field('email', 'E-Mail', 'email')}
                {field('phone', 'Telefon', 'tel')}
            </div>
            <label className="consent">
                <input type="checkbox" checked={acceptsTerms} onChange={(e) => onAcceptsTerms(e.target.checked)} />
                Ich stimme der Verarbeitung meiner Angaben zur Bearbeitung der Anfrage zu.
            </label>
            {error && <p className="error">{error}</p>}
            <div className="request-summary">
                <span>
                    {summary.serviceName}
                    {summary.when ? ` · Wunsch: ${summary.when}` : ''}
                </span>
                <button
                    type="button"
                    className="primary-button"
                    disabled={submitting || !acceptsTerms}
                    onClick={onSubmit}
                >
                    {submitting ? 'Wird gesendet …' : 'Anfrage absenden'}
                </button>
            </div>
        </section>
    );
};

export default ContactStep;
