import {
    availabilityResponseSchema,
    createInquirySchema,
    inquiryResponseSchema,
    serviceTypesResponseSchema,
    uploadResultSchema,
    type AvailabilityResponse,
    type CreateInquiry,
    type InquiryResponse,
    type ServiceType,
    type UploadResult,
} from '@tattoo-studio/contracts';

const BASE = (process.env.PUBLIC_BOOKING_API_URL || 'http://localhost:3000').replace(/\/$/, '');
const TOKEN_KEY = 'tattoo.clientToken';

export const getClientToken = (): string => {
    let t = localStorage.getItem(TOKEN_KEY);
    if (!t) {
        t = crypto.randomUUID();
        localStorage.setItem(TOKEN_KEY, t);
    }
    return t;
};

const getJson = async (path: string, init?: RequestInit) => {
    const res = await fetch(`${BASE}${path}`, init);
    const body: unknown = await res.json();
    if (!res.ok) {
        const message =
            typeof body === 'object' && body && 'message' in body
                ? String((body as { message: unknown }).message)
                : 'Die Anfrage konnte nicht verarbeitet werden.';
        throw new Error(message);
    }
    return body;
};

export const getServiceTypes = async (): Promise<ServiceType[]> =>
    serviceTypesResponseSchema.parse(await getJson('/v1/service-types')).items;

export const getAvailability = async (
    serviceTypeId: string,
    artistId: string,
    from: string,
): Promise<AvailabilityResponse> => {
    const params = new URLSearchParams({ serviceTypeId, artistId, from, days: '14' });
    return availabilityResponseSchema.parse(await getJson(`/v1/availability?${params}`));
};

export const uploadImage = (file: File, onProgress?: (p: number) => void): Promise<UploadResult> =>
    new Promise((resolve, reject) => {
        const form = new FormData();
        form.append('file', file);
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${BASE}/v1/uploads`);
        xhr.setRequestHeader('X-Client-Token', getClientToken());
        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => {
            try {
                const json = JSON.parse(xhr.responseText);
                if (xhr.status >= 200 && xhr.status < 300) resolve(uploadResultSchema.parse(json));
                else reject(new Error(json?.message ?? 'Upload fehlgeschlagen.'));
            } catch {
                reject(new Error('Upload fehlgeschlagen.'));
            }
        };
        xhr.onerror = () => reject(new Error('Upload fehlgeschlagen.'));
        xhr.send(form);
    });

export const createInquiry = async (payload: CreateInquiry): Promise<InquiryResponse> => {
    const body = createInquirySchema.parse(payload);
    const json = await getJson('/v1/inquiries', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Client-Token': getClientToken(),
            'Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify(body),
    });
    return inquiryResponseSchema.parse(json);
};
