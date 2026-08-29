import React from 'react';
import { createRoot } from 'react-dom/client';
import AppWrapper from './shared/AppWrapper';
import Wizard from './wizard/Wizard';
import './components/app.css';

try {
    const root = createRoot(document.querySelector('#root') as Element);
    root.render(
        <AppWrapper>
            <Wizard />
        </AppWrapper>,
    );
} catch (e) {
    console.error('Encountered error at `ReactDOM.render`: ', e);
}
