import React from 'react';

const Confirmation = ({ reference }: { reference: string }) => (
    <section className="success-card">
        <span aria-hidden="true">✓</span>
        <h1>Danke, wir schauen uns deine Idee an.</h1>
        <p>
            Deine Referenznummer lautet <strong>{reference}</strong>. Die Anfrage ist noch nicht
            verbindlich; das Studio meldet sich nach der Prüfung.
        </p>
    </section>
);

export default Confirmation;
