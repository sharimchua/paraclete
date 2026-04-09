import React, { useEffect, useState } from 'react';
import { api, DashboardStats, CalendarDay, TrendPoint, ReferenceUsage, Note, Person, Group } from '../services/api';
import PracticeCalendar from './PracticeCalendar';

interface Props {
    onSelectNote: (id: number) => void;
    onStartNote: (date: string, personId?: number, groupId?: number) => void;
}

const Dashboard: React.FC<Props> = ({ onSelectNote, onStartNote }) => {
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [calendarData, setCalendarData] = useState<CalendarDay[]>([]);
    const [trends, setTrends] = useState<TrendPoint[]>([]);
    const [references, setReferences] = useState<ReferenceUsage[]>([]);
    const [dateNotes, setDateNotes] = useState<Note[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedDate, setSelectedDate] = useState<string>(() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });

    // Modal state
    const [showModal, setShowModal] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [people, setPeople] = useState<Person[]>([]);
    const [groups, setGroups] = useState<Group[]>([]);
    const [isFetchingTargets, setIsFetchingTargets] = useState(false);

    useEffect(() => {
        const fetchBaseData = async () => {
            try {
                const [s, c, t, r] = await Promise.all([
                    api.get<DashboardStats>('/dashboard/stats'),
                    api.get<CalendarDay[]>('/dashboard/calendar'),
                    api.get<TrendPoint[]>('/dashboard/trends'),
                    api.get<ReferenceUsage[]>('/dashboard/reference-usage')
                ]);
                setStats(s);
                setCalendarData(c);
                setTrends(t);
                setReferences(r);
                setLoading(false);
            } catch (err) {
                console.error('Failed to fetch dashboard data', err);
                setLoading(false);
            }
        };

        fetchBaseData();
    }, []);

    useEffect(() => {
        const fetchNotesByDate = async () => {
            try {
                const notes = await api.get<Note[]>(`/notes/by-date/${selectedDate}`);
                setDateNotes(notes);
            } catch (err) {
                console.error('Failed to fetch notes for date', err);
            }
        };

        fetchNotesByDate();
    }, [selectedDate]);

    const handleOpenModal = async () => {
        setShowModal(true);
        if (people.length === 0 && groups.length === 0) {
            setIsFetchingTargets(true);
            try {
                const [p, g] = await Promise.all([
                    api.get<Person[]>('/persons/'),
                    api.get<Group[]>('/groups/')
                ]);
                setPeople(p);
                setGroups(g);
            } catch (err) {
                console.error('Failed to fetch targets', err);
            } finally {
                setIsFetchingTargets(false);
            }
        }
    };

    const filteredTargets = [
        ...people.map(p => ({ ...p, type: 'person' as const })),
        ...groups.map(g => ({ ...g, type: 'group' as const }))
    ].filter(t => t.name.toLowerCase().includes(searchQuery.toLowerCase()));

    if (loading) return <div className="loader" />;

    return (
        <div className="dashboard-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) minmax(300px, 1fr) minmax(280px, 0.8fr)', gap: '24px' }}>
            {/* Target Selection Modal */}
            {showModal && (
                <div className="modal-overlay">
                    <div className="modal-content card" style={{ width: '450px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', padding: '24px' }}>
                        <header style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h3 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Select Session Target</h3>
                                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>Who is this session for on {selectedDate}?</p>
                            </div>
                            <button onClick={() => setShowModal(false)} className="btn-secondary" style={{ padding: '4px 8px' }}>&times;</button>
                        </header>

                        <div style={{ marginBottom: '20px' }}>
                            <input 
                                className="input-field" 
                                placeholder="Search people or groups..." 
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                autoFocus
                                style={{ width: '100%', padding: '12px' }}
                            />
                        </div>

                        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {isFetchingTargets ? (
                                <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><div className="loader" style={{ scale: '0.6' }} /></div>
                            ) : filteredTargets.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>
                                    {searchQuery ? 'No results found.' : 'No entities available. Create a person or group first.'}
                                </div>
                            ) : (
                                filteredTargets.map(target => (
                                    <div 
                                        key={`${target.type}-${target.id}`} 
                                        className="clickable-card" 
                                        style={{ 
                                            padding: '12px 16px', 
                                            background: 'var(--bg-surface)', 
                                            borderRadius: '8px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            border: '1px solid var(--border-color)'
                                        }}
                                        onClick={() => {
                                            if (target.type === 'person') onStartNote(selectedDate, target.id, undefined);
                                            else onStartNote(selectedDate, undefined, target.id);
                                            setShowModal(false);
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            <span style={{ fontSize: '1.2rem' }}>{target.type === 'person' ? '👤' : '👥'}</span>
                                            <div>
                                                <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{target.name}</div>
                                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{target.type}</div>
                                            </div>
                                        </div>
                                        <span style={{ color: 'var(--primary)', fontWeight: 600, fontSize: '0.8rem' }}>Select</span>
                                    </div>
                                ))
                            )}
                        </div>

                        <div 
                            style={{ 
                                marginTop: '16px', 
                                padding: '12px', 
                                background: 'var(--primary-faded)', 
                                borderRadius: '8px', 
                                border: '1px dashed var(--primary)',
                                display: 'flex',
                                justifyContent: 'center',
                                cursor: 'pointer'
                            }}
                            onClick={() => {
                                onStartNote(selectedDate, undefined, undefined);
                                setShowModal(false);
                            }}
                        >
                            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--primary)' }}>+ Create General Session (No Target)</span>
                        </div>
                    </div>
                </div>
            )}

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

                <PracticeCalendar 
                    data={calendarData} 
                    selectedDate={selectedDate}
                    onSelectDate={setSelectedDate}
                />
            </div>

            {/* Trends and References */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <div className="card">
                    <h4 style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase', marginBottom: '20px' }}>Session Trends</h4>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', height: '140px', paddingBottom: '20px', paddingLeft: '8px', paddingRight: '8px' }}>
                        {trends.length === 0 ? (
                            <div style={{ width: '100%', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>No data yet</div>
                        ) : (() => {
                            // Stable Color Mapping
                            const colors = ['var(--primary)', 'var(--secondary)', '#8b5cf6', '#ec4899', '#f97316', '#14b8a6'];
                            const allCategories = Array.from(new Set(trends.flatMap(t => t.stacks.map(s => s.name)))).sort();
                            const categoryColorMap: Record<string, string> = {};
                            allCategories.forEach((cat, i) => {
                                categoryColorMap[cat] = cat === 'None' ? 'var(--bg-surface)' : colors[i % colors.length];
                            });

                            return trends.slice(-6).map(t => { // Last 6 months
                                const max = Math.max(...trends.map(x => x.count), 1);
                                return (
                                    <div key={t.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', height: '100%' }}>
                                        <div style={{ 
                                            flex: 1, 
                                            width: '100%', 
                                            display: 'flex', 
                                            flexDirection: 'column-reverse', 
                                            justifyContent: 'flex-start',
                                            paddingTop: '10px'
                                        }}>
                                            {[...t.stacks].sort((a, b) => a.name.localeCompare(b.name)).map((stack, idx, sortedStacks) => {
                                                const height = (stack.count / max) * 100;
                                                return (
                                                    <div 
                                                        key={stack.name}
                                                        title={`${stack.name}: ${stack.count}`}
                                                        style={{
                                                            width: '100%',
                                                            height: `${height}%`,
                                                            background: categoryColorMap[stack.name],
                                                            border: stack.name === 'None' ? '1px solid var(--border-color)' : 'none',
                                                            borderRadius: idx === 0 ? '0 0 4px 4px' : (idx === sortedStacks.length - 1 ? '4px 4px 0 0' : '0'),
                                                            opacity: 0.85,
                                                            transition: 'height 0.4s ease'
                                                        }}
                                                    />
                                                );
                                            })}
                                        </div>
                                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{t.label}</div>
                                    </div>
                                );
                            });
                        })()}
                    </div>
                    {/* Tiny Legend */}
                    {trends.length > 0 && (() => {
                        const colors = ['var(--primary)', 'var(--secondary)', '#8b5cf6', '#ec4899', '#f97316', '#14b8a6'];
                        const allCategories = Array.from(new Set(trends.flatMap(t => t.stacks.map(s => s.name)))).sort();
                        
                        return (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '14px', padding: '0 8px' }}>
                                {allCategories.map((stackName, i) => (
                                    <div key={stackName} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <div style={{ 
                                            width: '8px', 
                                            height: '8px', 
                                            borderRadius: '2px', 
                                            background: stackName === 'None' ? 'var(--bg-surface)' : colors[i % colors.length], 
                                            border: stackName === 'None' ? '1px solid var(--border-color)' : 'none' 
                                        }} />
                                        <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>{stackName}</span>
                                    </div>
                                ))}
                            </div>
                        );
                    })()}
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h4 style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase' }}>
                        Notes for {new Date(selectedDate + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </h4>
                    <button 
                        className="btn-primary" 
                        onClick={handleOpenModal}
                        style={{ 
                            width: '28px', 
                            height: '28px', 
                            padding: 0, 
                            borderRadius: '50%', 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center',
                            fontSize: '1.2rem',
                            fontWeight: 400
                        }}
                        title="Add note for this date"
                    >
                        +
                    </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1, overflowY: 'auto', maxHeight: '500px' }}>
                    {dateNotes.length === 0 ? (
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center', padding: '24px' }}>No sessions on this day.</div>
                    ) : (
                        dateNotes.map(note => (
                            <div 
                                key={note.id} 
                                onClick={() => onSelectNote(note.id)}
                                style={{ 
                                    padding: '12px', 
                                    background: 'var(--bg-surface)', 
                                    borderRadius: '8px',
                                    borderLeft: '3px solid var(--primary)',
                                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                                    cursor: 'pointer'
                                }}
                                className="clickable-card"
                            >
                                <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '2px' }}>{note.title}</div>
                                
                                <div style={{ marginBottom: '8px' }}>
                                    {note.person && (
                                        <span style={{ fontSize: '0.7rem', color: 'var(--primary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            👤 {note.person.name}
                                        </span>
                                    )}
                                    {note.group && (
                                        <span style={{ fontSize: '0.7rem', color: 'var(--secondary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            👥 {note.group.name}
                                        </span>
                                    )}
                                </div>

                                <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span>{new Date(note.date + 'T00:00:00').toLocaleDateString()}</span>
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
