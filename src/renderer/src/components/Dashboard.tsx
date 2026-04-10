import React, { useEffect, useState } from 'react';
import { api, DashboardStats, CalendarDay, TrendPoint, LeaderboardEntry, Note, Message } from '../services/api';
import PracticeCalendar from './PracticeCalendar';
import EntitySelectionModal from './EntitySelectionModal';

interface Props {
    onSelectNote: (id: number) => void;
    onStartNote: (date: string, personId?: number, groupId?: number) => void;
}

const Dashboard: React.FC<Props> = ({ onSelectNote, onStartNote }) => {
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [calendarData, setCalendarData] = useState<CalendarDay[]>([]);
    const [trends, setTrends] = useState<TrendPoint[]>([]);
    const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
    const [dateNotes, setDateNotes] = useState<Note[]>([]);
    const [dateMessages, setDateMessages] = useState<Message[]>([]);
    const [pendingCount, setPendingCount] = useState<number>(0);
    const [loading, setLoading] = useState(true);
    const [selectedDate, setSelectedDate] = useState<string>(() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });

    // Modal state
    const [showModal, setShowModal] = useState(false);

    useEffect(() => {
        const fetchBaseData = async () => {
            try {
                const [s, c, t, l, p] = await Promise.all([
                    api.get<DashboardStats>('/dashboard/stats'),
                    api.get<CalendarDay[]>('/dashboard/calendar'),
                    api.get<TrendPoint[]>('/dashboard/trends'),
                    api.get<LeaderboardEntry[]>('/dashboard/person-leaderboard'),
                    api.get<{ count: number }>('/api/framework/pending-count')
                ]);
                setStats(s);
                setCalendarData(c);
                setTrends(t);
                setLeaderboard(l);
                setPendingCount(p.count);
                setLoading(false);
            } catch (err) {
                console.error('Failed to fetch dashboard data', err);
                setLoading(false);
            }
        };

        fetchBaseData();
    }, []);

    useEffect(() => {
        const fetchDayActivity = async () => {
            try {
                const [notes, messages] = await Promise.all([
                    api.get<Note[]>(`/notes/by-date/${selectedDate}`),
                    api.get<Message[]>(`/messages/by-date/${selectedDate}`)
                ]);
                setDateNotes(notes);
                setDateMessages(messages);
            } catch (err) {
                console.error('Failed to fetch activity for date', err);
            }
        };

        fetchDayActivity();
    }, [selectedDate]);

    const handleOpenModal = () => {
        setShowModal(true);
    };

    if (loading) return <div className="loader" />;

    return (
        <div className="dashboard-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) minmax(300px, 1fr) minmax(280px, 0.8fr)', gap: '24px' }}>
            {/* Target Selection Modal */}
            {showModal && (
                <EntitySelectionModal
                    title="Select Session Target"
                    subtitle={`Who is this session for on ${selectedDate}?`}
                    onClose={() => setShowModal(false)}
                    onSelect={(target) => {
                        if (target.type === 'person') onStartNote(selectedDate, target.id, undefined);
                        else if (target.type === 'group') onStartNote(selectedDate, undefined, target.id);
                        else onStartNote(selectedDate, undefined, undefined);
                        setShowModal(false);
                    }}
                />
            )}

            {/* Column 1: Stats and Trends */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <div className="card">
                    <h4 style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase', marginBottom: '16px' }}>Practice Overview</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '12px' }}>
                        <div style={{ padding: '12px', background: 'var(--bg-surface)', borderRadius: '8px' }}>
                            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--primary)' }}>{stats?.person_count || 0}</div>
                            <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>People</div>
                        </div>
                        <div style={{ padding: '12px', background: 'var(--bg-surface)', borderRadius: '8px' }}>
                            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--primary)' }}>{stats?.note_count || 0}</div>
                            <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>Notes</div>
                        </div>
                        <div style={{ padding: '12px', background: 'var(--bg-surface)', borderRadius: '8px' }}>
                            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--secondary)' }}>{stats?.group_count || 0}</div>
                            <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>Groups</div>
                        </div>
                        <div style={{ padding: '12px', background: 'var(--bg-surface)', borderRadius: '8px' }}>
                            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--secondary)' }}>{stats?.reference_count || 0}</div>
                            <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>Refs</div>
                        </div>
                        <div style={{ padding: '12px', background: 'var(--bg-surface)', borderRadius: '8px' }}>
                            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#fbbf24' }}>{stats?.message_count || 0}</div>
                            <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>Messages</div>
                        </div>
                        <div style={{ 
                            padding: '12px', 
                            background: pendingCount > 0 ? 'rgba(59, 130, 246, 0.1)' : 'var(--bg-surface)', 
                            borderRadius: '8px',
                            border: pendingCount > 0 ? '1px solid var(--primary-faded)' : '1px solid transparent',
                            cursor: 'pointer'
                        }} onClick={() => window.dispatchEvent(new CustomEvent('open-paraclete'))}>
                            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--primary)' }}>{pendingCount}</div>
                            <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>Pending IQ</div>
                        </div>
                    </div>
                </div>

                <div className="card">
                    <h4 style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase', marginBottom: '20px' }}>Session Trends</h4>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', height: '260px', paddingBottom: '20px', paddingLeft: '8px', paddingRight: '8px' }}>
                        {trends.length === 0 ? (
                            <div style={{ width: '100%', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>No data yet</div>
                        ) : (() => {
                            // Stable Color Mapping
                            const colors = ['var(--primary)', 'var(--secondary)', '#8b5cf6', '#ec4899', '#f97316', '#14b8a6'];
                            const allCategories = Array.from(new Set(trends.flatMap(t => t.stacks.map(s => s.name))))
                                .filter(c => c !== 'None')
                                .sort();
                            
                            const categoryColorMap: Record<string, string> = {
                                'None': 'rgba(255, 255, 255, 0.4)'
                            };
                            allCategories.forEach((cat, i) => {
                                categoryColorMap[cat] = colors[i % colors.length];
                            });

                            return trends.slice(-6).map(t => { // Last 6 months
                                const max = Math.max(...trends.map(x => x.count), 1);
                                return (
                                    <div key={t.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%', position: 'relative' }}>
                                        {/* Dynamic Height Stack Wrapper */}
                                        <div style={{ 
                                            width: '100%', 
                                            height: `${(t.count / max) * 100}%`,
                                            display: 'flex', 
                                            flexDirection: 'column-reverse', 
                                            position: 'relative',
                                            paddingBottom: '0px'
                                        }}>
                                            {/* Floating Total Count */}
                                            <div style={{ 
                                                position: 'absolute', 
                                                top: '-18px', 
                                                width: '100%', 
                                                textAlign: 'center',
                                                fontSize: '0.65rem', 
                                                fontWeight: 700, 
                                                color: 'var(--text-secondary)', 
                                                opacity: 0.9 
                                            }}>
                                                {t.count}
                                            </div>

                                            {[...t.stacks].sort((a, b) => {
                                                if (a.name === 'None') return 1;
                                                if (b.name === 'None') return -1;
                                                return a.name.localeCompare(b.name);
                                            }).map((stack, idx, sortedStacks) => {
                                                // Calculate relative height inside this specific month's total
                                                const height = (stack.count / t.count) * 100;
                                                return (
                                                    <div 
                                                        key={stack.name}
                                                        title={`${stack.name}: ${stack.count}`}
                                                        style={{
                                                            width: '100%',
                                                            height: `${height}%`,
                                                            background: categoryColorMap[stack.name] || 'var(--text-muted)',
                                                            border: stack.name === 'None' ? '1px solid var(--text-muted)' : 'none',
                                                            borderRadius: idx === 0 ? '0 0 4px 4px' : (idx === sortedStacks.length - 1 ? '4px 4px 0 0' : '0'),
                                                            opacity: 0.85,
                                                            transition: 'all 0.4s ease'
                                                        }}
                                                    />
                                                );
                                            })}
                                        </div>
                                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '8px' }}>{t.label}</div>
                                    </div>
                                );
                            });
                        })()}
                    </div>
                    {/* Tiny Legend */}
                    {trends.length > 0 && (() => {
                        const colors = ['var(--primary)', 'var(--secondary)', '#8b5cf6', '#ec4899', '#f97316', '#14b8a6'];
                        const allCategories = Array.from(new Set(trends.flatMap(t => t.stacks.map(s => s.name))))
                            .sort((a, b) => {
                                if (a === 'None') return 1;
                                if (b === 'None') return -1;
                                return a.localeCompare(b);
                            });
                        
                        const categoryColorMap: Record<string, string> = {
                            'None': 'rgba(255, 255, 255, 0.4)'
                        };
                        allCategories.filter(c => c !== 'None').forEach((cat, i) => {
                            categoryColorMap[cat] = colors[i % colors.length];
                        });
                        
                        return (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '14px', padding: '0 8px' }}>
                                {allCategories.map((stackName) => (
                                    <div key={stackName} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <div style={{ 
                                            width: '8px', 
                                            height: '8px', 
                                            borderRadius: '2px', 
                                            background: categoryColorMap[stackName], 
                                            border: stackName === 'None' ? '1px solid var(--text-muted)' : 'none' 
                                        }} />
                                        <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
                                            {stackName === 'None' ? 'Untagged' : stackName}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        );
                    })()}
                </div>
            </div>

            {/* Column 2: Calendar and Leaderboard */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <PracticeCalendar 
                    data={calendarData} 
                    selectedDate={selectedDate}
                    onSelectDate={setSelectedDate}
                />

                <div className="card" style={{ flex: 1 }}>
                    <h4 style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase', marginBottom: '16px' }}>Top People (Last 3m)</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {leaderboard.length === 0 ? (
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center', padding: '24px' }}>No session activity yet.</div>
                        ) : (
                            leaderboard.map(p => (
                                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px', background: 'var(--bg-surface)', borderRadius: '6px' }}>
                                    <div style={{ fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '180px' }}>{p.name}</div>
                                    <div style={{ 
                                        padding: '2px 8px', 
                                        borderRadius: '12px', 
                                        fontSize: '0.7rem',
                                        color: 'var(--primary)',
                                        fontWeight: 700,
                                        border: '1px solid var(--primary-faded)'
                                    }}>
                                        {p.note_count} sessions
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            {/* Column 3: Recent Activity Split */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                {/* Notes Widget */}
                <div className="card" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: '300px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <h4 style={{ color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                            Session Notes
                        </h4>
                        <button 
                            className="btn-primary" 
                            onClick={handleOpenModal}
                            style={{ 
                                width: '24px', 
                                height: '24px', 
                                padding: 0, 
                                borderRadius: '50%', 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'center',
                                fontSize: '1.1rem',
                                fontWeight: 400
                            }}
                            title="Add note for this date"
                        >
                            +
                        </button>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto' }}>
                        {dateNotes.length > 0 ? (
                            dateNotes.map(note => (
                                <div 
                                    key={note.id} 
                                    onClick={() => onSelectNote(note.id)}
                                    style={{ 
                                        padding: '12px', 
                                        background: 'var(--bg-surface)', 
                                        borderRadius: '8px',
                                        borderLeft: '3px solid var(--primary)',
                                        cursor: 'pointer'
                                    }}
                                    className="clickable-card"
                                >
                                    <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '2px' }}>{note.title}</div>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                        {note.person ? `👤 ${note.person.name}` : (note.group ? `👥 ${note.group.name}` : 'Unassigned')}
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', textAlign: 'center', padding: '20px' }}>No notes today</div>
                        )}
                    </div>
                </div>

                {/* Messages Widget */}
                <div className="card" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: '300px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <h4 style={{ color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                            Messages
                        </h4>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto' }}>
                        {dateMessages.length > 0 ? (
                            dateMessages.map(msg => (
                                <div 
                                    key={msg.id} 
                                    onClick={() => window.dispatchEvent(new CustomEvent('navigate', { detail: { view: 'message-authoring', messageId: msg.id } }))}
                                    style={{ 
                                        padding: '12px', 
                                        background: 'var(--bg-surface)', 
                                        borderRadius: '8px',
                                        borderLeft: '3px solid #fbbf24',
                                        cursor: 'pointer'
                                    }}
                                    className="clickable-card"
                                >
                                    <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '4px', opacity: 0.9 }}>
                                        {msg.is_inbound ? '📥' : '📤'} {msg.draft_text ? msg.draft_text.substring(0, 40) + '...' : 'Untitled Message'}
                                    </div>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                        {msg.person ? `👤 ${msg.person.name}` : (msg.group ? `👥 ${msg.group.name}` : 'No Contact')}
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', textAlign: 'center', padding: '20px' }}>No messages today</div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
