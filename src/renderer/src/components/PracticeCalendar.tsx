import React, { useState } from 'react';
import { CalendarDay } from '../services/api';

interface Props {
    data: CalendarDay[];
    selectedDate?: string;
    onSelectDate?: (date: string) => void;
}

const PracticeCalendar: React.FC<Props> = ({ data, selectedDate, onSelectDate }) => {
    const [viewDate, setViewDate] = useState(new Date());
    
    const currentMonth = viewDate.getMonth();
    const currentYear = viewDate.getFullYear();

    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay();

    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
    const blanks = Array.from({ length: firstDayOfMonth }, (_, i) => i);

    const getDayCount = (day: number) => {
        const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const dayData = data.find(d => d.date === dateStr);
        return dayData ? dayData.count : 0;
    };

    const monthName = new Intl.DateTimeFormat('en-US', { month: 'long' }).format(viewDate);

    const changeMonth = (offset: number) => {
        const newDate = new Date(currentYear, currentMonth + offset, 1);
        setViewDate(newDate);
    };

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    return (
        <div className="card" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button 
                        onClick={() => changeMonth(-1)}
                        style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1.2rem', padding: '0 4px' }}
                    >
                        &lsaquo;
                    </button>
                    <h4 style={{ fontSize: '0.9rem', color: 'var(--text-muted)', textTransform: 'uppercase', minWidth: '120px', textAlign: 'center' }}>
                        {monthName} {currentYear}
                    </h4>
                    <button 
                        onClick={() => changeMonth(1)}
                        style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1.2rem', padding: '0 4px' }}
                    >
                        &rsaquo;
                    </button>
                </div>
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
                    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    const count = getDayCount(day);
                    const isToday = dateStr === todayStr;
                    const isSelected = selectedDate === dateStr;
                    
                    return (
                        <div 
                            key={day} 
                            onClick={() => onSelectDate?.(dateStr)}
                            style={{ 
                                padding: '8px 0',
                                borderRadius: '8px',
                                fontSize: '0.8rem',
                                background: isSelected ? 'var(--primary)' : (count > 0 ? 'var(--primary-faded)' : (isToday ? 'var(--bg-surface)' : 'transparent')),
                                border: isToday && !isSelected ? '1px solid var(--primary)' : '1px solid transparent',
                                color: isSelected ? 'white' : (count > 0 ? 'var(--primary)' : 'var(--text-secondary)'),
                                fontWeight: count > 0 || isToday || isSelected ? 700 : 400,
                                position: 'relative',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease'
                            }}
                            className="calendar-day"
                        >
                            {day}
                            {count > 0 && !isSelected && (
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
