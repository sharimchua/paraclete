import React, { useState, useMemo } from 'react'
import { CalendarDay } from '../services/api'

interface Props {
  data: CalendarDay[]
  selectedDate?: string
  onSelectDate?: (date: string) => void
}

const PracticeCalendar: React.FC<Props> = ({ data, selectedDate, onSelectDate }) => {
  const [viewDate, setViewDate] = useState(new Date())

  const currentMonth = viewDate.getMonth()
  const currentYear = viewDate.getFullYear()

  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate()
  const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay()

  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1)
  const blanks = Array.from({ length: firstDayOfMonth }, (_, i) => i)

  // ⚡ Bolt: Cache calendar data to a map by date string to prevent O(N) lookup on every day render
  // Reduces complexity from O(N * daysInMonth) to O(N + daysInMonth)
  const dataMap = useMemo(() => {
    const map: Record<string, CalendarDay> = {}
    data.forEach((d) => {
      map[d.date] = d
    })
    return map
  }, [data])

  const getDayData = (day: number): CalendarDay | undefined => {
    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return dataMap[dateStr]
  }

  const monthName = new Intl.DateTimeFormat('en-US', { month: 'long' }).format(viewDate)

  const changeMonth = (offset: number): void => {
    const newDate = new Date(currentYear, currentMonth + offset, 1)
    setViewDate(newDate)
  }

  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  return (
    <div className="card" style={{ padding: '20px' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={() => changeMonth(-1)}
            aria-label="Previous month"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: '1.2rem',
              padding: '0 4px'
            }}
          >
            &lsaquo;
          </button>
          <h4
            style={{
              fontSize: '0.9rem',
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              minWidth: '120px',
              textAlign: 'center'
            }}
          >
            {monthName} {currentYear}
          </h4>
          <button
            onClick={() => changeMonth(1)}
            aria-label="Next month"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: '1.2rem',
              padding: '0 4px'
            }}
          >
            &rsaquo;
          </button>
        </div>
        <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Session Activity</div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: '8px',
          textAlign: 'center'
        }}
      >
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d) => (
          <div
            key={d}
            style={{
              fontSize: '0.65rem',
              fontWeight: 700,
              color: 'var(--text-muted)',
              paddingBottom: '8px'
            }}
          >
            {d}
          </div>
        ))}

        {blanks.map((i) => (
          <div key={`blank-${i}`} />
        ))}

        {days.map((day) => {
          const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const dayData = getDayData(day)
          const noteCount = dayData?.count || 0
          const msgCount = dayData?.message_count || 0
          const hasActivity = noteCount > 0 || msgCount > 0
          const isToday = dateStr === todayStr
          const isSelected = selectedDate === dateStr

          return (
            <div
              key={day}
              onClick={() => onSelectDate?.(dateStr)}
              style={{
                padding: '8px 0',
                borderRadius: '8px',
                fontSize: '0.8rem',
                background: isSelected
                  ? 'var(--primary)'
                  : hasActivity
                    ? 'rgba(255, 255, 255, 0.03)'
                    : isToday
                      ? 'var(--bg-surface)'
                      : 'transparent',
                border:
                  isToday && !isSelected ? '1px solid var(--primary)' : '1px solid transparent',
                color: isSelected ? 'white' : hasActivity ? 'white' : 'var(--text-secondary)',
                fontWeight: hasActivity || isToday || isSelected ? 700 : 400,
                position: 'relative',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
              className="calendar-day"
            >
              {day}
              <div
                style={{
                  position: 'absolute',
                  bottom: '2px',
                  left: '0',
                  right: '0',
                  display: 'flex',
                  justifyContent: 'center',
                  gap: '2px'
                }}
              >
                {noteCount > 0 && (
                  <div
                    style={{
                      width: '4px',
                      height: '4px',
                      borderRadius: '50%',
                      background: isSelected ? 'white' : 'var(--primary)'
                    }}
                  />
                )}
                {msgCount > 0 && (
                  <div
                    style={{
                      width: '4px',
                      height: '4px',
                      borderRadius: '50%',
                      background: isSelected ? 'white' : '#fbbf24'
                    }}
                  />
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default PracticeCalendar
