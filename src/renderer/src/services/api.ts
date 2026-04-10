export const API_BASE = 'http://127.0.0.1:8000';

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
    groups?: { name: string, id: number }[];
    persona_id?: number;
    persona?: Persona;
    inherited_persona?: Persona;
}

export interface Group {
    id: number;
    name: string;
    description?: string;
    created_at: string;
    updated_at: string;
    tags: Tag[];
    members: Person[];
    persona_id?: number;
    persona?: Persona;
}

export interface Note {
    id: number;
    title: string;
    date: string;
    stage: 'Prepare' | 'Capture' | 'Clean' | 'Published' | 'Archived';
    raw_capture?: string;
    cleaned_text?: string;
    session_brief?: string;
    person_id?: number;
    group_id?: number;
    tags: Tag[];
    person?: Person;
    group?: Group;
}

export interface Reference {
    id: number;
    title: string;
    body: string;
    source_link?: string;
    type: 'Resource' | 'Protocol' | 'Insight' | 'Principle';
    tags: Tag[];
}

export interface PractiseFramework {
    id: number;
    is_core: boolean;
    persona_id?: number;
    tone_idioms?: string;
    formatting_preferences?: string;
    principles_tenets?: string;
    common_phrasing?: string;
    created_at: string;
    updated_at: string;
}

export interface FrameworkProposal {
    id: number;
    aspect: string;
    action: string;
    value: string;
    source_context?: string;
    source_owner?: string;
    source_date?: string;
    source_type: string;
    source_id: number;
    persona_id?: number;
    is_core: boolean;
    created_at: string;
}

export interface Persona {
    id: number;
    name: string;
    description?: string;
    logo_url?: string;
    framework?: PractiseFramework;
}

export interface DashboardStats {
    person_count: number;
    note_count: number;
    group_count: number;
    reference_count: number;
    message_count: number;
}

export interface CalendarDay {
    date: string;
    count: number; // notes count
    message_count: number;
}

export interface TrendStack {
    name: string;
    count: number;
}

export interface TrendPoint {
    label: string;
    count: number;
    stacks: TrendStack[];
}

export interface LeaderboardEntry {
    id: number;
    name: string;
    note_count: number;
}

export interface Message {
    id: number;
    draft_text?: string;
    sent_text?: string;
    status: 'draft' | 'sent' | 'archived';
    source: 'native' | 'imported';
    is_inbound: boolean;
    date?: string;
    note_id?: number;
    person_id?: number;
    group_id?: number;
    persona_id?: number;
    sent_at?: string;
    created_at: string;
    updated_at: string;
    note?: Note;
    person?: Person;
    group?: Group;
}

export const api = {
    // ... existing ...
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
    },

    async delete<T>(path: string): Promise<T> {
        const res = await fetch(`${API_BASE}${path}`, {
            method: 'DELETE'
        });
        if (!res.ok) throw new Error(`API Error: ${res.statusText}`);
        return res.json();
    },

    async postForm<T>(path: string, formData: FormData): Promise<T> {
        const res = await fetch(`${API_BASE}${path}`, {
            method: 'POST',
            body: formData
        });
        if (!res.ok) throw new Error(`API Error: ${res.statusText}`);
        return res.json();
    },

    // Specific Domain Methods
    getMessages: (params?: any) => {
        let qs = '';
        if (params) {
            qs = '?' + new URLSearchParams(params).toString();
        }
        return api.get<Message[]>(`/api/messages/${qs}`);
    },
    getMessage: (id: number) => api.get<Message>(`/api/messages/${id}`),
    createMessage: (data: Partial<Message>) => api.post<Message>('/api/messages/', data),
    updateMessage: (id: number, data: Partial<Message>) => api.patch<Message>(`/api/messages/${id}`, data),
    iterateMessage: (id: number, feedback: string, highlight?: string) => 
        api.post<{draft_text: string}>(`/api/messages/${id}/iterate`, { feedback, highlight_text: highlight }),
    getMessagesByDate: (date: string) => api.get<Message[]>(`/api/messages/by-date/${date}`),
    
    // Legacy mapping (to be moved/updated)
    getNotesByDate: (date: string) => api.get<Note[]>(`/api/notes/by-date/${date}`),
    draftNoteMessage: (noteId: number) => api.post<Message>(`/api/notes/${noteId}/draft-message`, {})
};
