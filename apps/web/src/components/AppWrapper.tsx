import React, { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ChaynsProvider } from 'chayns-api';
import { PageProvider } from '@chayns-components/core';
import App from './App';

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            retry: 1,
            staleTime: 60_000,
        },
    },
});

const Content = () => (
    <QueryClientProvider client={queryClient}>
        <App />
    </QueryClientProvider>
);

const AppWrapper = () => {
    const isStandalonePreview = window.self === window.top && !/chayns/i.test(navigator.userAgent);

    useEffect(() => {
        document.documentElement.classList.toggle('standalone-preview', isStandalonePreview);

        return () => document.documentElement.classList.remove('standalone-preview');
    }, [isStandalonePreview]);

    if (isStandalonePreview) {
        return <Content />;
    }

    return (
        <ChaynsProvider>
        <QueryClientProvider client={queryClient}>
            <PageProvider>
                <App />
            </PageProvider>
        </QueryClientProvider>
        </ChaynsProvider>
    );
};

export default AppWrapper;
