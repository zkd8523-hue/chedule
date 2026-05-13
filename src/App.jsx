import React, { useState, useEffect } from 'react';
import { generateSchedule } from './logic/scheduler';

const shiftLabels = { O: '오픈', M: '미들', C: '마감' };

const DEFAULT_STAFF = [
  { key: 'SH', name: '성환', preferConsecutive: true, wantsLongRest: false },
  { key: 'YJ', name: '유진', preferConsecutive: true, wantsLongRest: false },
  { key: 'BW', name: '봉우', preferConsecutive: false, wantsLongRest: false },
  { key: 'MK', name: '민기', preferConsecutive: true, wantsLongRest: false },
  { key: 'JH', name: '준호', preferConsecutive: false, wantsLongRest: false },
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
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [history, setHistory] = useState(() => {
    try {
      const saved = localStorage.getItem('scheduleHistory');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [toast, setToast] = useState(null);

  const showToast = (message) => {
    setToast({ message, id: Date.now() });
  };

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2000);
    return () => clearTimeout(timer);
  }, [toast]);

  const staffByKey = Object.fromEntries(staff.map(s => [s.key, s.name]));
  const staffKeys = staff.map(s => s.key);

  const updateStaffName = (key, name) => setStaff(staff.map(s => s.key === key ? { ...s, name } : s));

  const toggleStaffPreference = (key) => setStaff(staff.map(s => s.key === key ? { ...s, preferConsecutive: !s.preferConsecutive } : s));

  const toggleStaffLongRest = (key) => setStaff(staff.map(s => s.key === key ? { ...s, wantsLongRest: !s.wantsLongRest } : s));

  const addStaff = () => {
    const name = newStaffName.trim();
    if (!name) return;
    setStaff([...staff, { key: genKey(), name, preferConsecutive: false, wantsLongRest: false }]);
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

  useEffect(() => {
    if (!scheduleData) return;

    window.history.pushState(null, '', window.location.href);
    const handlePopState = () => {
      if (window.confirm('페이지에서 나가시겠습니까? 생성한 근무표가 사라집니다.')) {
        window.removeEventListener('popstate', handlePopState);
        window.history.back();
      } else {
        window.history.pushState(null, '', window.location.href);
      }
    };
    const handleBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('popstate', handlePopState);
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [scheduleData]);

  const handleGenerate = () => {
    try {
      setError(null);
      const restsByStaff = {};
      specialRests.forEach(({ staff: s, date }) => {
        if (!restsByStaff[s]) restsByStaff[s] = [];
        restsByStaff[s].push(date);
      });
      const preferConsecutiveMap = Object.fromEntries(staff.map(s => [s.key, !!s.preferConsecutive]));
      const longRestMap = Object.fromEntries(staff.map(s => [s.key, !!s.wantsLongRest]));
      const result = generateSchedule({
        startDate, endDate, staffKeys,
        specialRests: restsByStaff,
        weekendRestRotation: staffKeys,
        weekendClosingRotation: [...staffKeys.slice(1), staffKeys[0]],
        preferConsecutiveMap,
        longRestMap,
      });
      const newScheduleData = { ...result, staffKeys, staffByKey };
      setScheduleData(newScheduleData);
      const record = {
        id: Date.now(),
        generatedAt: new Date().toISOString(),
        startDate, endDate,
        data: newScheduleData,
      };
      const newHistory = [record, ...history].slice(0, 20);
      setHistory(newHistory);
      try { localStorage.setItem('scheduleHistory', JSON.stringify(newHistory)); } catch {}
      showToast('변경되었어요');
    } catch (e) {
      setError(e.message);
      setScheduleData(null);
    }
  };

  const loadFromHistory = (record) => {
    setStartDate(record.startDate);
    setEndDate(record.endDate);
    setScheduleData(record.data);
    showToast('변경되었어요');
  };

  const deleteFromHistory = (id) => {
    const newHistory = history.filter(r => r.id !== id);
    setHistory(newHistory);
    try { localStorage.setItem('scheduleHistory', JSON.stringify(newHistory)); } catch {}
  };

  // 드래그앤드롭: 같은 주 안에서 두 사람의 모든 슬롯을 통째로 교환 (오픈/마감 자리는 고정, 이름만 회전)
  const handleSwap = (dateA, staffA, _dateB, staffB) => {
    if (staffA === staffB) return;
    setScheduleData(prev => {
      const schedule = JSON.parse(JSON.stringify(prev.schedule));
      const restDays = JSON.parse(JSON.stringify(prev.restDays));
      const staffStats = JSON.parse(JSON.stringify(prev.staffStats));

      const wk = weekKeyOf(dateA);
      const weekDates = Object.keys(schedule).filter(d => weekKeyOf(d) === wk);

      weekDates.forEach(date => {
        const day = schedule[date] || {};
        const shiftAOnDay = day[staffA];
        const shiftBOnDay = day[staffB];
        delete day[staffA];
        delete day[staffB];
        if (shiftAOnDay !== undefined) day[staffB] = shiftAOnDay;
        if (shiftBOnDay !== undefined) day[staffA] = shiftBOnDay;
        schedule[date] = day;

        const rest = restDays[date] || [];
        const hadA = rest.includes(staffA);
        const hadB = rest.includes(staffB);
        const filtered = rest.filter(s => s !== staffA && s !== staffB);
        if (hadA) filtered.push(staffB);
        if (hadB) filtered.push(staffA);
        restDays[date] = filtered;
      });

      const recompute = (key) => {
        const stat = { O: 0, M: 0, C: 0, totalWork: 0 };
        Object.values(schedule).forEach(day => {
          const s = day[key];
          if (s === 'O' || s === 'M' || s === 'C') { stat[s]++; stat.totalWork++; }
        });
        return stat;
      };
      staffStats[staffA] = recompute(staffA);
      staffStats[staffB] = recompute(staffB);

      return { ...prev, schedule, restDays, staffStats };
    });
  };

  const range = scheduleData
    ? (() => {
        const s = new Date(startDate), e = new Date(endDate);
        return `${s.getMonth() + 1}/${s.getDate()} - ${e.getMonth() + 1}/${e.getDate()}`;
      })()
    : null;

  return (
    <div className={`dashboard ${sidebarOpen ? '' : 'sidebar-collapsed'}`}>
      <aside className="sidebar">
        <div className="sidebar-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem' }}>스케줄 생성</h2>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>기간과 직원을 설정하세요</p>
          </div>
          <button onClick={() => setSidebarOpen(false)} aria-label="설정 패널 닫기"
            style={{ flexShrink: 0, width: '32px', height: '32px', padding: 0, background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer', fontSize: '1.1rem', fontWeight: 700, lineHeight: 1 }}>
            ‹
          </button>
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
              <div key={s.key} style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '6px 8px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <input value={s.name} onChange={e => updateStaffName(s.key, e.target.value)}
                    style={{ flex: 1, padding: '0.4rem 0.5rem', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.875rem', background: 'white' }} />
                  <button onClick={() => removeStaff(s.key)}
                    style={{ padding: '0.4rem 0.6rem', background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca', borderRadius: '6px', cursor: 'pointer', fontWeight: 700, fontSize: '0.875rem' }}>
                    ×
                  </button>
                </div>
                <div style={{ display: 'flex', gap: '12px', fontSize: '0.7rem', color: '#475569', paddingLeft: '2px' }}>
                  <label title="이틀 연속 휴무 선호" style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', userSelect: 'none' }}>
                    <input type="checkbox" checked={!!s.preferConsecutive} onChange={() => toggleStaffPreference(s.key)} />
                    연속휴무
                  </label>
                  <label title="주말 휴무 차례에 토일월화 4일 붙여쉬기" style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', userSelect: 'none' }}>
                    <input type="checkbox" checked={!!s.wantsLongRest} onChange={() => toggleStaffLongRest(s.key)} />
                    4일붙여
                  </label>
                </div>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {!sidebarOpen && (
              <button onClick={() => setSidebarOpen(true)} aria-label="설정 패널 열기"
                style={{ width: '36px', height: '36px', padding: 0, background: 'var(--accent-primary, #6366f1)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '1.1rem', fontWeight: 700, lineHeight: 1, boxShadow: 'var(--shadow-sm)' }}>
                ☰
              </button>
            )}
            <h1>직원 근무 스케줄표</h1>
          </div>
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
          <ScheduleGrid data={scheduleData} onSwap={handleSwap} />
        )}

        {history.length > 0 && (
          <section style={{ marginTop: '2rem', padding: '1.5rem', background: 'white', borderRadius: '12px', boxShadow: 'var(--shadow-sm)' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--text-primary)' }}>이전 기록</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {history.map(record => {
                const s = new Date(record.startDate);
                const e = new Date(record.endDate);
                const rangeText = `${s.getMonth() + 1}/${s.getDate()} - ${e.getMonth() + 1}/${e.getDate()}`;
                const gen = new Date(record.generatedAt);
                const genText = `${gen.getFullYear()}.${String(gen.getMonth() + 1).padStart(2, '0')}.${String(gen.getDate()).padStart(2, '0')} ${String(gen.getHours()).padStart(2, '0')}:${String(gen.getMinutes()).padStart(2, '0')}`;
                return (
                  <div key={record.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <div>
                      <div style={{ fontSize: '0.875rem', fontWeight: 600 }}>{rangeText}</div>
                      <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '2px' }}>생성: {genText}</div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button onClick={() => loadFromHistory(record)}
                        style={{ padding: '0.4rem 0.8rem', background: 'var(--accent-primary, #6366f1)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>
                        불러오기
                      </button>
                      <button onClick={() => deleteFromHistory(record.id)}
                        style={{ padding: '0.4rem 0.6rem', background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca', borderRadius: '6px', cursor: 'pointer', fontWeight: 700, fontSize: '0.8rem' }}>
                        ×
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <footer style={{ marginTop: 'auto', paddingTop: '3rem', textAlign: 'center', fontSize: '0.8rem', color: '#94a3b8' }}>
          욕보이소. - 김민기
        </footer>
      </main>

      {toast && (
        <div key={toast.id} style={{
          position: 'fixed', bottom: '32px', left: '50%', transform: 'translateX(-50%)',
          padding: '0.75rem 1.5rem', background: 'rgba(30, 41, 59, 0.95)', color: 'white',
          borderRadius: '999px', fontSize: '0.9rem', fontWeight: 600,
          boxShadow: '0 10px 25px -5px rgba(0,0,0,0.3)', zIndex: 1000,
          animation: 'toastIn 0.25s ease-out',
        }}>
          {toast.message}
        </div>
      )}
    </div>
  );
}

const weekKeyOf = (dateStr) => {
  const d = new Date(dateStr);
  const offset = d.getDay() === 0 ? 6 : d.getDay() - 1;
  d.setDate(d.getDate() - offset);
  return d.toISOString().slice(0, 10);
};

function ScheduleGrid({ data, onSwap }) {
  const { schedule, restDays, staffKeys, staffByKey } = data;
  const allDates = Object.keys(schedule).sort();
  const [dragSource, setDragSource] = useState(null);
  const [dragOver, setDragOver] = useState(null);

  const handleDragStart = (e, date, staffKey) => {
    setDragSource({ date, staffKey, weekKey: weekKeyOf(date) });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', `${date}:${staffKey}`);
  };

  const handleDragOver = (e, date, staffKey) => {
    if (!dragSource) return;
    if (weekKeyOf(date) !== dragSource.weekKey) {
      e.dataTransfer.dropEffect = 'none';
      return;
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const id = `${date}-${staffKey}`;
    if (dragOver !== id) setDragOver(id);
  };

  const handleDrop = (e, date, staffKey) => {
    e.preventDefault();
    if (!dragSource) return;
    if (weekKeyOf(date) === dragSource.weekKey) {
      onSwap(dragSource.date, dragSource.staffKey, date, staffKey);
    }
    setDragSource(null);
    setDragOver(null);
  };

  const handleDragEnd = () => {
    setDragSource(null);
    setDragOver(null);
  };

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
          const cellWeek = weekKeyOf(date);
          const inDragWeek = dragSource && cellWeek === dragSource.weekKey;
          const cellDimmed = dragSource && !inDragWeek;

          const cell = (
            <div key={date} className="calendar-cell" style={cellDimmed ? { opacity: 0.45 } : null}>
              <div className="date-num">{d.getMonth() + 1}/{d.getDate()}</div>
              <div className="shifts-list" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {staffKeys.map(staffKey => {
                  const shift = dayShifts[staffKey] ?? (dayRests.includes(staffKey) ? 'R' : null);
                  if (!shift) return null;
                  const tagId = `${date}-${staffKey}`;
                  const isSource = dragSource && dragSource.date === date && dragSource.staffKey === staffKey;
                  const isHovered = dragOver === tagId;
                  const isDroppable = inDragWeek && !isSource;

                  const tagStyle = { cursor: dragSource ? (isDroppable ? 'grabbing' : 'not-allowed') : 'grab', transition: 'outline 0.1s, transform 0.1s' };
                  if (isSource) tagStyle.opacity = 0.35;
                  else if (isHovered) {
                    tagStyle.outline = '2px solid #6366f1';
                    tagStyle.outlineOffset = '2px';
                    tagStyle.transform = 'scale(1.04)';
                  } else if (isDroppable) {
                    tagStyle.outline = '1px dashed #a5b4fc';
                    tagStyle.outlineOffset = '1px';
                  }

                  return (
                    <div
                      key={staffKey}
                      className={`shift-tag ${shift}`}
                      draggable
                      onDragStart={e => handleDragStart(e, date, staffKey)}
                      onDragOver={e => handleDragOver(e, date, staffKey)}
                      onDragLeave={() => setDragOver(prev => prev === tagId ? null : prev)}
                      onDrop={e => handleDrop(e, date, staffKey)}
                      onDragEnd={handleDragEnd}
                      style={tagStyle}
                    >
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
