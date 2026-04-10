import React, { useState, useEffect } from 'react';
import { api, Note, Persona } from '../services/api';

interface Props {
    note: Note;
}

const NoteUtilities: React.FC<Props> = ({ note }) => {
    const [suggestions, setSuggestions] = useState<any[]>([]);
    const [personas, setPersonas] = useState<Persona[]>([]);
    const [drafts, setDrafts] = useState<Record<number, string>>({});
    const [isAutoDrafting, setIsAutoDrafting] = useState(false);
    const [loadingPersonas, setLoadingPersonas] = useState(true);

    const linkedPersonaId = note.person?.persona_id || note.group?.persona_id;
    const inheritedPersonaId = note.person?.inherited_persona?.id;
    const recommendedPersonaId = linkedPersonaId || inheritedPersonaId;
    const recommendedPersona = personas.find(p => p.id === recommendedPersonaId);

    useEffect(() => {
        const fetchSuggestions = async () => {
            try {
                const sugData = await api.get<any[]>(`/api/references/suggest?note_id=${note.id}`);
                setSuggestions(sugData);
            } catch (err) {
                console.error('Failed to fetch suggestions:', err);
            }
        };

        const fetchPersonas = async () => {
            setLoadingPersonas(true);
            try {
                const personaData = await api.get<Persona[]>('/api/framework/personas');
                setPersonas(personaData);
            } catch (err) {
                console.error('Failed to fetch personas:', err);
            } finally {
                setLoadingPersonas(false);
            }
        };

        fetchSuggestions();
        fetchPersonas();
    }, [note.id]);

    const handleDraft = async () => {
        setIsAutoDrafting(true);
        try {
            const url = `/api/framework/draft-message?note_id=${note.id}`;
            const resp = await api.post<any>(url, {});
            setDrafts(prev => ({ ...prev, [resp.persona_id]: resp.draft }));
        } catch (err) {
            console.error('Failed to draft message:', err);
            alert('Failed to draft message. Ensure a persona is linked or inherited.');
        } finally {
            setIsAutoDrafting(false);
        }
    };

    const activeDraft = recommendedPersonaId ? drafts[recommendedPersonaId] : null;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div className="card" style={{ background: 'var(--bg-deep)', border: '1px solid var(--border)', padding: '24px' }}>
                <h3 style={{ fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--primary)', marginBottom: '16px', letterSpacing: '0.1em' }}>
                    AI Follow-up
                </h3>
                
                {loadingPersonas ? (
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Resolving persona...</p>
                ) : !recommendedPersona ? (
                    <div style={{ padding: '16px', background: 'rgba(239, 68, 68, 0.05)', borderRadius: '12px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>
                            No professional persona is linked to this person or group. Please configure one in the Framework settings.
                        </p>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: 'var(--bg-card)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                            <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: 'white' }}>
                                {recommendedPersona.name[0]}
                            </div>
                            <div>
                                <div style={{ fontSize: '0.85rem', fontWeight: 700 }}>{recommendedPersona.name}</div>
                                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    {linkedPersonaId ? 'Directly Linked' : 'Inherited from Group'}
                                </div>
                            </div>
                        </div>

                        <button 
                            className="btn-primary" 
                            style={{ width: '100%', padding: '12px' }}
                            onClick={handleDraft}
                            disabled={isAutoDrafting}
                        >
                            {isAutoDrafting ? 'Drafting Message...' : 'Draft Message'}
                        </button>

                        {activeDraft && (
                            <div style={{ 
                                marginTop: '12px', 
                                padding: '16px', 
                                background: 'rgba(56, 189, 248, 0.05)', 
                                borderRadius: '12px',
                                fontSize: '0.9rem',
                                lineHeight: '1.6',
                                color: 'var(--text-main)',
                                border: '1px solid var(--primary)',
                                position: 'relative'
                            }}>
                                <div style={{ whiteSpace: 'pre-wrap' }}>{activeDraft}</div>
                                <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
                                    <button 
                                        className="btn-secondary" 
                                        style={{ fontSize: '0.75rem', fontWeight: 600 }} 
                                        onClick={() => {
                                            navigator.clipboard.writeText(activeDraft);
                                            alert('Draft copied to clipboard');
                                        }}
                                    >
                                        Copy to Clipboard
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            <div className="card" style={{ background: 'var(--bg-deep)', border: '1px solid var(--border)', padding: '24px' }}>
                <h3 style={{ fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--primary)', marginBottom: '16px', letterSpacing: '0.1em' }}>
                    Reference Suggestions
                </h3>
                {suggestions.length === 0 ? (
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>No relevant references found.</p>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {suggestions.map((sug, idx) => (
                            <div key={idx} style={{ padding: '12px', background: 'var(--bg-card)', borderRadius: '8px', borderLeft: '3px solid var(--primary)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                    <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{sug.title || sug.reference.title}</span>
                                    {sug.score && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{Math.round(sug.score * 100)}% Match</span>}
                                </div>
                                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                    {sug.body || sug.reference.body}
                                </p>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default NoteUtilities;
