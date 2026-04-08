import React from 'react';
import { CalendarDay } from '../services/api';

interface Props {
    data: CalendarDay[];
}

const PracticeCalendar: React.FC<Props> = ({ data }) => {
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();

    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay();

    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
    const blanks = Array.from({ length: firstDayOfMonth }, (_, i) => i);

    const getDayCount = (day: number) => {
        const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const dayData = data.find(d => d.date === dateStr);
        return dayData ? dayData.count : 0;
    };

    const monthName = new Intl.DateTimeFormat('en-US', { month: 'long' }).format(today);

    return (
        <div className="card" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h4 style={{ fontSize: '0.9rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{monthName} {currentYear}</h4>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Session Activity</div>
            </div>
            
            <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(7, 1fr)', 
                gap: '8px',
                textAlign: 'center'
            }}>
                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(d => (
                    <div key={d} style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', paddingBottom: '8px' }}>{d}</div>
                ))}
                
                {blanks.map(i => <div key={`blank-${i}`} />)}
                
                {days.map(day => {
                    const count = getDayCount(day);
                    const isToday = day === today.getDate();
                    
                    return (
                        <div 
                            key={day} 
                            style={{ 
                                padding: '8px 0',
                                borderRadius: '8px',
                                fontSize: '0.8rem',
                                background: count > 0 ? 'var(--primary-faded)' : (isToday ? 'var(--bg-surface)' : 'transparent'),
                                border: isToday ? '1px solid var(--primary)' : '1px solid transparent',
                                color: count > 0 ? 'var(--primary)' : 'var(--text-secondary)',
                                fontWeight: count > 0 || isToday ? 700 : 400,
                                position: 'relative'
                            }}
                        >
                            {day}
                            {count > 0 && (
                                <div style={{ 
                                    position: 'absolute', 
                                    top: '2px', 
                                    right: '2px', 
                                    width: '6px', 
                                    height: '6px', 
                                    borderRadius: '50%', 
                                    background: 'var(--primary)' 
                                }} />
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default PracticeCalendar;
