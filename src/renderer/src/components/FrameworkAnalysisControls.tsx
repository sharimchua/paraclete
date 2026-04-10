import React, { useState, useEffect } from 'react';
import { api } from '../services/api';

interface Props {
    personId?: number;
    groupId?: number;
    personaId?: number;
    title?: string;
    onStarted?: (jobId: string) => void;
}

const FrameworkAnalysisControls: React.FC<Props> = ({ personId, groupId, personaId, title, onStarted }) => {
    const [counts, setCounts] = useState<{ notes: number, messages: number, references: number, total: number } | null>(null);
    const [loading, setLoading] = useState(false);
    const [busy, setBusy] = useState(false);

    const fetchCounts = async () => {
        setLoading(true);
        try {
            let url = '/api/framework/pending-count';
            const params = new URLSearchParams();
            if (personId) params.append('person_id', personId.toString());
            if (groupId) params.append('group_id', groupId.toString());
            if (personaId) params.append('persona_id', personaId.toString());
            
            const queryString = params.toString();
            if (queryString) url += `?${queryString}`;
            
            const data = await api.get<any>(url);
            setCounts(data);
        } catch (err) {
            console.error('Failed to fetch pending counts:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchCounts();
    }, [personId, groupId, personaId]);

    const handleAnalyze = async () => {
        if (!counts || counts.total === 0) return;
        
        setBusy(true);
        try {
            let url = '/api/framework/analyze';
            const params = new URLSearchParams();
            if (personId) params.append('person_id', personId.toString());
            if (groupId) params.append('group_id', groupId.toString());
            if (personaId) params.append('persona_id', personaId.toString());
            
            const queryString = params.toString();
            if (queryString) url += `?${queryString}`;

            const resp = await api.post<any>(url, {});
            if (onStarted && resp.job_ids?.[0]) onStarted(resp.job_ids[0]);
            // Non-intrusive: reset count and let background worker handle it
            setCounts({ notes: 0, messages: 0, references: 0, total: 0 });
        } catch (err) {
            console.error('Failed to trigger analysis:', err);
        } finally {
            setBusy(false);
        }
    };

    if (loading) return <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Calculating artifact backlog...</div>;

    if (!counts || counts.total === 0) {
        return (
            <div style={{ padding: '16px', borderRadius: '12px', background: 'rgba(255,255,255,0.02)', border: '1px dashed var(--border)' }}>
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                    Framework is up to date. No new artifacts found for analysis.
                </p>
            </div>
        );
    }

    return (
        <div style={{ 
            padding: '20px', 
            borderRadius: '16px', 
            background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.05) 0%, rgba(56, 189, 248, 0) 100%)', 
            border: '1px solid rgba(56, 189, 248, 0.2)',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: 'var(--primary)' }}>
                        {title || 'Framework Analysis Backlog'}
                    </h4>
                    <p style={{ margin: '4px 0 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        {counts.total} new artifacts found (Notes, Messages, Refs)
                    </p>
                </div>
                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--primary)', opacity: 0.5 }}>
                    {counts.total}
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                <div style={{ textAlign: 'center', padding: '8px', background: 'var(--bg-deep)', borderRadius: '8px' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Notes</div>
                    <div style={{ fontWeight: 700 }}>{counts.notes}</div>
                </div>
                <div style={{ textAlign: 'center', padding: '8px', background: 'var(--bg-deep)', borderRadius: '8px' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Msgs</div>
                    <div style={{ fontWeight: 700 }}>{counts.messages}</div>
                </div>
                <div style={{ textAlign: 'center', padding: '8px', background: 'var(--bg-deep)', borderRadius: '8px' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Refs</div>
                    <div style={{ fontWeight: 700 }}>{counts.references}</div>
                </div>
            </div>

            <button 
                className="btn-primary" 
                style={{ width: '100%', padding: '12px', background: 'var(--primary)', borderRadius: '10px' }}
                onClick={handleAnalyze}
                disabled={busy}
            >
                {busy ? 'Starting Job...' : `Analyze ${counts.total} Artifacts`}
            </button>
            <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--text-muted)', textAlign: 'center', fontStyle: 'italic' }}>
                Runs in background. Results appear in Proposals.
            </p>
        </div>
    );
};

export default FrameworkAnalysisControls;
