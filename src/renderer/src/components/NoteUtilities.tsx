import React, { useState, useEffect } from 'react';
import { api, Note } from '../services/api';
import { toast } from './ToastProvider';

interface Props {
    note: Note;
}

const NoteUtilities: React.FC<Props> = ({ note }) => {
    const [suggestions, setSuggestions] = useState<any[]>([]);
    const [proposals, setProposals] = useState<any[]>([]);
    const [isExtracting, setIsExtracting] = useState(false);

    const fetchProposals = async () => {
        try {
            const propData = await api.get<any[]>(`/api/references/proposals?note_id=${note.id}&status=pending`);
            setProposals(propData);
            
            // If we're extracting and we find proposals, we might want to keep polling or stop 
            // based on job status, but for now we'll just check jobs too.
            const jobs = await api.get<any[]>('/api/admin/jobs');
            const myJob = jobs.find(j => j.name === `Extract Concepts: Note #${note.id}` && (j.status === 'pending' || j.status === 'running'));
            setIsExtracting(!!myJob);
        } catch (err) {
            console.error('Failed to fetch proposals:', err);
        }
    };

    useEffect(() => {
        const fetchSuggestions = async () => {
            try {
                const sugData = await api.get<any[]>(`/api/references/suggest?note_id=${note.id}`);
                setSuggestions(sugData);
                await fetchProposals();
            } catch (err) {
                console.error('Failed to fetch suggestions:', err);
            }
        };

        fetchSuggestions();
        
        // Interval for polling if extracting
        const interval = setInterval(() => {
            fetchProposals();
        }, 5000);

        return () => clearInterval(interval);
    }, [note.id]);

    const extractConcepts = async () => {
        try {
            setIsExtracting(true);
            await api.post(`/api/references/extract-from-note/${note.id}`, {});
            toast.success(`Concept extraction queued in background.`);
        } catch (err: any) {
            console.error(err);
            toast.error(err.response?.data?.detail || 'Failed to trigger extraction');
            setIsExtracting(false);
        }
    };

    const acceptProposal = async (prop: any) => {
        try {
            await api.post(`/api/references/proposals/${prop.id}/accept`, {});
            toast.success('Added to Reference Library');
            
            // Move from proposals to suggestions (or just refresh)
            setProposals(prev => prev.filter(p => p.id !== prop.id));
            const sugData = await api.get<any[]>(`/api/references/suggest?note_id=${note.id}`);
            setSuggestions(sugData);
        } catch (err) {
            console.error(err);
            toast.error('Failed to accept proposal');
        }
    };

    const rejectProposal = async (prop: any) => {
        try {
            await api.post(`/api/references/proposals/${prop.id}/reject`, {});
            setProposals(prev => prev.filter(p => p.id !== prop.id));
            toast.success('Proposal dismissed');
        } catch (err) {
            console.error(err);
            toast.error('Failed to reject proposal');
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div className="card" style={{ background: 'var(--bg-deep)', border: '1px solid var(--border)', padding: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h3 style={{ fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--primary)', margin: 0, letterSpacing: '0.1em' }}>
                        References
                    </h3>
                    <button 
                        onClick={extractConcepts}
                        className="btn-secondary" 
                        disabled={isExtracting}
                        style={{ fontSize: '0.7rem', padding: '4px 8px', opacity: isExtracting ? 0.5 : 1 }}
                    >
                        {isExtracting ? '⌛ Extracting...' : '💡 Extract Concepts'}
                    </button>
                </div>

                {/* Proposals Section */}
                {proposals.length > 0 && (
                    <div style={{ marginBottom: '24px' }}>
                        <h4 style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--secondary)', marginBottom: '12px' }}>
                            Proposed Concepts
                        </h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {proposals.map((prop) => (
                                <div key={prop.id} style={{ 
                                    padding: '12px', 
                                    background: 'var(--bg-card)', 
                                    borderRadius: '8px', 
                                    borderLeft: '3px solid var(--secondary)',
                                    position: 'relative'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                        <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{prop.title}</span>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <button 
                                                onClick={() => acceptProposal(prop)}
                                                style={{ 
                                                    fontSize: '0.65rem', 
                                                    padding: '2px 6px', 
                                                    background: 'var(--secondary)', 
                                                    color: 'white', 
                                                    border: 'none', 
                                                    borderRadius: '4px',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                Accept
                                            </button>
                                            <button 
                                                onClick={() => rejectProposal(prop)}
                                                style={{ 
                                                    fontSize: '0.65rem', 
                                                    padding: '2px 6px', 
                                                    background: 'transparent', 
                                                    color: 'var(--text-muted)', 
                                                    border: '1px solid var(--border)', 
                                                    borderRadius: '4px',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                ×
                                            </button>
                                        </div>
                                    </div>
                                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                        {prop.body}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Matches Section */}
                <h4 style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '12px' }}>
                    Relevant Library Items
                </h4>
                {suggestions.length === 0 ? (
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>No relevant references yet.</p>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {suggestions.map((sug, idx) => (
                            <div key={idx} style={{ 
                                padding: '12px', 
                                background: 'var(--bg-card)', 
                                borderRadius: '8px', 
                                borderLeft: '3px solid var(--primary)',
                                opacity: 0.8
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                    <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{sug.title || sug.reference?.title}</span>
                                    {sug.score && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{Math.round(sug.score * 100)}% Match</span>}
                                </div>
                                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                    {sug.body || sug.reference?.body}
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
