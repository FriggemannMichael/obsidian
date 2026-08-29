import React, { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ChaynsProvider } from 'chayns-api';
import { PageProvider } from '@chayns-components/core';

const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: 1, staleTime: 60_000 } },
});

const AppWrapper = ({ children }: { children: React.ReactNode }) => {
    const isStandalonePreview =
        window.self === window.top && !/chayns/i.test(navigator.userAgent);

    useEffect(() => {
        document.documentElement.classList.toggle('standalone-preview', isStandalonePreview);
        return () => document.documentElement.classList.remove('standalone-preview');
    }, [isStandalonePreview]);

    if (isStandalonePreview) {
        return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    }

    return (
        <ChaynsProvider>
            <QueryClientProvider client={queryClient}>
                <PageProvider>{children}</PageProvider>
            </QueryClientProvider>
        </ChaynsProvider>
    );
};

export default AppWrapper;
