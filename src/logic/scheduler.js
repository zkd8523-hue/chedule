const DEFAULT_STAFF_KEYS = ['SH', 'YJ', 'BW', 'MK', 'JH'];
const DEFAULT_WEEKEND_REST_ROTATION = ['SH', 'YJ', 'BW', 'MK', 'JH'];
const DEFAULT_WEEKEND_CLOSING_ROTATION = ['YJ', 'BW', 'MK', 'JH', 'SH'];

const getDayInfo = (date) => {
  const d = new Date(date);
  const day = d.getDay();
  return {
    dateString: date,
    dayIndex: day,
    isWeekend: day === 0 || day === 6,
    isMonFri: day === 1 || day === 5,
    isTueWedThu: day === 2 || day === 3 || day === 4
  };
};

const toDateString = (d) => d.toISOString().split('T')[0];

const getWeekDates = (startDate) => {
  const dates = [];
  const curr = new Date(startDate);
  for (let i = 0; i < 7; i++) {
    const d = new Date(curr);
    d.setDate(curr.getDate() + i);
    dates.push(toDateString(d));
  }
  return dates;
};

export const generateSchedule = (options = {}) => {
  const {
    startDate: startDateStr = '2026-04-13',
    endDate: endDateStr = '2026-05-17',
    staffKeys = DEFAULT_STAFF_KEYS,
    specialRests = {},
    weekendRestRotation = DEFAULT_WEEKEND_REST_ROTATION,
    weekendClosingRotation = DEFAULT_WEEKEND_CLOSING_ROTATION,
    preferConsecutiveMap = null,
  } = options;

  const startDate = new Date(startDateStr);
  const endDate = new Date(endDateStr);

  if (startDate.getDay() !== 1) {
    throw new Error('시작일은 반드시 월요일이어야 합니다.');
  }
  if (endDate < startDate) {
    throw new Error('종료일이 시작일보다 빠릅니다.');
  }

  const schedule = {};
  const restDays = {};
  const staffStats = {};
  staffKeys.forEach(k => {
    staffStats[k] = { O: 0, M: 0, C: 0, rest: 0, totalWork: 0 };
  });

  // 1. Weekend rest rotation
  let weekStart = new Date(startDate);
  let weekIdx = 0;
  while (weekStart <= endDate) {
    const dates = getWeekDates(weekStart);
    const weekendRester = weekendRestRotation[weekIdx % weekendRestRotation.length];
    dates.forEach(d => {
      const info = getDayInfo(d);
      if (info.isWeekend && new Date(d) <= endDate) {
        if (!restDays[d]) restDays[d] = [];
        if (!restDays[d].includes(weekendRester)) restDays[d].push(weekendRester);
      }
    });
    weekStart.setDate(weekStart.getDate() + 7);
    weekIdx++;
  }

  // 2. Apply special rests from user input
  Object.entries(specialRests).forEach(([staffKey, dates]) => {
    if (!staffKeys.includes(staffKey)) return;
    (dates || []).forEach(d => {
      if (!restDays[d]) restDays[d] = [];
      if (!restDays[d].includes(staffKey)) restDays[d].push(staffKey);
    });
  });

  // 3. Fill remaining rest days per week
  weekStart = new Date(startDate);
  const totalStaff = staffKeys.length;
  const prefConsec = preferConsecutiveMap
    ? staffKeys.filter(k => preferConsecutiveMap[k])
    : staffKeys.slice(0, Math.ceil(totalStaff / 2));
  const nonConsec = preferConsecutiveMap
    ? staffKeys.filter(k => !preferConsecutiveMap[k])
    : staffKeys.slice(Math.ceil(totalStaff / 2));

  while (weekStart <= endDate) {
    const dates = getWeekDates(weekStart);
    const weekStaffRestCount = {};
    staffKeys.forEach(k => { weekStaffRestCount[k] = 0; });
    dates.forEach(d => {
      if (restDays[d]) {
        restDays[d].forEach(s => {
          if (weekStaffRestCount[s] !== undefined) weekStaffRestCount[s]++;
        });
      }
    });

    const fillSlots = (dayIdx, count) => {
      const d = dates[dayIdx];
      if (new Date(d) > endDate) return;
      if (!restDays[d]) restDays[d] = [];
      const targetCount = count;

      while (restDays[d].length < targetCount) {
        const candidates = staffKeys.filter(s =>
          !restDays[d].includes(s) &&
          weekStaffRestCount[s] < 2
        ).sort((a, b) => {
          const isPref = (s) => prefConsec.includes(s);
          const isNonPref = (s) => nonConsec.includes(s);
          const hasPrevRest = (s) => dayIdx > 0 && restDays[dates[dayIdx - 1]]?.includes(s);
          if (isPref(a) && hasPrevRest(a)) return -1;
          if (isPref(b) && hasPrevRest(b)) return 1;
          if (isNonPref(a) && hasPrevRest(a)) return 5;
          if (isNonPref(b) && hasPrevRest(b)) return -5;
          return weekStaffRestCount[a] - weekStaffRestCount[b];
        });
        if (candidates.length > 0) {
          const picked = candidates[0];
          restDays[d].push(picked);
          weekStaffRestCount[picked]++;
        } else {
          break;
        }
      }
    };

    fillSlots(0, 1); // Mon
    fillSlots(1, 2); // Tue
    fillSlots(2, 2); // Wed
    fillSlots(3, 2); // Thu
    fillSlots(4, 1); // Fri
    weekStart.setDate(weekStart.getDate() + 7);
  }

  // 4. Build all dates list
  const allDates = [];
  let curr = new Date(startDate);
  while (curr <= endDate) {
    allDates.push(toDateString(curr));
    curr.setDate(curr.getDate() + 1);
  }

  // 5. Assign shifts
  allDates.forEach((d, dateIdx) => {
    const resting = restDays[d] || [];
    const working = staffKeys.filter(s => !resting.includes(s));
    const info = getDayInfo(d);
    const needsFour = info.isMonFri || info.isWeekend;
    const shiftsNeeded = working.length >= 4 && needsFour
      ? ['C', 'M', 'O', 'O']
      : working.length >= 3
        ? ['C', 'M', 'O']
        : working.length === 2
          ? ['C', 'O']
          : working.length === 1
            ? ['O']
            : [];

    const assigned = {};
    const tempWorking = [...working];
    const prevDateObj = new Date(d);
    prevDateObj.setDate(prevDateObj.getDate() - 1);
    const prevDate = toDateString(prevDateObj);
    const prevSchedule = schedule[prevDate] || {};

    let forcedClosing = null;
    if (info.isWeekend) {
      const wIdx = Math.floor(dateIdx / 7);
      forcedClosing = weekendClosingRotation[wIdx % weekendClosingRotation.length];
      if (resting.includes(forcedClosing)) forcedClosing = null;
    }

    shiftsNeeded.forEach(shiftType => {
      if (shiftType === 'C' && forcedClosing && tempWorking.includes(forcedClosing)) {
        const picked = forcedClosing;
        tempWorking.splice(tempWorking.indexOf(picked), 1);
        assigned[picked] = shiftType;
        staffStats[picked][shiftType]++;
        staffStats[picked].totalWork++;
        return;
      }

      tempWorking.sort((a, b) => {
        const bWeight = (shiftType === 'C') ? 0 : -5;
        const aScore = staffStats[a][shiftType] + (prevSchedule[a] === shiftType ? bWeight : 0);
        const bScore = staffStats[b][shiftType] + (prevSchedule[b] === shiftType ? bWeight : 0);

        if (aScore === bScore) {
          const aRef = (staffKeys.indexOf(a) + dateIdx) % staffKeys.length;
          const bRef = (staffKeys.indexOf(b) + dateIdx) % staffKeys.length;
          return aRef - bRef;
        }
        return aScore - bScore;
      });
      const picked = tempWorking.shift();
      if (!picked) return;
      assigned[picked] = shiftType;
      staffStats[picked][shiftType]++;
      staffStats[picked].totalWork++;
    });
    schedule[d] = assigned;
  });

  // 6. Close shift balancing
  const totalC = allDates.reduce((sum, d) => {
    return sum + Object.values(schedule[d]).filter(s => s === 'C').length;
  }, 0);
  const targetC = Math.floor(totalC / staffKeys.length);

  allDates.forEach(d => {
    const current = schedule[d];
    staffKeys.forEach(staff => {
      if (current[staff] === 'C' && staffStats[staff].C > targetC + 1) {
        const candidates = Object.keys(current).filter(s =>
          s !== staff && staffStats[s].C < targetC
        );
        if (candidates.length > 0) {
          const picked = candidates[0];
          const oldShift = current[picked];
          current[staff] = oldShift;
          current[picked] = 'C';
          staffStats[staff].C--;
          staffStats[staff][oldShift]++;
          staffStats[picked].C++;
          staffStats[picked][oldShift]--;
        }
      }
    });
  });

  // Count rest stats
  Object.entries(restDays).forEach(([_, list]) => {
    list.forEach(s => {
      if (staffStats[s]) staffStats[s].rest++;
    });
  });

  return { schedule, staffStats, restDays };
};
