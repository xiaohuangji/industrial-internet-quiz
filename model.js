export const emptyState = () => ({
  attempts: [], wrong: {}, favorites: [], exams: [], preferences: {}, session: null,
});

export const hasAnswer = value => Array.isArray(value)
  ? value.some(part => part.trim())
  : typeof value === 'boolean' || (typeof value === 'string' && Boolean(value.trim()));

const normalized = text => text.normalize('NFKC').toLowerCase()
  .replace(/[\s“”‘’"'_]/gu, '').replace(/[,，、]/gu, '、');

export function grade(question, value) {
  if (!question.auto_grade || !hasAnswer(value)) return null;
  if (question.type !== 'fill') return value === question.answer;
  return Array.isArray(value) && question.answer.every((part, i) => (
    normalized(part) === normalized(value[i] ?? '')
  ));
}

export function sample(pool, count, random = Math.random) {
  const copy = [...pool];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, count);
}

export function record(state, question, value, mode, time) {
  const result = grade(question, value);
  const entry = { id: question.id, value, result, mode, time, evaluation: null };
  state.attempts.push(entry);
  if (result === false) {
    state.wrong[question.id] = {
      mastered: false, count: (state.wrong[question.id]?.count ?? 0) + 1, time,
    };
  }
  return entry;
}

export function metrics(attempts) {
  const rated = attempts.filter(item => item.result !== null);
  const first = new Map();
  const latest = new Map();
  for (const item of rated) {
    if (!first.has(item.id)) first.set(item.id, item);
    latest.set(item.id, item);
  }
  const correct = rated.filter(item => item.result).length;
  return { total: attempts.length, unique: new Set(attempts.map(item => item.id)).size,
    correct, graded: rated.length, accuracy: ratio(correct, rated.length),
    first: ratio([...first.values()].filter(item => item.result).length, first.size),
    latest: ratio([...latest.values()].filter(item => item.result).length, latest.size) };
}

export const ratio = (a, b) => b ? Math.round(100 * a / b) : null;
export const percent = value => value === null ? '—' : value + '%';
export const dateKey = time => {
  const d = new Date(time);
  return [d.getFullYear(), d.getMonth() + 1, d.getDate()]
    .map(n => String(n).padStart(2, '0')).join('-');
};

export function daily(attempts, days = 7) {
  const counts = new Map();
  for (const a of attempts) counts.set(dateKey(a.time), (counts.get(dateKey(a.time)) ?? 0) + 1);
  const today = new Date();
  return Array.from({ length: days }, (_, i) => {
    const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() - days + i + 1, 12);
    const key = dateKey(day);
    return { date: key, count: counts.get(key) ?? 0 };
  });
}

export function streak(attempts) {
  const days = new Set(attempts.map(a => dateKey(a.time)));
  const cursor = new Date();
  cursor.setHours(12, 0, 0, 0);
  if (!days.has(dateKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let result = 0;
  while (days.has(dateKey(cursor))) {
    result++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return result;
}

export function summary(rows) {
  const right = rows.filter(row => row.result === true).length;
  const wrong = rows.filter(row => row.result === false).length;
  return { right, wrong, unanswered: rows.filter(row => !hasAnswer(row.value)).length,
    max: rows.filter(row => row.gradable).length, accuracy: ratio(right, right + wrong),
    self: rows.filter(row => !row.gradable).length };
}

export function deliver(state, byId, time, reason) {
  const session = state.session;
  const rows = session.ids.map(id => {
    const q = byId.get(id);
    const value = session.answers[id] ?? null;
    const attempt = hasAnswer(value) ? state.attempts.length : null;
    const saved = attempt === null ? null : record(state, q, value, 'exam', time);
    return { id, value, result: saved?.result ?? null, gradable: q.auto_grade, attempt };
  });
  state.exams.unshift({ id: session.key, time, started: session.started, seconds: session.seconds, reason, rows });
  state.session = null;
  return session.key;
}

const isObject = value => value && typeof value === 'object' && !Array.isArray(value);
const isTime = value => Number.isSafeInteger(value) && value > 0 && value <= 8640000000000000;
const modes = ['chapter', 'random', 'wrong', 'favorites', 'exam'];
const evaluations = [null, 'mastered', 'review'];
const shortText = value => typeof value === 'string' && value.length <= 4000;
const isId = (map, id) => typeof id === 'string' && map.has(id);

function validValue(q, value) {
  if (q.type === 'fill') return Array.isArray(value) && value.length === q.answer.length && value.every(shortText);
  if (q.type === 'true_false') return typeof value === 'boolean';
  if (q.type === 'single_choice') return typeof value === 'string' && Object.hasOwn(q.options, value);
  return shortText(value);
}

export function validState(state, map) {
  const entries = (object, test) => isObject(object)
    && Object.entries(object).every(([id, v]) => isId(map, id) && test(v, map.get(id)));
  const attempt = a => isObject(a) && isId(map, a.id) && isTime(a.time)
    && modes.includes(a.mode) && evaluations.includes(a.evaluation)
    && validValue(map.get(a.id), a.value) && hasAnswer(a.value)
    && [null, true, false].includes(a.result)
    && (map.get(a.id).auto_grade ? typeof a.result === 'boolean' : a.result === null);
  if (!isObject(state) || !Array.isArray(state.attempts) || !state.attempts.every(attempt)) return false;
  const index = (n, id) => Number.isInteger(n) && n >= 0 && state.attempts[n]?.id === id;
  if (!entries(state.wrong, item => isObject(item) && typeof item.mastered === 'boolean'
    && Number.isSafeInteger(item.count) && item.count >= 1 && isTime(item.time))) return false;
  if (!Array.isArray(state.favorites) || !state.favorites.every(id => isId(map, id))
    || new Set(state.favorites).size !== state.favorites.length) return false;
  const session = state.session;
  if (session !== null) {
    if (!isObject(session) || !modes.includes(session.mode) || !shortText(session.key)
      || !isTime(session.started) || !Array.isArray(session.ids) || !session.ids.length
      || !session.ids.every(id => isId(map, id)) || new Set(session.ids).size !== session.ids.length
      || !Number.isInteger(session.index) || session.index < 0 || session.index >= session.ids.length
      || !entries(session.answers, (value, q) => session.ids.includes(q.id) && validValue(q, value))
      || !entries(session.submitted, (n, q) => session.ids.includes(q.id) && index(n, q.id))
      || !Array.isArray(session.marks) || !session.marks.every(id => session.ids.includes(id))
      || (session.mode === 'exam' && (!isTime(session.deadline) || !Number.isInteger(session.seconds)
        || session.seconds < 60 || session.seconds > 10800
        || session.deadline !== session.started + session.seconds * 1000))) return false;
  }
  const examRow = row => isObject(row) && isId(map, row.id) && typeof row.gradable === 'boolean'
    && row.gradable === map.get(row.id).auto_grade
    && [null, true, false].includes(row.result)
    && (row.value === null || validValue(map.get(row.id), row.value))
    && (row.attempt === null ? !hasAnswer(row.value) && row.result === null :
      index(row.attempt, row.id) && state.attempts[row.attempt].mode === 'exam'
      && state.attempts[row.attempt].result === row.result && hasAnswer(row.value));
  return Array.isArray(state.exams) && state.exams.every(e => isObject(e) && shortText(e.id)
    && isTime(e.time) && isTime(e.started) && Number.isInteger(e.seconds)
    && e.seconds >= 60 && e.seconds <= 10800 && ['manual', 'time'].includes(e.reason)
    && Array.isArray(e.rows) && e.rows.length && e.rows.every(examRow)
    && new Set(e.rows.map(row => row.id)).size === e.rows.length)
    && isObject(state.preferences);
}
