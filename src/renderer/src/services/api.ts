export const API_BASE = 'http://127.0.0.1:8000';

export interface Tag {
    id: number;
    key?: string;
    value: string;
}

export interface Person {
    id: number;
export interface LLMStatus {
    is_ready: boolean;
    current_model?: string;
    device?: string;
}
    name: string;
    contact_method?: string;
    avatar_logo?: string;
    created_at: string;
    updated_at: string;
    tags: Tag[];
    groups?: { name: string, id: number, avatar_logo?: string }[];
    persona_id?: number;
    persona?: Persona;
    inherited_persona?: Persona;
    note_count?: number;
    message_count?: number;
    latest_note_date?: string;
}

export interface Group {
    id: number;
    name: string;
    description?: string;
    avatar_logo?: string;
    created_at: string;
    updated_at: string;
    tags: Tag[];
    members: Person[];
    persona_id?: number;
    persona?: Persona;
    aggregated_note_count?: number;
    aggregated_message_count?: number;
    earliest_note_date?: string;
    latest_note_date?: string;
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
    url?: string;
    type: 'CONCEPT' | 'RESOURCE' | 'TECHNIQUE' | 'PATTERN' | 'TEMPLATE';
    tags: Tag[];
    source_note_id?: number;
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
    items?: PractiseFrameworkItem[];
}

export interface PractiseFrameworkItem {
    id: number;
    aspect: string;
    value: string;
    created_at: string;
    status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'SUPERSEDED';
    possible_groups?: { name: string, id: number, avatar_logo?: string }[];
}

export interface FrameworkProposal {
    id: number;
    aspect: string;
    action: string;
    value: string;
    observation_count: number;
    source_context?: string;
    source_owner?: string;
    source_date?: string;
    source_type: string;
    source_id: number;
    persona_id?: number;
    person_id?: number;
    group_id?: number;
    persona_name?: string;
    person_name?: string;
    group_name?: string;
    is_core: boolean;
    created_at: string;
    status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'SUPERSEDED';
    possible_groups?: { name: string, id: number, avatar_logo?: string }[];
}

export interface CustomFrameworkRecord {
    type: 'person' | 'group';
    id: number;
    name: string;
    framework: PractiseFramework;
    persona_id?: number;
}

export interface Persona {
    id: number;
    name: string;
    description?: string;
    avatar_logo?: string;
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

export interface ReferenceProposal {
    id: number;
    title: string;
    body: string;
    type: string;
    status: string;
    note_id: number;
}

export interface ReferenceSuggestion {
    title: string;
    body: string;
    type: string;
    reason: string;
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

    async post<T>(path: string, body: unknown): Promise<T> {
        const res = await fetch(`${API_BASE}${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (!res.ok) throw new Error(`API Error: ${res.statusText}`);
        return res.json();
    },

    async patch<T>(path: string, body: unknown): Promise<T> {
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
    getMessages: (params?: Record<string, string>): Promise<Message[]> => {
        let qs = '';
        if (params) {
            qs = '?' + new URLSearchParams(params).toString();
        }
        return api.get<Message[]>(`/api/messages/${qs}`);
    },
    getMessage: (id: number): Promise<Message> => api.get<Message>(`/api/messages/${id}`),
    createMessage: (data: Partial<Message>): Promise<Message> => api.post<Message>('/api/messages/', data),
    updateMessage: (id: number, data: Partial<Message>): Promise<Message> => api.patch<Message>(`/api/messages/${id}`, data),
    iterateMessage: (id: number, feedback: string, highlight?: string): Promise<{draft_text: string}> =>
        api.post<{draft_text: string}>(`/api/messages/${id}/iterate`, { feedback, highlight_text: highlight }),
    getMessagesByDate: (date: string): Promise<Message[]> => api.get<Message[]>(`/api/messages/by-date/${date}`),
    
    // Legacy mapping (to be moved/updated)
    getNotesByDate: (date: string): Promise<Note[]> => api.get<Note[]>(`/api/notes/by-date/${date}`),
    draftNoteMessage: (noteId: number): Promise<Message> => api.post<Message>(`/api/notes/${noteId}/draft-message`, {})
};
