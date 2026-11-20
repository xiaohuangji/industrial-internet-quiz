import { dateKey, deliver, emptyState, hasAnswer, record, sample, validState } from './model.js';
import * as view from './views.js';

const app = document.querySelector('#app');
const nav = document.querySelector('#nav');
const dialog = document.querySelector('#dialog');
const notice = document.querySelector('#notice');
const connection = document.querySelector('#connection');
const storageKey = 'industrial-internet-quiz:v1:' + new URL('./', location.href).pathname;
const backupKind = 'industrial-internet-quiz';
const version = 1;

let bank, byId, state, lastSaved, offlineReady = false, previousRoute = '', afterClose;
const disclosed = new Set();
const defaults = { chapter: '', type: '', count: 10, minutes: 30, includeDone: true };
const draft = { random: { ...defaults }, exam: { ...defaults, count: 20 } };
let chapterType = '';
let wrong = { chapter: '', type: '', status: '' };

const route = () => location.hash.slice(1) || 'home';
const current = () => byId.get(state.session?.ids[state.session.index]);
const sessionScope = () => state.session?.origin || 'home';
const field = (form, name) => form.elements.namedItem(name);
const flash = message => {
  notice.textContent = message;
  notice.hidden = !message;
};

function save() {
  try {
    const value = JSON.stringify(state);
    localStorage.setItem(storageKey, value);
    lastSaved = value;
    return true;
  } catch {
    state = JSON.parse(lastSaved);
    flash('本次更改未保存。请检查浏览器的站点存储空间或权限。');
    return false;
  }
}

function go(target) {
  if (route() === target) {
    render();
    return;
  }
  location.hash = target;
}

function inScope(q, settings) {
  return (!settings.chapter || q.chapter_id === settings.chapter) && (!settings.type || q.type === settings.type);
}

function pool(mode, settings) {
  const done = new Set(mode === 'random' && !settings.includeDone ? state.attempts.map(a => a.id) : []);
  return bank.questions.filter(q => inScope(q, settings) && !done.has(q.id));
}

function wrongRows() {
  return bank.questions.filter(q => {
    const item = state.wrong[q.id];
    return item && inScope(q, wrong) && (!wrong.status || (wrong.status === 'mastered') === item.mastered);
  }).sort((a, b) => state.wrong[b.id].time - state.wrong[a.id].time);
}

function render() {
  const screen = route();
  const [page, param] = screen.split('/');
  const oldSteps = screen === previousRoute && page === 'result'
    ? [...app.querySelectorAll('details.review')].map(el => el.open) : [];
  const currentNav = page === 'chapter' ? 'chapters'
    : ['stats', 'favorites', 'exams', 'result', 'install'].includes(page) ? 'profile' : page;
  for (const a of nav.querySelectorAll('a')) {
    if (a.hash === '#' + currentNav) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  let content;
  if (page === 'chapter') {
    const chapter = bank.chapters.find(c => c.id === param);
    content = chapter ? view.chapterPage(bank, state, chapter, chapterType) : view.chapters(bank, state);
  } else if (page === 'random' || page === 'exam') {
    const count = pool(page, draft[page]).length;
    if (count && draft[page].count > count) draft[page].count = count;
    content = view.setup(bank, page, draft[page], count, state.session?.mode === page);
  } else if (page === 'result') {
    const exam = state.exams.find(e => encodeURIComponent(e.id) === param);
    content = view.result(bank, state, exam, byId);
  } else {
    const screens = {
      home: () => view.home(bank, state),
      chapters: () => view.chapters(bank, state),
      wrong: () => view.wrongPage(bank, state, wrong, wrongRows()),
      profile: () => view.profile(state),
      stats: () => view.stats(bank, state),
      favorites: () => view.favorites(bank, state),
      exams: () => view.exams(state),
      install: view.installView,
      quiz: () => view.quiz(bank, state, current(), disclosed.has(current()?.id)),
    };
    content = Object.hasOwn(screens, page) ? screens[page]() : view.home(bank, state);
  }
  app.innerHTML = content;
  app.querySelectorAll('details.review').forEach((detail, i) => { detail.open = Boolean(oldSteps[i]); });
  if (screen !== previousRoute) {
    previousRoute = screen;
    window.scrollTo(0, 0);
    app.focus({ preventScroll: true });
  }
  updateTimer();
}

function modal(title, body, label, action) {
  if (dialog.open) dialog.close();
  dialog.innerHTML = `<h2>${title}</h2>${body}<div class="button-row dialog-buttons">
    ${view.button(action ? '取消' : '关闭', 'close-dialog')}
    ${action ? view.button(label, 'confirm-dialog', '', 'primary') : ''}</div>`;
  afterClose = action;
  dialog.showModal();
}

function begin(mode, questions, index = 0, seconds = 0) {
  if (!questions.length) return;
  const start = () => {
    const started = Date.now();
    const key = globalThis.crypto?.randomUUID?.() ?? (started + '-' + Math.random().toString(36).slice(2));
    state.session = { mode, ids: questions.map(q => q.id), index, started, key, origin: route(),
      answers: {}, submitted: {}, marks: [], seconds, deadline: seconds ? started + seconds * 1000 : null };
    if (mode === 'exam' || mode === 'random') state.preferences[mode] = { ...draft[mode] };
    if (save()) {
      disclosed.clear();
      go('quiz');
    }
  };
  if (state.session?.mode === 'exam') {
    modal('考试正在进行', '<p>返回答题可继续考试。开始新练习将放弃当前答卷。</p>', '放弃并开始', start);
  } else if (state.session) {
    modal('开始新的练习', '<p>当前练习进度将被替换，已提交答案仍保留在学习记录中。</p>', '开始新练习', start);
  } else start();
}

function submitExam(reason) {
  if (state.session?.mode !== 'exam') return;
  if (dialog.open) dialog.close();
  const time = Date.now();
  if (time >= state.session.deadline) reason = 'time';
  const id = deliver(state, byId, time, reason);
  if (save()) {
    go('result/' + encodeURIComponent(id));
    return;
  }
  flash('答卷尚未保存。请检查浏览器的站点存储后重试交卷。');
}

function updateTimer() {
  if (state?.session?.mode !== 'exam') return false;
  const time = Math.ceil((state.session.deadline - Date.now()) / 1000);
  const timer = document.querySelector('#timer');
  if (timer) {
    const available = Math.max(0, time);
    const mm = String(Math.floor(available / 60)).padStart(2, '0');
    const ss = String(available % 60).padStart(2, '0');
    timer.textContent = mm + ':' + ss;
    timer.classList.toggle('expiring', available < 60);
  }
  if (time <= 0) {
    submitExam('time');
    return true;
  }
  return false;
}

function move(index) {
  state.session.index = index;
  if (save()) {
    render();
    window.scrollTo(0, 0);
    app.querySelector('h1').setAttribute('tabindex', '-1');
    app.querySelector('h1').focus({ preventScroll: true });
  }
}

function updateDraft(form, target) {
  const mode = form.dataset.mode;
  const settings = draft[mode];
  settings.chapter = field(form, 'chapter').value;
  settings.type = field(form, 'type').value;
  settings.includeDone = mode === 'exam' || field(form, 'includeDone').checked;
  if (mode === 'exam') settings.minutes = field(form, 'minutes').valueAsNumber || settings.minutes;
  const count = pool(mode, settings).length;
  const input = field(form, 'count');
  input.max = Math.max(1, count);
  if (target !== input && count && input.valueAsNumber > count) input.value = count;
  settings.count = input.valueAsNumber || settings.count;
  document.querySelector('#available').textContent = `当前可抽 ${count} 道题`;
  form.querySelector('button[type="submit"]').disabled = !count;
}

function capture(input) {
  const s = state.session;
  const q = current();
  if (!q || Object.hasOwn(s.submitted, q.id) || updateTimer()) return;
  let value = input.value;
  if (q.type === 'fill') {
    value = [...(s.answers[q.id] ?? q.answer.map(() => ''))];
    value[Number(input.dataset.slot)] = input.value;
  }
  if (q.type === 'true_false') value = input.value === 'true';
  s.answers[q.id] = value;
  if (!save()) {
    render();
    return;
  }
  if (input.type === 'radio') {
    app.querySelectorAll('.choice').forEach(label => label.classList.toggle('selected', label.querySelector('input').checked));
  }
  const submit = app.querySelector('[data-action=answer]');
  if (submit) submit.disabled = !hasAnswer(value);
  const clear = app.querySelector('[data-action=clear]');
  if (clear) clear.disabled = !hasAnswer(value);
  const step = app.querySelector('.num.current');
  if (step) {
    const filled = hasAnswer(value);
    step.classList.toggle('filled', filled);
    step.setAttribute('aria-label', `第 ${s.index + 1} 题，${filled ? '已答' : '未答'}${s.marks.includes(q.id) ? '，已标记' : ''}`);
  }
}

document.addEventListener('input', event => {
  if (!bank) return;
  const input = event.target;
  if (input.form?.id === 'setup') updateDraft(input.form, input);
  if (route() === 'quiz' && input.matches('.answer-controls input, .answer-controls textarea')) capture(input);
});

document.addEventListener('change', async event => {
  if (!bank) return;
  const input = event.target;
  if (input.id === 'chapter-filter') {
    chapterType = input.value;
    render();
    app.querySelector('#chapter-filter').focus();
  }
  if (input.id.startsWith('wrong-')) {
    const key = input.id.slice(6);
    wrong[key] = input.value;
    render();
    app.querySelector('#' + input.id).focus();
  }
  if (input.id === 'backup-file' && input.files?.length) {
    const file = input.files[0];
    input.value = '';
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error('备份文件超过 10 MB。');
      const payload = JSON.parse(await file.text());
      if (payload?.format !== backupKind || payload?.version !== version || payload?.bankVersion !== bank.version) {
        throw new Error('备份格式、版本或题库版本不匹配。');
      }
      if (!validState(payload.state, byId)) throw new Error('备份内的学习记录不符合格式要求。');
      modal('恢复学习数据', '<p>导入将覆盖此浏览器中的当前学习记录和进行中的练习。</p>', '确认恢复', () => {
        state = payload.state;
        if (save()) {
          disclosed.clear();
          loadPreferences();
          flash('学习数据已恢复。');
          render();
        }
      });
    } catch (err) {
      flash(err instanceof SyntaxError ? '文件不是有效的 JSON 备份。' : '导入失败。' + err.message);
    }
  }
});

document.addEventListener('submit', event => {
  if (event.target.id !== 'setup') return;
  event.preventDefault();
  if (updateTimer()) return;
  const form = event.target;
  updateDraft(form, field(form, 'count'));
  if (!form.reportValidity()) return;
  const mode = form.dataset.mode;
  const settings = draft[mode];
  begin(mode, sample(pool(mode, settings), settings.count), 0, mode === 'exam' ? settings.minutes * 60 : 0);
});

const actions = {
  'close-dialog': () => dialog.close(),
  'confirm-dialog': () => {
    const action = afterClose;
    dialog.close();
    action?.();
  },
  'chapter-start': value => {
    const chapter = route().split('/')[1];
    begin('chapter', pool('chapter', { chapter, type: chapterType }), Number(value));
  },
  'wrong-start': () => begin('wrong', wrongRows()),
  'single-wrong': id => begin('wrong', [byId.get(id)]),
  'favorite-start': id => begin('favorites', [byId.get(id)]),
  pause: () => go(state.session.mode === 'exam' ? 'home' : sessionScope()),
  end: () => {
    const origin = sessionScope();
    state.session = null;
    if (save()) {
      flash('练习已结束，已提交答案已保存。');
      go(origin);
    }
  },
  step: value => move(state.session.index + Number(value)),
  jump: value => move(Number(value)),
  reveal: () => {
    const id = current().id;
    if (disclosed.has(id)) disclosed.delete(id);
    else disclosed.add(id);
    render();
    app.querySelector('[data-action=reveal]')?.focus();
  },
  favorite: id => {
    if (state.favorites.includes(id)) state.favorites = state.favorites.filter(item => item !== id);
    else state.favorites.push(id);
    if (save()) render();
  },
  answer: () => {
    const q = current();
    const s = state.session;
    if (!hasAnswer(s.answers[q.id]) || Object.hasOwn(s.submitted, q.id)) return;
    const index = state.attempts.length;
    record(state, q, s.answers[q.id], s.mode, Date.now());
    s.submitted[q.id] = index;
    if (save()) render();
  },
  self: value => {
    const [index, evaluation] = value.split('/');
    state.attempts[index].evaluation = evaluation;
    if (save()) render();
  },
  mark: () => {
    const s = state.session;
    const id = current().id;
    if (s.marks.includes(id)) s.marks = s.marks.filter(item => item !== id);
    else s.marks.push(id);
    if (save()) render();
  },
  clear: () => {
    delete state.session.answers[current().id];
    if (save()) render();
  },
  deliver: () => {
    const remaining = state.session.ids.filter(id => !hasAnswer(state.session.answers[id])).length;
    modal('确认交卷', `<p>${remaining ? '还有 ' + remaining + ' 道题未作答。' : '所有题目都已作答。'}交卷后即可查看成绩。</p>`,
      '确认交卷', () => submitExam('manual'));
  },
  mastered: id => {
    state.wrong[id].mastered = !state.wrong[id].mastered;
    if (save()) render();
  },
  'remove-mastered': () => {
    const ids = wrongRows().filter(q => state.wrong[q.id].mastered).map(q => q.id);
    modal('移除已掌握的错题', `<p>从本次筛选结果移除 ${ids.length} 道已掌握错题。题库与答题历史均会保留。</p>`,
      '确认移除', () => {
        for (const id of ids) delete state.wrong[id];
        if (save()) render();
      });
  },
  history: id => modal('答题记录', view.history(bank, state, id)),
  image: path => {
    const image = bank.questions.flatMap(q => q.images).find(item => item.path === path);
    if (!image) return;
    modal('查看原图', `<img class="enlarged" src="./${view.esc(image.path)}" alt="${view.esc(image.alt)}">`);
  },
  export: () => {
    const backup = { format: backupKind, version, bankVersion: bank.version, exportedAt: Date.now(), state };
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = '工业互联网学习备份-' + dateKey(Date.now()) + '.json';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
  import: () => document.querySelector('#backup-file').click(),
};

document.addEventListener('click', event => {
  const button = event.target.closest('button[data-action]');
  if (!bank || !button || button.disabled) return;
  const key = button.dataset.action;
  if (key !== 'close-dialog' && updateTimer()) return;
  if (Object.hasOwn(actions, key)) actions[key](button.dataset.value);
});

function loadPreferences() {
  for (const mode of ['random', 'exam']) {
    Object.assign(draft[mode], defaults, mode === 'exam' ? { count: 20 } : {});
    const p = state.preferences[mode];
    if (!p || typeof p !== 'object') continue;
    if (bank.chapters.some(c => c.id === p.chapter)) draft[mode].chapter = p.chapter;
    if (Object.hasOwn(bank.types, p.type)) draft[mode].type = p.type;
    if (Number.isInteger(p.count) && p.count >= 1 && p.count <= bank.questions.length) draft[mode].count = p.count;
    if (Number.isInteger(p.minutes) && p.minutes >= 1 && p.minutes <= 180) draft[mode].minutes = p.minutes;
    if (typeof p.includeDone === 'boolean') draft[mode].includeDone = p.includeDone;
  }
}

function updateConnection() {
  if (!navigator.onLine) connection.textContent = offlineReady ? '离线使用中' : '当前离线';
  else if (offlineReady) connection.textContent = '离线可用';
  else connection.textContent = window.isSecureContext ? '正在准备离线资源' : '在线 · 安装需 HTTPS';
  connection.classList.toggle('ready', offlineReady);
}

async function start() {
  const response = await fetch('./data/questions.json');
  if (!response.ok) throw new Error('题库加载失败');
  bank = await response.json();
  byId = new Map(bank.questions.map(q => [q.id, q]));
  state = emptyState();
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      const value = JSON.parse(saved);
      if (!validState(value, byId)) throw new Error('学习记录格式无效');
      state = value;
    }
  } catch {
    flash('无法读取当前浏览器中的学习记录。请检查站点存储或从备份恢复。');
  }
  lastSaved = JSON.stringify(state);
  loadPreferences();
  render();
  window.addEventListener('hashchange', () => {
    if (route().startsWith('chapter/') && route() !== previousRoute) chapterType = '';
    render();
  });
  window.addEventListener('storage', event => {
    if (event.key !== storageKey || !event.newValue) return;
    try {
      const incoming = JSON.parse(event.newValue);
      if (!validState(incoming, byId)) return;
      state = incoming;
      lastSaved = event.newValue;
      render();
    } catch {
      flash('另一窗口的学习记录无法读取。');
    }
  });
  document.addEventListener('visibilitychange', updateTimer);
  setInterval(updateTimer, 500);
}

updateConnection();
window.addEventListener('online', updateConnection);
window.addEventListener('offline', updateConnection);
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').then(async registration => {
    const worker = registration.installing;
    worker?.addEventListener('statechange', () => {
      if (worker.state === 'redundant' && !registration.active) connection.textContent = '离线资源下载失败';
    });
    await navigator.serviceWorker.ready;
    offlineReady = true;
    updateConnection();
  }).catch(() => { connection.textContent = '离线资源下载失败'; });
}
start().catch(() => {
  app.innerHTML = '<div class="card stack"><h1>题库加载失败</h1><p>请联网后刷新页面。</p></div>';
});
