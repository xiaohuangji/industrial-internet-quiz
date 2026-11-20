import { daily, hasAnswer, metrics, percent, ratio, streak, summary } from './model.js';

export const esc = value => String(value ?? '').replace(/[&<>"']/g, mark => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[mark]));
export const stamp = time => new Date(time).toLocaleString('zh-CN', { hour12: false });
export const answerText = value => Array.isArray(value) ? value.map((part, i) => `${i + 1}. ${part || '—'}`).join('；')
  : typeof value === 'boolean' ? (value ? '正确（√）' : '错误（×）') : value || '—';
export const button = (label, action, value = '', kind = 'secondary', disabled = false) => (
  `<button type="button" class="btn ${kind}" data-action="${action}" data-value="${esc(value)}" ${disabled ? 'disabled' : ''}>${label}</button>`
);
const link = (label, route, kind = 'secondary') => `<a href="#${route}" class="btn ${kind}">${label}</a>`;
const head = (title, text = '') => `<header class="screen-head"><h1>${title}</h1>${text ? `<p>${text}</p>` : ''}</header>`;
const tile = (label, value) => `<div class="metric"><dt>${label}</dt><dd>${value}</dd></div>`;
const empty = text => `<p class="empty">${text}</p>`;
const option = (id, label, selected) => `<option value="${esc(id)}" ${id === selected ? 'selected' : ''}>${esc(label)}</option>`;
const fmtMark = a => a.result === true ? '正确' : a.result === false ? '错误'
  : ({ mastered: '已掌握', review: '需复习' }[a.evaluation] ?? '待自评');

export function filters(bank, selected, prefix = 'scope') {
  return `<div class="fields">
    <label for="${prefix}-chapter">章节<select id="${prefix}-chapter" name="chapter">
      ${option('', '全部章节', selected.chapter)}${bank.chapters.map(c => option(c.id, `${c.label} · ${c.title}`, selected.chapter)).join('')}
    </select></label>
    <label for="${prefix}-type">题型<select id="${prefix}-type" name="type">
      ${option('', '全部题型', selected.type)}${Object.entries(bank.types).map(([key, label]) => option(key, label, selected.type)).join('')}
    </select></label></div>`;
}

function chapterRow(bank, state, chapter) {
  const total = bank.questions.filter(q => q.chapter_id === chapter.id).length;
  const study = metrics(state.attempts.filter(a => a.id.startsWith('ch' + chapter.id + '_')));
  const progress = ratio(study.unique, total);
  return `<a class="chapter-row" href="#chapter/${chapter.id}">
    <span class="chapter-label">${chapter.label}</span>
    <div class="chapter-body"><strong>${esc(chapter.title)}</strong>
    <progress value="${study.unique}" max="${total}" aria-label="${chapter.label}完成率">${progress}%</progress>
    <small>已做 ${study.unique} / ${total} · 正确率 ${percent(study.accuracy)}</small></div>
    <span class="chapter-percent">${progress}%</span></a>`;
}

export function home(bank, state) {
  const m = metrics(state.attempts);
  const pending = Object.values(state.wrong).filter(x => !x.mastered).length;
  const progress = ratio(m.unique, bank.questions.length);
  const actions = [
    ['▤', '章节练习', '按原题顺序学习', 'chapters', 'blue'],
    ['⤨', '随机刷题', '按范围和题量抽题', 'random', 'violet'],
    ['◴', '错题重练', `${pending} 道待复习`, 'wrong', 'amber'],
    ['◷', '模拟考试', '限时作答与成绩回顾', 'exam', 'green'],
  ];
  return `<section class="hero">
      <div><p class="hero-kicker">学习概览</p><h1>${esc(bank.title)}</h1>
      <p class="hero-sub">${bank.questions.length} 道原卷题目 <span>·</span> ${bank.chapters.length} 个章节分组</p>
      ${state.session ? link(state.session.mode === 'exam' ? '继续模拟考试' : '继续上次练习', 'quiz', 'light')
        : link('开始章节练习', 'chapters', 'light')}</div>
      <div class="ring" style="--p:${progress}%" aria-label="题库完成率 ${progress}%"><div><b>${progress}%</b><span>题库完成率</span></div></div>
    </section>
    <dl class="metrics overview home-metrics">${tile('累计答题', m.total)}${tile('累计正确率', percent(m.accuracy))}
      ${tile('连续学习', streak(state.attempts) + ' 天')}${tile('待复习错题', pending)}</dl>
    <section class="section"><h2>练习模式</h2><div class="actions">
    ${actions.map(([icon, title, desc, route, color]) => `<a class="action-card card" href="#${route}">
      <span class="action-icon ${color}" aria-hidden="true">${icon}</span><div><strong>${title}</strong><small>${desc}</small></div></a>`).join('')}
    </div></section>
    <section class="section"><div class="section-head"><h2>章节进度</h2><a href="#stats">学习统计</a></div>
    <div class="card chapter-list">${bank.chapters.map(c => chapterRow(bank, state, c)).join('')}</div></section>`;
}

export function chapters(bank, state) {
  return head('章节练习', '选择章节和题型，按原题顺序练习。') +
    `<div class="card chapter-list">${bank.chapters.map(c => chapterRow(bank, state, c)).join('')}</div>`;
}

export function chapterPage(bank, state, chapter, selectedType) {
  const all = bank.questions.filter(q => q.chapter_id === chapter.id);
  const stat = metrics(state.attempts.filter(a => all.some(q => q.id === a.id)));
  const visible = all.filter(q => !selectedType || q.type === selectedType);
  const done = new Set(state.attempts.map(a => a.id));
  return head(`${chapter.label} · ${esc(chapter.title)}`) +
    `<div class="card stack"><dl class="metrics compact">${tile('已做题目', stat.unique + ' / ' + all.length)}
      ${tile('本章正确率', percent(stat.accuracy))}</dl>
      <label class="field">题型<select id="chapter-filter">${option('', '全部题型', selectedType)}
      ${Object.entries(bank.types).map(([key, label]) => option(key, label, selectedType)).join('')}</select></label>
      ${button('从头开始练习', 'chapter-start', '0', 'primary', !visible.length)}
    </div><section class="section"><h2>题目 · ${visible.length}</h2>
    <div class="card list">${visible.map((q, i) => `<div class="list-row">
      <div><small>原题 ${q.original_number} · ${bank.types[q.type]} · ${done.has(q.id) ? '已做' : '未做'}</small>
      <p>${esc(q.question.replace(/\{\{\d+\}\}/g, '____'))}</p></div>
      ${button('练习', 'chapter-start', i)}</div>`).join('') || empty('本章暂无此题型。')}</div></section>`;
}

export function setup(bank, mode, settings, count, active) {
  const exam = mode === 'exam';
  return head(exam ? '模拟考试' : '随机刷题', exam
    ? '按范围随机组卷，交卷后查看成绩和答案。' : '选定范围与题量，提交每道题后立即反馈。') +
    `${active ? `<div class="card banner"><p>${exam ? '有一场考试正在进行。' : '有一组随机练习可继续。'}</p>${link(exam ? '继续考试' : '继续练习', 'quiz')}</div>` : ''}
    <form id="setup" data-mode="${mode}" class="card stack">
      ${filters(bank, settings)}
      <label class="field">抽题数量<input name="count" type="number" min="1" max="${Math.max(1, count)}" value="${settings.count}" required></label>
      ${exam
        ? `<label class="field">考试时长（分钟）<input name="minutes" type="number" min="1" max="180" value="${settings.minutes}" required></label>
           <p class="muted">每道可判分题计 1 分。简答和待核验题交卷后可自评。</p>`
        : `<label class="check"><input name="includeDone" type="checkbox" ${settings.includeDone ? 'checked' : ''}>包含已做题目</label>`}
      <p id="available" class="muted" aria-live="polite">当前可抽 ${count} 道题</p>
      <button class="btn primary" type="submit" ${count ? '' : 'disabled'}>${exam ? '开始考试' : '开始随机刷题'}</button>
    </form>`;
}

export function questionTitle(question) {
  return esc(question.question).replace(/\{\{(\d+)\}\}/g,
    (_, index) => `<span class="blank" aria-label="第 ${index} 空">${index}</span>`);
}

const imageButton = img => `<button type="button" class="image-button" data-action="image" data-value="${esc(img.path)}" aria-label="放大${esc(img.alt)}"><img src="./${esc(img.path)}" alt="${esc(img.alt)}"></button>`;

export function reference(q) {
  const ref = q.answer === null ? '原 PDF 未给出答案' :
    esc(answerText(q.answer)) + (q.type === 'single_choice' && q.options[q.answer] ? ' · ' + esc(q.options[q.answer]) : '');
  return `<div class="reference"><strong>${q.status === 'verified' ? '标准答案' : '原件答案信息'}</strong><p>${ref}</p>
    ${q.source_highlight_option ? `<p>原件标红选项 ${q.source_highlight_option}</p>` : ''}
    ${q.explanation ? `<p>${esc(q.explanation)}</p>` : ''}
    ${q.notes.map(note => `<small>${esc(note)}</small>`).join('')}</div>`;
}

const selfControls = (index, current) => `<div class="button-row self-controls">
  ${button('已掌握', 'self', index + '/mastered', current === 'mastered' ? 'primary' : 'secondary')}
  ${button('需复习', 'self', index + '/review', current === 'review' ? 'primary' : 'secondary')}</div>`;
const choiceControl = (key, label, selected) => `<label class="choice ${selected ? 'selected' : ''}">
  <input type="radio" name="answer" value="${key}" ${selected ? 'checked' : ''}>
  <span class="letter">${key === 'true' ? '√' : key === 'false' ? '×' : key}</span>${label ? `<span>${esc(label)}</span>` : ''}</label>`;

export function quiz(bank, state, q, revealed) {
  const s = state.session;
  if (!s) return head('继续学习') + `<div class="card stack"><p>当前没有进行中的练习。</p>${link('选择章节', 'chapters')}</div>`;
  const exam = s.mode === 'exam';
  const index = s.submitted[q.id];
  const attempt = state.attempts[index];
  const value = s.answers[q.id];
  const disabled = Boolean(attempt);
  const imageOptions = q.images.some(img => img.option);
  const favorite = state.favorites.includes(q.id);
  const chapterIds = new Set(bank.questions.filter(item => item.chapter_id === q.chapter_id).map(item => item.id));
  const study = metrics(state.attempts.filter(a => chapterIds.has(a.id)));
  let controls = '';
  if (q.type === 'fill') {
    controls = q.answer.map((_, i) => `<label class="field">第 ${i + 1} 空<input type="text" name="fill" data-slot="${i}"
      maxlength="4000" autocomplete="off" value="${esc(value?.[i])}" ${disabled ? 'disabled' : ''}></label>`).join('');
  } else if (q.type === 'short') {
    controls = `<label class="field">你的作答<textarea name="answer" rows="5" maxlength="4000" ${disabled ? 'disabled' : ''}>${esc(value)}</textarea></label>`;
  } else if (q.type === 'single_choice') {
    controls = Object.entries(q.options).map(([key, label]) => {
      const img = q.images.find(item => item.option === key);
      return `<div class="choice-item">${choiceControl(key, label, value === key)}${img ? imageButton(img) : ''}</div>`;
    }).join('');
  } else {
    controls = choiceControl('true', '正确', value === true) + choiceControl('false', '错误', value === false);
  }
  const palette = exam ? `<details class="card palette" open><summary>答题卡</summary><div class="numbers">${s.ids.map((id, i) => {
    const marked = s.marks.includes(id);
    const filled = hasAnswer(s.answers[id]);
    return `<button type="button" class="num ${filled ? 'filled' : ''} ${marked ? 'flagged' : ''} ${i === s.index ? 'current' : ''}"
      data-action="jump" data-value="${i}" aria-label="第 ${i + 1} 题，${filled ? '已答' : '未答'}${marked ? '，已标记' : ''}" ${i === s.index ? 'aria-current="step"' : ''}>${i + 1}</button>`;
  }).join('')}</div><small>浅蓝为已答 · 橙点为已标记</small></details>` : '';
  return `<div class="quiz-top"><div><h1>${({chapter:'章节练习',random:'随机刷题',wrong:'错题重练',favorites:'收藏练习',exam:'模拟考试'})[s.mode]}</h1>
    <p>第 ${s.index + 1} / ${s.ids.length} 题 ${exam ? '' : ' · 本章正确率 ' + percent(study.accuracy)}</p></div>
    ${exam ? '<span id="timer" class="timer" aria-label="考试剩余时间"></span>' : button('退出练习', 'pause')}</div>
    <progress value="${s.index + 1}" max="${s.ids.length}" class="quiz-progress" aria-label="当前题序"></progress>
    <article class="card question stack">
      <div class="question-meta"><span class="tag">${bank.types[q.type]}</span><small>${q.chapter} · 原题 ${q.original_number} · PDF 第 ${q.source_pages.join('–')} 页</small></div>
      <h2>${questionTitle(q)}</h2>
      ${q.images.filter(img => !img.option).map(imageButton).join('')}
      <fieldset class="answer-controls ${imageOptions ? 'image-options' : ''}" ${disabled && !imageOptions ? 'disabled' : ''}><legend class="sr-only">作答</legend>
      ${disabled && imageOptions ? controls.replaceAll('name="answer"', 'name="answer" disabled') : controls}</fieldset>
      ${exam ? `<div class="button-row">${button(s.marks.includes(q.id) ? '取消标记' : '标记待处理', 'mark')}
        ${button('清空本题', 'clear', '', 'quiet', !hasAnswer(value))}</div>` :
        `<div class="button-row">${button(favorite ? '取消收藏' : '收藏', 'favorite', q.id)}
        ${button(revealed ? '收起答案' : '查看答案', 'reveal')}</div>
        ${attempt ? `<p class="feedback ${attempt.result === true ? 'good' : attempt.result === false ? 'bad' : ''}" role="status">${fmtMark(attempt)}${attempt.result === null ? ' · 可记录本题自评' : ''}</p>
        ${attempt.result === null ? selfControls(index, attempt.evaluation) : ''}`
          : button('提交答案', 'answer', '', 'primary', !hasAnswer(value))}
        ${revealed ? reference(q) : ''}`}
    </article>
    <div class="quiz-footer">${button('上一题', 'step', -1, 'secondary', s.index === 0)}
    ${s.index < s.ids.length - 1 ? button('下一题', 'step', 1, 'primary')
      : exam ? button('交卷', 'deliver', '', 'primary') : button('结束练习', 'end', '', 'primary')}</div>
    ${palette}
    ${exam ? `<div class="button-row bottom-actions">${s.index < s.ids.length - 1 ? button('交卷', 'deliver') : ''}
        ${button('返回首页', 'pause', '', 'quiet')}</div>` : ''}`;
}

export function wrongPage(bank, state, selected, rows) {
  return head('错题本', '复习答错的客观题，也可以查看原有答题记录。') +
    `<div class="card stack">${filters(bank, selected, 'wrong')}
      <label class="field">复习状态<select id="wrong-status">${option('', '全部错题', selected.status)}
        ${option('pending', '待复习', selected.status)}${option('mastered', '已掌握', selected.status)}</select></label>
      <div class="button-row">${button('重练筛选结果', 'wrong-start', '', 'primary', !rows.length)}
      ${button('移除已掌握题目', 'remove-mastered', '', 'secondary', !rows.some(q => state.wrong[q.id].mastered))}</div>
    </div><section class="section"><h2>错题 · ${rows.length}</h2>
    <div class="card list">${rows.map(q => {
      const item = state.wrong[q.id];
      return `<div class="list-row wrap">
        <small>${q.chapter} · 原题 ${q.original_number} · ${bank.types[q.type]} · 累计答错 ${item.count} 次</small>
        <h3>${questionTitle(q)}</h3><div class="button-row">
        ${button('重练本题', 'single-wrong', q.id, 'primary')}
        ${button(item.mastered ? '恢复待复习' : '标记已掌握', 'mastered', q.id)}
        ${button('答题记录', 'history', q.id)}</div></div>`;
    }).join('') || empty('当前范围没有错题。')}</div></section>`;
}

export function history(bank, state, id) {
  const q = bank.questions.find(item => item.id === id);
  const attempts = state.attempts.filter(a => a.id === id).reverse();
  return `<p>${q.chapter} · 原题 ${q.original_number}</p>
    <ol class="history">${attempts.map(a => `<li><strong>${fmtMark(a)}</strong> <small>${stamp(a.time)}</small>
      <p>作答 ${esc(answerText(a.value))}</p></li>`).join('')}</ol>`;
}

export function favorites(bank, state) {
  const rows = bank.questions.filter(q => state.favorites.includes(q.id));
  return head('我的收藏') + `<div class="card list">
    ${rows.map(q => `<div class="list-row wrap"><small>${q.chapter} · 原题 ${q.original_number}</small>
    <h3>${questionTitle(q)}</h3><div class="button-row">${button('练习本题', 'favorite-start', q.id, 'primary')}
    ${button('取消收藏', 'favorite', q.id)}</div></div>`).join('') || empty('在练习时可收藏题目。')}</div>`;
}

export function profile(state) {
  return head('我的') + `<div class="card menu-list">
      <a href="#stats"><strong>学习统计</strong><small>进度、正确率与每日答题量</small></a>
      <a href="#favorites"><strong>我的收藏</strong><small>${state.favorites.length} 道题</small></a>
      <a href="#exams"><strong>考试记录</strong><small>${state.exams.length} 场考试</small></a>
      <a href="#install"><strong>添加到手机桌面</strong><small>安装与离线使用方法</small></a>
    </div><section class="section"><h2>数据备份</h2><div class="card stack">
      <p>学习记录保存在当前设备的浏览器。可导出备份，在换设备时恢复。</p>
      <div class="button-row">${button('导出备份', 'export', '', 'primary')}${button('导入备份', 'import')}</div>
      <input type="file" id="backup-file" accept=".json,application/json" hidden>
    </div></section>`;
}

export function stats(bank, state) {
  const m = metrics(state.attempts);
  const days = daily(state.attempts);
  const max = Math.max(1, ...days.map(x => x.count));
  return head('学习统计', '完成率按做过的不同题目计算。正确率基于已作答、可判分的题目。') +
    `<dl class="metrics overview">${tile('不同题目', m.unique)}${tile('答题次数', m.total)}${tile('正确次数', m.correct)}
    ${tile('总体正确率', percent(m.accuracy))}${tile('首次正确率', percent(m.first))}
    ${tile('累计答错题目', new Set(state.attempts.filter(a => a.result === false).map(a => a.id)).size)}
    ${tile('最近正确率', percent(m.latest))}
    ${tile('待复习', Object.values(state.wrong).filter(w => !w.mastered).length)}</dl>
    <section class="section"><h2>最近 7 天答题量</h2><div class="card">
    <ol class="bars">${days.map(x => `<li><span>${x.count}</span><div class="bar-track"><div class="bar" style="height:${100 * x.count / max}%"></div></div>
      <time datetime="${x.date}">${x.date.slice(5)}</time></li>`).join('')}</ol></div></section>
    <section class="section"><h2>各章节完成率与正确率</h2><div class="card chapter-list">
      ${bank.chapters.map(c => chapterRow(bank, state, c)).join('')}</div></section>
    <section class="section"><h2>各题型正确率</h2><div class="card breakdown">
      ${Object.entries(bank.types).map(([key, name]) => {
        const ids = new Set(bank.questions.filter(q => q.type === key).map(q => q.id));
        const t = metrics(state.attempts.filter(a => ids.has(a.id)));
        return `<div><span>${name}</span><strong>${percent(t.accuracy)}</strong><small>${t.correct} / ${t.graded} 次客观判分</small></div>`;
      }).join('')}</div></section>`;
}

export function exams(state) {
  return head('考试记录') + `<div class="card menu-list">${state.exams.map(e => {
    const s = summary(e.rows);
    return `<a href="#result/${encodeURIComponent(e.id)}"><strong>${stamp(e.time)}</strong>
      <small>${s.right} / ${s.max} 分 · ${e.rows.length} 题 · ${e.reason === 'time' ? '时间到自动交卷' : '手动交卷'}</small></a>`;
  }).join('') || empty('完成一次模拟考试后，成绩会显示在这里。')}</div>`;
}

export function result(bank, state, exam, byId) {
  if (!exam) return head('考试成绩') + `<div class="card">${empty('没有找到这场考试。')}</div>`;
  const scores = summary(exam.rows);
  const breakdown = (title, groups, key) => `<section class="section"><h2>${title}</h2><div class="card breakdown">
    ${groups.map(([id, label]) => {
      const rows = exam.rows.filter(row => byId.get(row.id)[key] === id);
      if (!rows.length) return '';
      const s = summary(rows);
      return `<div><span>${esc(label)}</span><strong>${s.right} / ${s.max} 分</strong>
        <small>正确率 ${percent(s.accuracy)} · 未答 ${s.unanswered} · 自评 ${s.self}</small></div>`;
    }).join('')}</div></section>`;
  return head('考试成绩', exam.reason === 'time' ? '考试时间到，答卷已自动提交。' : '答卷已提交。') +
    `<dl class="metrics overview">${tile('总分', scores.right + ' / ' + scores.max)}
      ${tile('正确', scores.right)}${tile('错误', scores.wrong)}${tile('未作答', scores.unanswered)}
      ${tile('客观题正确率', percent(scores.accuracy))}${tile('自评题', scores.self)}</dl>
      ${breakdown('各题型表现', Object.entries(bank.types), 'type')}
      ${breakdown('各章节表现', bank.chapters.map(c => [c.id, c.label + ' · ' + c.title]), 'chapter_id')}
      <section class="section"><h2>答题回顾</h2><div class="card list">
      ${exam.rows.map((row, i) => {
        const q = byId.get(row.id);
        const a = state.attempts[row.attempt];
        const mark = a ? fmtMark(a) : q.auto_grade ? '未作答' : '未作答 · 自评题';
        return `<details class="review"><summary>${i + 1}. ${q.chapter}原题 ${q.original_number} · ${mark}</summary>
        <h3>${questionTitle(q)}</h3>${q.images.map(imageButton).join('')}
        ${q.options ? `<ul class="plain-options">${Object.entries(q.options).map(([key, value]) =>
          `<li>${key}. ${esc(value || '（见原图）')}</li>`).join('')}</ul>` : ''}
        <p>你的答案 ${esc(answerText(row.value))}</p>${reference(q)}
        ${a?.result === null ? selfControls(row.attempt, a.evaluation) : ''}</details>`;
      }).join('')}</div></section>`;
}

export function installView() {
  return head('添加到手机桌面') + `<div class="card stack">
    <h2>iPhone · Safari</h2><p>打开 HTTPS 站点，点按分享，再选「添加到主屏幕」。若出现「作为网页 App 打开」，将其开启后点「添加」。</p>
    <h2>Android · Chrome</h2><p>打开 HTTPS 站点，进入右上角菜单，选择「安装应用」或「添加到主屏幕」，按提示确认。</p>
    <h2>离线使用</h2><p>首次联网打开时，等页首显示「离线可用」。从桌面图标启动后，可再次检查离线状态。</p>
  </div>`;
}
