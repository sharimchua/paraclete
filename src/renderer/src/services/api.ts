const API_BASE = 'http://localhost:8000';

export interface Tag {
    id: number;
    key?: string;
    value: string;
}

export interface Person {
    id: number;
    name: string;
    contact_method?: string;
    created_at: string;
    updated_at: string;
    tags: Tag[];
}

export interface Group {
    id: number;
    name: string;
    description?: string;
    created_at: string;
    updated_at: string;
    tags: Tag[];
}

export interface Note {
    id: number;
    title: string;
    date: string;
    stage: 'Prepare' | 'Capture' | 'Clean' | 'Published' | 'Archived';
    raw_capture?: string;
    cleaned_text?: string;
    person_id?: number;
    group_id?: number;
    tags: Tag[];
}

export const api = {
    async get<T>(path: string): Promise<T> {
        const res = await fetch(`${API_BASE}${path}`);
        if (!res.ok) throw new Error(`API Error: ${res.statusText}`);
        return res.json();
    },

    async post<T>(path: string, body: any): Promise<T> {
        const res = await fetch(`${API_BASE}${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (!res.ok) throw new Error(`API Error: ${res.statusText}`);
        return res.json();
    },

    async patch<T>(path: string, body: any): Promise<T> {
        const res = await fetch(`${API_BASE}${path}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (!res.ok) throw new Error(`API Error: ${res.statusText}`);
        return res.json();
    }
};
