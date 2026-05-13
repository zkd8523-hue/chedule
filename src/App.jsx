import React, { useState } from 'react';
import { generateSchedule } from './logic/scheduler';

const shiftLabels = { O: '오픈', M: '미들', C: '마감' };

const DEFAULT_STAFF = [
  { key: 'SH', name: '성환' },
  { key: 'YJ', name: '유진' },
  { key: 'BW', name: '봉우' },
  { key: 'MK', name: '민기' },
  { key: 'JH', name: '준호' },
];

let keyCounter = DEFAULT_STAFF.length;
const genKey = () => `S${keyCounter++}`;

const inputStyle = { width: '100%', padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '6px' };
const sectionStyle = { borderTop: '1px solid #e2e8f0', paddingTop: '1rem' };
const labelStyle = { fontSize: '0.75rem', fontWeight: 600 };

function App() {
  const [startDate, setStartDate] = useState('2026-04-13');
  const [endDate, setEndDate] = useState('2026-05-17');
  const [staff, setStaff] = useState(DEFAULT_STAFF);
  const [newStaffName, setNewStaffName] = useState('');
  const [specialRests, setSpecialRests] = useState([]);
  const [newRestStaff, setNewRestStaff] = useState('SH');
  const [newRestDate, setNewRestDate] = useState('');
  const [scheduleData, setScheduleData] = useState(null);
  const [error, setError] = useState(null);

  const staffByKey = Object.fromEntries(staff.map(s => [s.key, s.name]));
  const staffKeys = staff.map(s => s.key);

  const updateStaffName = (key, name) => setStaff(staff.map(s => s.key === key ? { ...s, name } : s));

  const addStaff = () => {
    const name = newStaffName.trim();
    if (!name) return;
    setStaff([...staff, { key: genKey(), name }]);
    setNewStaffName('');
  };

  const removeStaff = (key) => {
    setStaff(staff.filter(s => s.key !== key));
    setSpecialRests(specialRests.filter(r => r.staff !== key));
    if (newRestStaff === key) setNewRestStaff(staff.find(s => s.key !== key)?.key ?? '');
  };

  const addSpecialRest = () => {
    if (!newRestDate || !newRestStaff) return;
    setSpecialRests([...specialRests, { staff: newRestStaff, date: newRestDate }]);
    setNewRestDate('');
  };

  const removeSpecialRest = (idx) => setSpecialRests(specialRests.filter((_, i) => i !== idx));

  const handleGenerate = () => {
    try {
      setError(null);
      const restsByStaff = {};
      specialRests.forEach(({ staff: s, date }) => {
        if (!restsByStaff[s]) restsByStaff[s] = [];
        restsByStaff[s].push(date);
      });
      const result = generateSchedule({
        startDate, endDate, staffKeys,
        specialRests: restsByStaff,
        weekendRestRotation: staffKeys,
        weekendClosingRotation: [...staffKeys.slice(1), staffKeys[0]],
      });
      setScheduleData({ ...result, staffKeys, staffByKey });
    } catch (e) {
      setError(e.message);
      setScheduleData(null);
    }
  };

  // 드래그앤드롭: 슬롯의 시프트 타입 고정, 이름(인원)만 교체
  const range = scheduleData
    ? (() => {
        const s = new Date(startDate), e = new Date(endDate);
        return `${s.getMonth() + 1}/${s.getDate()} - ${e.getMonth() + 1}/${e.getDate()}`;
      })()
    : null;

  return (
    <div className="dashboard">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem' }}>스케줄 생성</h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>기간과 직원을 설정하세요</p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '0 0.5rem' }}>
          <div>
            <label style={{ ...labelStyle, display: 'block', marginBottom: '4px' }}>시작일 (월요일)</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <label style={labelStyle}>종료일</label>
              <button onClick={() => {
                const d = new Date(startDate);
                d.setDate(d.getDate() + 5 * 7 - 1);
                setEndDate(d.toISOString().split('T')[0]);
              }} style={{ fontSize: '0.7rem', padding: '2px 8px', background: '#e0e7ff', color: '#4f46e5', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 600 }}>
                5주 자동설정
              </button>
            </div>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={inputStyle} />
          </div>

          <div style={sectionStyle}>
            <label style={{ fontSize: '0.875rem', fontWeight: 700, display: 'block', marginBottom: '8px' }}>특별 휴무 추가</label>
            <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
              <select value={newRestStaff} onChange={e => setNewRestStaff(e.target.value)}
                style={{ padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '6px' }}>
                {staff.map(s => <option key={s.key} value={s.key}>{s.name}</option>)}
              </select>
              <input type="date" value={newRestDate} onChange={e => setNewRestDate(e.target.value)}
                style={{ flex: 1, padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '6px' }} />
            </div>
            <button onClick={addSpecialRest}
              style={{ width: '100%', padding: '0.5rem', background: '#64748b', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.875rem' }}>
              + 휴무 추가
            </button>
            {specialRests.length > 0 && (
              <ul style={{ listStyle: 'none', padding: 0, margin: '0.5rem 0 0 0', fontSize: '0.75rem' }}>
                {specialRests.map((r, i) => (
                  <li key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 8px', background: '#f1f5f9', borderRadius: '4px', marginBottom: '4px' }}>
                    <span>{staffByKey[r.staff] ?? r.staff} · {r.date}</span>
                    <button onClick={() => removeSpecialRest(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}>×</button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <button onClick={handleGenerate}
            style={{ width: '100%', padding: '0.75rem', background: 'var(--accent-primary, #6366f1)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '0.95rem', fontWeight: 600 }}>
            스케줄 생성하기
          </button>

          {error && (
            <div style={{ padding: '0.75rem', background: '#fef2f2', color: '#ef4444', borderRadius: '6px', fontSize: '0.875rem' }}>
              {error}
            </div>
          )}
        </div>

        {scheduleData && (
          <div className="stats-container" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1.5rem' }}>
            <h3 className="stats-title">교대 근무 통계</h3>
            {scheduleData.staffKeys.map(key => (
              <div key={key} className="stats-card">
                <div className="staff-stat-item">
                  <span className="staff-name-small">{scheduleData.staffByKey[key]}</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>총 {scheduleData.staffStats[key].totalWork}일</span>
                </div>
                <div className="shift-counts">
                  <span className="count-pill O" style={{ background: '#ebf5ff', color: '#3b82f6' }}>오픈: {scheduleData.staffStats[key].O}</span>
                  <span className="count-pill M" style={{ background: '#fffbeb', color: '#f59e0b' }}>미들: {scheduleData.staffStats[key].M}</span>
                  <span className="count-pill C" style={{ background: '#fef2f2', color: '#ef4444' }}>마감: {scheduleData.staffStats[key].C}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{ ...sectionStyle, padding: '1rem 0.5rem 0' }}>
          <label style={{ fontSize: '0.875rem', fontWeight: 700, display: 'block', marginBottom: '8px' }}>직원 관리</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '8px' }}>
            {staff.map(s => (
              <div key={s.key} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <input value={s.name} onChange={e => updateStaffName(s.key, e.target.value)}
                  style={{ flex: 1, padding: '0.4rem 0.5rem', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.875rem' }} />
                <button onClick={() => removeStaff(s.key)}
                  style={{ padding: '0.4rem 0.6rem', background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca', borderRadius: '6px', cursor: 'pointer', fontWeight: 700, fontSize: '0.875rem' }}>
                  ×
                </button>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <input placeholder="이름 입력" value={newStaffName} onChange={e => setNewStaffName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addStaff()}
              style={{ flex: 1, padding: '0.4rem 0.5rem', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.875rem' }} />
            <button onClick={addStaff}
              style={{ padding: '0.4rem 0.75rem', background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: '6px', cursor: 'pointer', fontWeight: 700 }}>
              +
            </button>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="header">
          <h1>직원 근무 스케줄표</h1>
          {range && (
            <span className="badge" style={{ background: 'var(--accent-primary, #6366f1)', color: 'white', padding: '0.25rem 0.75rem', borderRadius: '99px', fontSize: '0.875rem', fontWeight: 600 }}>
              {range}
            </span>
          )}
        </header>

        {!scheduleData ? (
          <div style={{ padding: '4rem 2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
            <p style={{ fontSize: '1.125rem' }}>← 왼쪽에서 설정 후 "스케줄 생성하기"를 눌러주세요</p>
          </div>
        ) : (
          <ScheduleGrid data={scheduleData} />
        )}

        <footer style={{ marginTop: 'auto', paddingTop: '3rem', textAlign: 'center', fontSize: '0.8rem', color: '#94a3b8' }}>
          욕보이소. - 김민기
        </footer>
      </main>
    </div>
  );
}

function ScheduleGrid({ data }) {
  const { schedule, restDays, staffKeys, staffByKey } = data;
  const allDates = Object.keys(schedule).sort();

  return (
    <div className="month-section">
      <div className="calendar-grid">
        {['월', '화', '수', '목', '금', '토', '일'].map(day => (
          <div key={day} className="calendar-header">{day}</div>
        ))}
        {allDates.map((date, index) => {
          const dayShifts = schedule[date];
          const dayRests = restDays[date] || [];
          const d = new Date(date);
          const offset = d.getDay() === 0 ? 6 : d.getDay() - 1;

          const cell = (
            <div key={date} className="calendar-cell">
              <div className="date-num">{d.getMonth() + 1}/{d.getDate()}</div>
              <div className="shifts-list" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {staffKeys.map(staffKey => {
                  const shift = dayShifts[staffKey] ?? (dayRests.includes(staffKey) ? 'R' : null);
                  if (!shift) return null;
                  return (
                    <div key={staffKey} className={`shift-tag ${shift}`}>
                      <span className="staff-name">{staffByKey[staffKey]}</span>
                      <span className="shift-label">{shift === 'R' ? '휴무' : shiftLabels[shift]}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );

          if (index === 0 && offset > 0) {
            return (
              <React.Fragment key={date}>
                {Array(offset).fill(0).map((_, i) => (
                  <div key={`pad-${i}`} className="calendar-cell empty-cell" />
                ))}
                {cell}
              </React.Fragment>
            );
          }
          return cell;
        })}
      </div>
    </div>
  );
}

export default App;
