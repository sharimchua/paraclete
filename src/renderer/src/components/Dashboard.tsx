import React, { useEffect, useState } from 'react';
import { api, DashboardStats, CalendarDay, TrendPoint, ReferenceUsage, Note } from '../services/api';
import PracticeCalendar from './PracticeCalendar';

const Dashboard: React.FC = () => {
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [calendarData, setCalendarData] = useState<CalendarDay[]>([]);
    const [trends, setTrends] = useState<TrendPoint[]>([]);
    const [references, setReferences] = useState<ReferenceUsage[]>([]);
    const [recentNotes, setRecentNotes] = useState<Note[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            try {
                // Parallel fetch for speed
                const [s, c, t, r, n] = await Promise.all([
                    api.get<DashboardStats>('/dashboard/stats'),
                    api.get<CalendarDay[]>('/dashboard/calendar'),
                    api.get<TrendPoint[]>('/dashboard/trends'),
                    api.get<ReferenceUsage[]>('/dashboard/reference-usage'),
                    api.get<Note[]>('/dashboard/recent-notes')
                ]);
                setStats(s);
                setCalendarData(c);
                setTrends(t);
                setReferences(r);
                setRecentNotes(n);
                setLoading(false);
            } catch (err) {
                console.error('Failed to fetch dashboard data', err);
                setLoading(false);
            }
        };

        fetchData();
    }, []);

    if (loading) return <div className="loader" />;

    return (
        <div className="dashboard-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) minmax(300px, 1fr) minmax(280px, 0.8fr)', gap: '24px' }}>
            {/* Quick Stats Column */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <div className="card">
                    <h4 style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase', marginBottom: '16px' }}>Practice Overview</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        <div style={{ padding: '12px', background: 'var(--bg-surface)', borderRadius: '8px' }}>
                            <div style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--primary)' }}>{stats?.person_count || 0}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>People</div>
                        </div>
                        <div style={{ padding: '12px', background: 'var(--bg-surface)', borderRadius: '8px' }}>
                            <div style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--primary)' }}>{stats?.note_count || 0}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Notes</div>
                        </div>
                        <div style={{ padding: '12px', background: 'var(--bg-surface)', borderRadius: '8px' }}>
                            <div style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--secondary)' }}>{stats?.group_count || 0}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Groups</div>
                        </div>
                        <div style={{ padding: '12px', background: 'var(--bg-surface)', borderRadius: '8px' }}>
                            <div style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--secondary)' }}>{stats?.reference_count || 0}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>References</div>
                        </div>
                    </div>
                </div>

                <PracticeCalendar data={calendarData} />
            </div>

            {/* Trends and References */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <div className="card">
                    <h4 style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase', marginBottom: '20px' }}>Session Trends</h4>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', height: '140px', paddingBottom: '20px', paddingLeft: '8px', paddingRight: '8px' }}>
                        {trends.length === 0 ? (
                            <div style={{ width: '100%', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>No data yet</div>
                        ) : (
                            trends.slice(-6).map(t => { // Last 6 months
                                const max = Math.max(...trends.map(x => x.count), 1);
                                const height = (t.count / max) * 100;
                                return (
                                    <div key={t.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                                        <div style={{ 
                                            width: '100%', 
                                            height: `${Math.max(height, 5)}%`, 
                                            background: 'var(--primary)', 
                                            borderRadius: '4px 4px 0 0',
                                            opacity: 0.8,
                                            transition: 'height 0.5s ease'
                                        }} />
                                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{t.label}</div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                <div className="card" style={{ flex: 1 }}>
                    <h4 style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase', marginBottom: '16px' }}>Top References</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {references.length === 0 ? (
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center', padding: '24px' }}>No references linked yet.</div>
                        ) : (
                            references.map(r => (
                                <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px', background: 'var(--bg-surface)', borderRadius: '6px' }}>
                                    <div style={{ fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '180px' }}>{r.title}</div>
                                    <div style={{ 
                                        padding: '2px 8px', 
                                        borderRadius: '12px', 
                                        fontSize: '0.7rem',
                                        color: 'var(--primary)',
                                        fontWeight: 700,
                                        border: '1px solid var(--primary-faded)'
                                    }}>
                                        {r.usage_count} uses
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            {/* Recent Activity */}
            <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
                <h4 style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase', marginBottom: '16px' }}>Recent Notes</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>
                    {recentNotes.length === 0 ? (
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center', padding: '24px' }}>No notes captured yet.</div>
                    ) : (
                        recentNotes.map(note => (
                            <div key={note.id} style={{ 
                                padding: '12px', 
                                background: 'var(--bg-surface)', 
                                borderRadius: '8px',
                                borderLeft: '3px solid var(--primary)',
                                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                            }}>
                                <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '4px' }}>{note.title}</div>
                                <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span>{new Date(note.date).toLocaleDateString()}</span>
                                    <span style={{ 
                                        color: 'var(--primary)', 
                                        fontWeight: 800, 
                                        fontSize: '0.6rem',
                                        textTransform: 'uppercase',
                                        background: 'var(--primary-faded)',
                                        padding: '2px 6px',
                                        borderRadius: '4px'
                                    }}>{note.stage}</span>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
