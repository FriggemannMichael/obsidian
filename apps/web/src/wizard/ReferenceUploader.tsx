import React, { useRef, useState } from 'react';
import { uploadImage } from './api/inquiryApi';

type Item = {
    key: string;
    previewUrl: string;
    file: File;
    state: 'uploading' | 'done' | 'error';
    progress: number;
    uploadId?: string;
};

const ReferenceUploader = ({
    value,
    onChange,
    max = 5,
}: {
    value: string[];
    onChange: (ids: string[]) => void;
    max?: number;
}) => {
    const [items, setItems] = useState<Item[]>([]);
    const inputRef = useRef<HTMLInputElement>(null);

    const patch = (key: string, next: Partial<Item>) =>
        setItems((cur) => cur.map((it) => (it.key === key ? { ...it, ...next } : it)));

    const start = async (item: Item) => {
        patch(item.key, { state: 'uploading', progress: 0 });
        try {
            const res = await uploadImage(item.file, (p) => patch(item.key, { progress: p }));
            patch(item.key, { state: 'done', uploadId: res.uploadId });
            onChange([...value, res.uploadId]);
        } catch {
            patch(item.key, { state: 'error' });
        }
    };

    const onPick = (files: FileList | null) => {
        if (!files) return;
        const room = max - items.length;
        for (const file of Array.from(files).slice(0, room)) {
            const item: Item = {
                key: crypto.randomUUID(),
                previewUrl: URL.createObjectURL(file),
                file,
                state: 'uploading',
                progress: 0,
            };
            setItems((cur) => [...cur, item]);
            void start(item);
        }
        if (inputRef.current) inputRef.current.value = '';
    };

    const remove = (item: Item) => {
        setItems((cur) => cur.filter((it) => it.key !== item.key));
        if (item.uploadId) onChange(value.filter((id) => id !== item.uploadId));
    };

    return (
        <div className="reference-uploader">
            <ul>
                {items.map((it) => (
                    <li key={it.key}>
                        <img src={it.previewUrl} alt="" />
                        {it.state === 'uploading' && <span>{it.progress}%</span>}
                        {it.state === 'done' && <span>hochgeladen</span>}
                        {it.state === 'error' && (
                            <button type="button" onClick={() => start(it)}>
                                Erneut versuchen
                            </button>
                        )}
                        <button type="button" aria-label="Bild entfernen" onClick={() => remove(it)}>
                            ✕
                        </button>
                    </li>
                ))}
            </ul>
            {items.length < max && (
                <label className="reference-uploader__add">
                    + Foto
                    <input
                        ref={inputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={(e) => onPick(e.target.files)}
                    />
                </label>
            )}
        </div>
    );
};

export default ReferenceUploader;
