(() => {
  'use strict';

  const ROOMS = ['Kitchen', 'Entry & mudroom', 'Hallways', 'Living & dining', 'Bathroom', 'Bedroom', 'Laundry', 'Exterior & garden', 'Details & materials'];
  const SWATCHES = {
    walnut: 'Walnut', oak: 'White oak', 'oak-strip': 'Oak strip flooring', plaster: 'Plaster', terrazzo: 'Terrazzo', terracotta: 'Terracotta tile',
    slate: 'Slate', quartzite: 'Green quartzite', marble: 'Marble', glass: 'Glass block', brass: 'Brass',
    steel: 'Stainless steel', tile: 'White square tile', 'green-tile': 'Olive tile', linen: 'Linen', rust: 'Rust upholstery'
  };
  const SHAPE = { walnut: 'plank', oak: 'plank', 'oak-strip': 'plank', brass: 'round', steel: 'round' };
  const STATUSES = [['love', 'Love', '1'], ['maybe', 'Maybe', '2'], ['cut', 'Cut', '3']];

  // Keep in sync with index.html: a save republishes the whole page from these pieces.
  const PAGE_HEAD = '<title>Renovation Brief</title><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Jost:wght@300;400;500&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,500;1,8..60,400&display=swap"><link rel="stylesheet" href="app.css">';
  const RESET = ':root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px/1.4 system-ui,sans-serif;background:#edebe6}img{max-width:100%}[hidden]{display:none!important}';
  const DRAFT_KEY = 'renovation-brief-draft';
  const PREF_KEY = 'renovation-brief-prefs';

  const appEl = document.getElementById('app');
  const focusEl = document.getElementById('focus-root');
  let S = JSON.parse(document.getElementById('state').textContent);
  const savedJSON = JSON.stringify(S);

  let canEdit = false;
  let artifactNs = null;
  let view = 'brief';
  let preview = false;
  let filter = 'unsorted';
  let roomFilter = 'all';
  let focus = null; // { ids: [...], i }
  let themeOpen = null;
  let lightbox = null; // { items: [{src, alt, caption}], i }
  let roomOpen = null;
  let saving = false;
  let saveError = '';
  let staleDraft = null;
  let restored = false;

  // ---------- storage helpers (per-viewer conveniences only) ----------
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* storage unavailable */ } }
  };

  // ---------- utils ----------
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const paras = s => String(s || '').trim().split(/\n\s*\n/).filter(Boolean).map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
  const pinById = id => S.pins.find(p => p.id === id);
  const pinIndex = id => S.pins.findIndex(p => p.id === id);
  const dirty = () => JSON.stringify(S) !== savedJSON;
  const E = () => canEdit && !preview && view === 'brief';

  function getPath(path) { return path.split('.').reduce((o, k) => (o == null ? o : o[k]), S); }
  function setPath(path, val) {
    const keys = path.split('.');
    const last = keys.pop();
    const obj = keys.reduce((o, k) => o[k], S);
    obj[last] = val;
  }

  function input(path, val, cls, ph) {
    return `<input class="f ${cls || ''}" data-path="${path}" value="${esc(val)}" placeholder="${esc(ph || '')}" aria-label="${esc(ph || path)}">`;
  }
  function area(path, val, cls, ph) {
    return `<textarea class="f ${cls || ''}" data-path="${path}" rows="1" placeholder="${esc(ph || '')}" aria-label="${esc(ph || path)}">${esc(val)}</textarea>`;
  }
  function autosize(el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 2 + 'px'; }
  function pinAlt(p) { return p.title ? p.title : (p.rooms && p.rooms.length ? p.rooms.join(', ') + ' inspiration' : 'Inspiration image'); }
  function img(p, extra) {
    return `<img src="${esc(p.src)}" alt="${esc(pinAlt(p))}" loading="lazy" ${p.w ? `width="${p.w}" height="${p.h}"` : ''} ${extra || ''}>`;
  }

  // ---------- brief ----------
  function marker(kind, i) {
    if (kind === 'num') return `<span class="num">${String(i + 1).padStart(2, '0')}</span>`;
    return `<span><span class="mark ${kind === 'x' ? 'x' : kind === 'dot' ? 'filled' : ''}"></span></span>`;
  }

  function listBlock(key, kind, addLabel, phTitle, phDetail) {
    const items = S.brief[key] || [];
    if (!E()) {
      const shown = items.filter(it => (it.title || '').trim());
      if (!shown.length) return '';
      return `<ol class="list">${shown.map((it, i) => `<li>${marker(kind, i)}<div><h3>${esc(it.title)}</h3>${it.detail ? `<div class="detail">${paras(it.detail)}</div>` : ''}</div><span></span></li>`).join('')}</ol>`;
    }
    const rows = items.map((it, i) => `<li>${marker(kind, i)}<div>${input(`brief.${key}.${i}.title`, it.title, 'h3', phTitle)}${area(`brief.${key}.${i}.detail`, it.detail, '', phDetail)}</div><div class="ctrls">${
      i > 0 ? `<button class="icon" data-act="move" data-list="${key}" data-i="${i}" data-d="-1" aria-label="Move up">↑</button>` : ''}${
      i < items.length - 1 ? `<button class="icon" data-act="move" data-list="${key}" data-i="${i}" data-d="1" aria-label="Move down">↓</button>` : ''}<button class="icon" data-act="rm" data-list="${key}" data-i="${i}" aria-label="Remove">×</button></div></li>`).join('');
    return `${items.length ? `<ol class="list">${rows}</ol>` : `<p class="emptynote">Nothing here yet. Designers and contractors won't see this section until you add something.</p>`}<button class="btn ghost addrow" data-act="add" data-list="${key}">${addLabel}</button>`;
  }

  function factsBlock() {
    const facts = S.brief.facts || [];
    if (!E()) {
      const shown = facts.filter(f => (f.value || '').trim());
      if (!shown.length) return '';
      return `<dl class="facts">${shown.map(f => `<div class="fact"><dt>${esc(f.label)}</dt><dd>${esc(f.value)}</dd></div>`).join('')}</dl>`;
    }
    return `<dl class="facts">${facts.map((f, i) => `<div class="fact"><div class="ctrls"><button class="icon" data-act="rm" data-list="facts" data-i="${i}" aria-label="Remove">×</button></div><dt>${input(`brief.facts.${i}.label`, f.label, 'label', 'Label')}</dt><dd>${area(`brief.facts.${i}.value`, f.value, '', f.hint || 'Add details')}</dd></div>`).join('')}</dl><button class="btn ghost addrow" data-act="add" data-list="facts">Add a fact</button>`;
  }

  const KEY_MAX = 5;

  function captioned(p) {
    return `<figure>${img(p)}${p.like || p.dislike ? `<figcaption>${esc(p.like)}${p.dislike ? `<span class="no">${esc(p.dislike)}</span>` : ''}</figcaption>` : ''}</figure>`;
  }

  function glanceBlock(edit) {
    const pins = (S.brief.keyPins || []).map(pinById).filter(Boolean).slice(0, KEY_MAX);
    if (!pins.length) return edit ? `<p class="emptynote">Mark up to ${KEY_MAX} pins as “At a glance” in Sort pins. They lead this section.</p>` : '';
    return `<div class="glance ${pins.length === KEY_MAX ? 'n5' : ''}">${pins.map(p => `<figure class="g">${img(p)}${
      edit ? `<button class="icon" data-act="key-toggle" data-id="${p.id}" aria-label="Remove from at a glance">×</button>` : ''}</figure>`).join('')}</div>`;
  }

  function styleBlock() {
    const details = S.brief.details || [];
    if (!E()) {
      const themes = details.map((d, i) => [d, i]).filter(([d]) => d.title);
      if (!themes.length && !(S.brief.keyPins || []).length) return '';
      return `${glanceBlock(false)}
        ${themes.length ? `<p class="subhead" style="margin-top:48px">Look closer</p><div class="themes">${themes.map(([d, i]) => themeCard(d, i)).join('')}</div>` : ''}
        ${alsoBlock(false)}`;
    }
    return `<p class="subhead">At a glance</p>${glanceBlock(true)}
      <p class="subhead" style="margin-top:36px">Look closer <span class="hintnote">each detail opens to its images and notes</span></p>
      <div class="details" style="margin-top:0">${details.map((d, i) => detailEditCard(d, i)).join('')}</div>
      <button class="btn ghost addrow" data-act="add" data-list="details">Add a detail</button>
      ${alsoBlock(true)}`;
  }

  function alsoBlock(edit) {
    const pins = (S.brief.alsoLike || []).map(pinById).filter(Boolean);
    if (!pins.length) return edit ? `<p class="subhead" style="margin-top:48px">Other things we like</p><p class="emptynote">Add pins with “Other things we like” in Sort pins.</p>` : '';
    return `<p class="subhead" style="margin-top:48px">Other things we like</p><div class="also">${pins.map(p => `<figure class="g">${img(p)}${
      edit ? `<button class="icon" data-act="also-toggle" data-id="${p.id}" aria-label="Remove">×</button>` : ''}</figure>`).join('')}</div>`;
  }

  function themeCard(d, i) {
    const pins = (d.pins || []).map(pinById).filter(Boolean);
    return `<button class="theme" data-act="theme" data-i="${i}">
      <span class="cover">${pins[0] ? img(pins[0]) : ''}</span>
      <span class="tag">${pins.length} image${pins.length === 1 ? '' : 's'}</span>
      <span class="ttl">${esc(d.title)}</span>
      ${d.detail ? `<span class="sub">${esc(d.detail)}</span>` : ''}
      <span class="go">Look closer →</span></button>`;
  }

  function detailEditCard(d, i) {
    const pins = (d.pins || []).map(pinById).filter(Boolean);
    const thumbs = pins.map(p => `<div class="t">${img(p)}<button class="icon" data-act="unpin-detail" data-i="${i}" data-id="${p.id}" aria-label="Remove image from this detail">×</button></div>`).join('');
    const empties = Array.from({ length: Math.max(0, 3 - pins.length) }, () => `<div class="empty">Add examples from Sort pins</div>`).join('');
    return `<div class="detail-card"><div class="thumbs">${thumbs}${empties}</div>${input(`brief.details.${i}.title`, d.title, 'h3', 'Name the detail')}${
      area(`brief.details.${i}.detail`, d.detail, '', 'One line, shown on the card')}${area(`brief.details.${i}.notes`, d.notes, 'sm', 'Longer notes, shown when someone opens it')}
      <button class="linkbtn" data-act="rm" data-list="details" data-i="${i}">Remove detail</button></div>`;
  }

  function renderTheme() {
    const details = S.brief.details || [];
    const d = details[themeOpen];
    if (!d) return '';
    const pins = (d.pins || []).map(pinById).filter(Boolean);
    const n = details.length;
    return `<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(d.title)}" data-act="theme-backdrop">
      <div class="sheet-panel">
        <div class="sheet-top"><span class="tag">Style · ${themeOpen + 1} of ${n}</span><button class="icon" data-act="theme-close" aria-label="Close">×</button></div>
        <h2>${esc(d.title)}</h2>
        ${d.detail ? `<p class="lede">${esc(d.detail)}</p>` : ''}
        ${(d.notes || '').trim() ? `<div class="prose">${paras(d.notes)}</div>` : ''}
        ${pins.length ? `<div class="insp" style="margin-top:28px">${pins.map(captioned).join('')}</div>` : ''}
        <div class="sheet-nav">${themeOpen > 0 ? `<button class="btn ghost" data-act="theme-nav" data-d="-1">← ${esc(details[themeOpen - 1].title)}</button>` : '<span></span>'}${
          themeOpen < n - 1 ? `<button class="btn ghost" data-act="theme-nav" data-d="1">${esc(details[themeOpen + 1].title)} →</button>` : ''}</div>
      </div></div>`;
  }

  function materialsBlock() {
    const mats = S.brief.materials || [];
    if (!E() && !mats.length) return '';
    const cards = mats.map((m, i) => {
      const sw = `<div class="sw sw-${esc(m.swatch)} ${SHAPE[m.swatch] || ''}" role="img" aria-label="${esc(SWATCHES[m.swatch] || m.swatch)} sample"></div>`;
      if (!E()) return `<div class="sample">${sw}<div class="meta"><span class="tag">${esc(m.code)}${m.link ? ' · Selected' : ''}</span><span class="name">${esc(m.name)}</span><span class="use">${esc(m.use)}</span>${
        m.link ? `<a class="use prodlink" href="${esc(m.link)}" target="_blank" rel="noopener">View product ↗</a>` : ''}</div></div>`;
      return `<div class="sample">${sw}<div class="meta">${input(`brief.materials.${i}.code`, m.code, 'sm', 'Code')}${input(`brief.materials.${i}.name`, m.name, 'sm', 'Material')}${input(`brief.materials.${i}.use`, m.use, 'sm', 'Where it goes')}${input(`brief.materials.${i}.link`, m.link || '', 'sm', 'Product link (optional)')}
        <select class="f sm" data-path="brief.materials.${i}.swatch" aria-label="Swatch">${Object.entries(SWATCHES).map(([k, v]) => `<option value="${k}" ${k === m.swatch ? 'selected' : ''}>${v}</option>`).join('')}</select>
        <button class="linkbtn rm" data-act="rm" data-list="materials" data-i="${i}">Remove</button></div></div>`;
    }).join('');
    return `<div class="flatlay ${mats.length % 4 && mats.length % 3 === 0 ? 'c3' : ''}">${cards}</div>${E() ? `<button class="btn ghost addrow" data-act="add" data-list="materials">Add a material</button>` : ''}`;
  }

  function inspirationBlock() {
    const loved = S.pins.filter(p => p.status === 'love');
    if (!loved.length) return E() ? `<p class="emptynote">Pins you mark Love in Sort pins appear here with your notes.</p>` : '';
    const groups = new Map();
    ROOMS.concat(['Other']).forEach(r => groups.set(r, []));
    loved.forEach(p => groups.get((p.rooms && p.rooms[0]) || 'Other').push(p));
    const rooms = [...groups].filter(([, ps]) => ps.length);
    const shown = roomOpen === '__all' ? loved : roomOpen ? (groups.get(roomOpen) || []) : [];
    return `<div class="chips roomchips"><button class="chip" data-act="room-open" data-room="__all" aria-pressed="${roomOpen === '__all'}">All<span class="n">${loved.length}</span></button>${
      rooms.map(([r, ps]) => `<button class="chip" data-act="room-open" data-room="${esc(r)}" aria-pressed="${roomOpen === r}">${esc(r)}<span class="n">${ps.length}</span></button>`).join('')}</div>
      ${shown.length ? `<div class="insp" style="margin-top:24px">${shown.map(captioned).join('')}</div>` : ''}`;
  }

  function renderBrief() {
    const b = S.brief;
    const sections = [
      ['overview', 'The project', 'The house and the job at a glance', factsBlock()],
      ['approach', 'Approach', 'How we want the changes to feel', E() ? area('brief.philosophy', b.philosophy, '', 'Your design philosophy for the house') : (b.philosophy || '').trim() ? `<div class="prose">${paras(b.philosophy)}</div>` : ''],
      ['priorities', 'Must-haves', 'In order of importance', listBlock('priorities', 'num', 'Add a must-have', 'e.g. A kitchen that seats six', 'Why it matters, constraints, what success looks like')],
      ['stretch', 'Stretch goals', 'If budget and timing allow', listBlock('stretch', 'open', 'Add a stretch goal', 'e.g. Heated floors in the entry', 'Optional detail')],
      ['avoid', 'Not for us', 'Please steer away from', listBlock('avoid', 'x', 'Add something to avoid', 'e.g. Glossy finishes', 'Optional detail')],
      ['style', 'Style', 'The look we are after', styleBlock()],
      ['inspiration', 'All images', 'Everything we saved, by room, with notes', inspirationBlock()],
      ['contact', 'Contact', 'How to reach us', E() ? area('brief.contact', b.contact, '', 'Names, email, phone, best times to reach you') : (b.contact || '').trim() ? `<div class="prose">${paras(b.contact)}</div>` : '']
    ].filter(s => s[3]);

    const hero = E()
      ? `${input('brief.eyebrow', b.eyebrow, 'label', 'Small heading')}<h1>${area('brief.title', b.title, 'h1', 'Title')}</h1><div class="intro">${area('brief.intro', b.intro, '', 'A short welcome for the designers and contractors you are meeting')}</div>`
      : `<p class="eyebrow">${esc(b.eyebrow)}</p><h1>${esc(b.title)}</h1>${(b.intro || '').trim() ? `<div class="intro">${paras(b.intro)}</div>` : ''}`;

    const note = E() && b.drafted
      ? `<div class="banner">Claude drafted the style details and questions from your Pinterest board. Edit anything. Empty sections stay hidden from designers and contractors. Turn on <em>Preview as contractor</em> to see their view. <button class="linkbtn" data-act="dismiss-draft">Dismiss</button></div>`
      : '';

    const updated = S.updated ? new Date(S.updated).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : '';
    return `<header class="hero wrap">${hero}${note}<nav class="nav" aria-label="Sections">${sections.map(s => `<a href="#${s[0]}">${esc(s[1])}</a>`).join('')}</nav></header>
      <main class="wrap">${sections.map(([id, label, sub, html]) => `<section class="section" id="${id}"><div class="label"><h2>${esc(label)}</h2><p>${esc(sub)}</p></div><div>${html}</div></section>`).join('')}
      <footer class="footer"><span>${esc(b.title)}</span><span>${updated ? 'Updated ' + esc(updated) : ''}</span></footer></main>`;
  }

  // ---------- pin sorter ----------
  function counts() {
    const c = { all: S.pins.length, unsorted: 0, love: 0, maybe: 0, cut: 0 };
    S.pins.forEach(p => { c[p.status || 'unsorted']++; });
    return c;
  }
  function filteredPins() {
    return S.pins.filter(p => (filter === 'all' || (p.status || 'unsorted') === filter) &&
      (roomFilter === 'all' || (roomFilter === 'none' ? !(p.rooms || []).length : (p.rooms || []).includes(roomFilter))));
  }
  function statusButtons(p, withKeys) {
    return `<div class="stbtns">${STATUSES.map(([k, label, key]) => `<button class="st ${k}" data-act="status" data-id="${p.id}" data-st="${k}" aria-pressed="${p.status === k}">${label}${withKeys ? `<kbd>${key}</kbd>` : ''}</button>`).join('')}</div>`;
  }

  function keyChip(p) {
    const keys = S.brief.keyPins || [];
    const on = keys.includes(p.id);
    const full = !on && keys.length >= KEY_MAX;
    return `<button class="chip" data-act="key-toggle" data-id="${p.id}" aria-pressed="${on}" ${full ? `disabled title="Already ${KEY_MAX} images at a glance"` : ''}>At a glance</button>`;
  }

  function alsoChip(p) {
    return `<button class="chip" data-act="also-toggle" data-id="${p.id}" aria-pressed="${(S.brief.alsoLike || []).includes(p.id)}">Other things we like</button>`;
  }

  function renderPins() {
    const c = counts();
    const list = filteredPins();
    const sorted = c.all - c.unsorted;
    const segs = [['unsorted', 'To sort'], ['love', 'Love'], ['maybe', 'Maybe'], ['cut', 'Cut'], ['all', 'All']];
    return `<div class="sorter wrap">
      <div class="sorter-head"><div><h1>Sort the board</h1><p>Mark each pin Love, Maybe or Cut and note what you like about it. Pins marked Love appear in the brief with your notes. Maybe and Cut stay private.</p></div>
      <span class="spacer" style="flex:1"></span><button class="btn" data-act="focus-start" ${list.length ? '' : 'disabled'}>Sort one at a time</button></div>
      <div class="progress" aria-label="${sorted} of ${c.all} sorted"><div style="width:${c.all ? (sorted / c.all) * 100 : 0}%"></div></div>
      <div class="filters"><div class="seg" role="group" aria-label="Filter by status">${segs.map(([k, l]) => `<button data-act="filter" data-f="${k}" aria-pressed="${filter === k}">${l}<span class="n">${c[k]}</span></button>`).join('')}</div>
      <select class="plain" data-act="room" aria-label="Filter by room"><option value="all">All rooms</option>${ROOMS.map(r => `<option ${roomFilter === r ? 'selected' : ''}>${esc(r)}</option>`).join('')}<option value="none" ${roomFilter === 'none' ? 'selected' : ''}>No room tagged</option></select>
      <span class="status-note">${sorted} of ${c.all} sorted</span></div>
      ${list.length ? `<div class="grid">${list.map(pinCard).join('')}</div>` : `<p class="nopins">${filter === 'unsorted' ? 'Every pin is sorted. Check the Love filter to review what goes in the brief.' : 'No pins match these filters.'}</p>`}
    </div>`;
  }

  function pinCard(p) {
    const i = pinIndex(p.id);
    return `<article class="card s-${p.status || 'none'}">
      <button class="imgbtn" data-act="focus-pin" data-id="${p.id}" aria-label="Open larger">${p.dup ? '<span class="badge">Possible duplicate</span>' : ''}${img(p)}</button>
      <div class="body">${statusButtons(p)}<div class="cardrow"><span class="rooms">${esc((p.rooms || []).join(' · ') || 'No room tagged')}</span>${keyChip(p)}</div>${area(`pins.${i}.like`, p.like, '', 'What do we like about it?')}</div></article>`;
  }

  function renderFocus() {
    lockScroll();
    if (!focus) { focusEl.innerHTML = themeOpen != null ? renderTheme() : ''; return; }
    const id = focus.ids[focus.i];
    const p = pinById(id);
    const i = pinIndex(id);
    const details = S.brief.details || [];
    focusEl.innerHTML = `<div class="focus" role="dialog" aria-modal="true" aria-label="Sort pin">
      <div class="stage">${focus.i > 0 ? `<button class="arrow prev" data-act="fnav" data-d="-1" aria-label="Previous pin">‹</button>` : ''}<img src="${esc(p.src)}" alt="${esc(pinAlt(p))}">${focus.i < focus.ids.length - 1 ? `<button class="arrow next" data-act="fnav" data-d="1" aria-label="Next pin">›</button>` : ''}</div>
      <div class="panel">
        <div class="top"><span>${focus.i + 1} of ${focus.ids.length}</span><button class="icon" data-act="focus-close" aria-label="Close">×</button></div>
        ${p.title ? `<h2>${esc(p.title)}</h2>` : ''}${p.dup ? '<p class="emptynote" style="margin:0">This looks like a duplicate of another pin.</p>' : ''}
        ${statusButtons(p, true)}
        <div><label>Room</label><div class="chips">${ROOMS.map(r => `<button class="chip" data-act="room-toggle" data-id="${p.id}" data-room="${esc(r)}" aria-pressed="${(p.rooms || []).includes(r)}">${esc(r)}</button>`).join('')}</div></div>
        <div><label>Brief</label><div class="chips">${keyChip(p)}${alsoChip(p)}</div></div>
        <div><label for="f-like">What we like</label><textarea id="f-like" class="f" data-path="pins.${i}.like" placeholder="The walnut grain, the way the counter wraps the wall…">${esc(p.like)}</textarea></div>
        <div><label for="f-dislike">What we would leave out</label><textarea id="f-dislike" class="f" data-path="pins.${i}.dislike" placeholder="Optional">${esc(p.dislike)}</textarea></div>
        ${details.length ? `<div><label>Use as an example of</label><div class="chips">${details.map((d, di) => `<button class="chip" data-act="detail-toggle" data-id="${p.id}" data-i="${di}" aria-pressed="${(d.pins || []).includes(p.id)}">${esc(d.title || 'Untitled detail')}</button>`).join('')}</div></div>` : ''}
        <div class="nav2"><a href="${esc(p.link)}" target="_blank" rel="noopener">${/pinterest\./.test(p.link) ? 'Open on Pinterest' : /instagram\./.test(p.link) ? 'Open on Instagram' : 'View product'} ↗</a></div>
        <p class="hint">Keys: 1 Love · 2 Maybe · 3 Cut · ← → move · Esc close. Setting a status moves to the next pin.</p>
      </div></div>`;
    focusEl.querySelectorAll('textarea.f').forEach(autosize);
  }

  // ---------- lightbox ----------
  const LB_SELECTOR = '.glance img, .also img, .insp img';
  let lbEl = null;
  function lockScroll() {
    document.documentElement.style.overflow = focus || themeOpen != null || lightbox ? 'hidden' : '';
  }
  function openLightbox(imgEl) {
    const group = imgEl.closest('.glance, .also, .insp');
    const imgs = [...group.querySelectorAll('img')];
    lightbox = {
      items: imgs.map(im => {
        const cap = im.closest('figure') && im.closest('figure').querySelector('figcaption');
        return { src: im.getAttribute('src'), alt: im.alt, caption: cap ? cap.textContent : '' };
      }),
      i: Math.max(0, imgs.indexOf(imgEl))
    };
    renderLightbox();
  }
  function closeLightbox() { lightbox = null; renderLightbox(); }
  function moveLightbox(d) {
    if (!lightbox) return;
    lightbox.i = (lightbox.i + d + lightbox.items.length) % lightbox.items.length;
    renderLightbox();
  }
  function renderLightbox() {
    if (!lightbox) { if (lbEl) { lbEl.remove(); lbEl = null; } lockScroll(); return; }
    if (!lbEl) { lbEl = document.createElement('div'); lbEl.className = 'lightbox'; lbEl.setAttribute('role', 'dialog'); lbEl.setAttribute('aria-modal', 'true'); lbEl.setAttribute('aria-label', 'Image viewer'); document.body.appendChild(lbEl); }
    const it = lightbox.items[lightbox.i];
    const many = lightbox.items.length > 1;
    lbEl.innerHTML = `<button class="lb-close" data-act="lb-close" aria-label="Close">×</button>
      ${many ? `<button class="lb-arrow prev" data-act="lb-nav" data-d="-1" aria-label="Previous image">‹</button><button class="lb-arrow next" data-act="lb-nav" data-d="1" aria-label="Next image">›</button>` : ''}
      <figure class="lb-fig" data-act="lb-close"><img src="${esc(it.src)}" alt="${esc(it.alt)}">
      ${it.caption || many ? `<figcaption>${esc(it.caption)}${many ? `<span class="lb-count">${lightbox.i + 1} / ${lightbox.items.length}</span>` : ''}</figcaption>` : ''}</figure>`;
    lockScroll();
    const btn = lbEl.querySelector('.lb-close'); if (btn) btn.focus();
  }

  // ---------- shell ----------
  function renderBar() {
    if (!canEdit) return '';
    const c = counts();
    return `<div class="editbar"><div class="wrap"><div class="tabs" role="tablist">
      <button class="tab" role="tab" data-act="view" data-v="brief" aria-selected="${view === 'brief'}">Brief</button>
      <button class="tab" role="tab" data-act="view" data-v="pins" aria-selected="${view === 'pins'}">Sort pins<span class="n">${c.unsorted} to sort</span></button></div>
      <span class="spacer"></span>
      ${view === 'brief' ? `<label class="toggle"><input type="checkbox" id="preview-toggle" data-act="preview" ${preview ? 'checked' : ''}> Preview as contractor</label>` : ''}
      <span class="status-note">Only people with edit access see this bar</span></div></div>
      ${staleDraft ? `<div class="wrap"><div class="banner">You have unsaved edits from an older version of this page. <button class="linkbtn" data-act="restore-stale">Restore them</button> · <button class="linkbtn" data-act="drop-stale">Discard</button></div></div>` : ''}
      ${restored ? `<div class="wrap"><div class="banner">Restored your unsaved edits from last time.</div></div>` : ''}`;
  }

  function renderSaveBar() {
    let el = document.getElementById('savebar');
    const show = canEdit && (dirty() || saveError);
    if (!show) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement('div'); el.id = 'savebar'; el.className = 'savebar'; document.body.appendChild(el); }
    el.innerHTML = saveError
      ? `<span>${esc(saveError)}</span><button class="btn" data-act="dismiss-error">OK</button>`
      : `<span>${saving ? 'Saving…' : 'Unsaved changes'}</span>${saving ? '' : '<button class="linkbtn" data-act="discard">Discard</button>'}<button class="btn" data-act="save" ${saving ? 'disabled' : ''}>Save</button>`;
  }

  function render() {
    appEl.innerHTML = renderBar() + (view === 'pins' && canEdit ? renderPins() : renderBrief());
    appEl.querySelectorAll('textarea.f').forEach(autosize);
    renderFocus();
    renderSaveBar();
  }

  // ---------- state changes ----------
  let draftTimer = null;
  function changed() {
    clearTimeout(draftTimer);
    draftTimer = setTimeout(() => {
      if (dirty()) store.set(DRAFT_KEY, { base: S.rev, state: S });
      else store.del(DRAFT_KEY);
    }, 300);
    renderSaveBar();
  }

  function newItem(list) {
    if (list === 'facts') return { label: '', value: '' };
    if (list === 'details') return { title: '', detail: '', pins: [] };
    if (list === 'materials') return { code: '', name: '', use: '', swatch: 'plaster' };
    return { title: '', detail: '' };
  }

  function setStatus(id, st) {
    const p = pinById(id);
    p.status = p.status === st ? '' : st;
    changed();
    return p.status;
  }

  function openFocus(startId) {
    const ids = filteredPins().map(p => p.id);
    if (!ids.length) return;
    const i = startId ? Math.max(0, ids.indexOf(startId)) : 0;
    focus = { ids, i };
    renderFocus();
  }
  function moveFocus(d) {
    if (!focus) return;
    focus.i = Math.min(focus.ids.length - 1, Math.max(0, focus.i + d));
    renderFocus();
  }
  function closeFocus() { focus = null; render(); }

  function savePrefs() { store.set(PREF_KEY, { view, filter, roomFilter }); }

  document.addEventListener('input', e => {
    const t = e.target;
    if (!t.matches('[data-path]')) return;
    if (t.tagName === 'TEXTAREA') autosize(t);
    const path = t.dataset.path;
    if (path === 'brief.styleWordsText') S.brief.styleWords = t.value.split(',').map(s => s.trim()).filter(Boolean);
    else setPath(path, t.value);
    changed();
  });

  document.addEventListener('change', e => {
    const t = e.target;
    if (t.matches('select[data-path]')) { render(); return; }
    if (t.dataset.act === 'room') { roomFilter = t.value; savePrefs(); render(); }
    if (t.dataset.act === 'preview') { preview = t.checked; render(); window.scrollTo(0, 0); }
  });

  document.addEventListener('click', e => {
    if (lightbox) {
      const lb = e.target.closest('[data-act^="lb-"]');
      if (lb && lb.dataset.act === 'lb-nav') moveLightbox(+lb.dataset.d);
      else if ((lb && (e.target === lb || lb.tagName === 'BUTTON')) || e.target === lbEl) closeLightbox();
      return;
    }
    const pic = e.target.closest(LB_SELECTOR);
    if (pic && !e.target.closest('button')) { e.preventDefault(); openLightbox(pic); return; }
    const b = e.target.closest('[data-act]');
    if (!b || b.tagName === 'SELECT' || b.tagName === 'INPUT') return;
    const a = b.dataset.act;
    const list = b.dataset.list;
    const i = +b.dataset.i;
    switch (a) {
      case 'view': view = b.dataset.v; preview = false; savePrefs(); render(); window.scrollTo(0, 0); break;
      case 'add': (S.brief[list] = S.brief[list] || []).push(newItem(list)); changed(); render();
        { const rows = appEl.querySelectorAll(`[data-path^="brief.${list}.${S.brief[list].length - 1}."]`); if (rows[0]) rows[0].focus(); } break;
      case 'rm': S.brief[list].splice(i, 1); changed(); render(); break;
      case 'move': { const arr = S.brief[list]; const j = i + +b.dataset.d; [arr[i], arr[j]] = [arr[j], arr[i]]; changed(); render(); break; }
      case 'unpin-detail': { const d = S.brief.details[i]; d.pins = d.pins.filter(x => x !== b.dataset.id); changed(); render(); break; }
      case 'dismiss-draft': S.brief.drafted = false; changed(); render(); break;
      case 'filter': filter = b.dataset.f; savePrefs(); render(); break;
      case 'status': {
        const st = setStatus(b.dataset.id, b.dataset.st);
        if (focus) { renderFocus(); if (st) setTimeout(() => moveFocus(1), 180); } else render();
        break;
      }
      case 'focus-start': openFocus(); break;
      case 'focus-pin': openFocus(b.dataset.id); break;
      case 'focus-close': closeFocus(); break;
      case 'fnav': moveFocus(+b.dataset.d); break;
      case 'room-toggle': {
        const p = pinById(b.dataset.id); const r = b.dataset.room; p.rooms = p.rooms || [];
        p.rooms = p.rooms.includes(r) ? p.rooms.filter(x => x !== r) : p.rooms.concat(r);
        changed(); renderFocus(); break;
      }
      case 'detail-toggle': {
        const d = S.brief.details[i]; const id = b.dataset.id; d.pins = d.pins || [];
        d.pins = d.pins.includes(id) ? d.pins.filter(x => x !== id) : d.pins.concat(id);
        changed(); renderFocus(); break;
      }
      case 'key-toggle': {
        const keys = S.brief.keyPins = S.brief.keyPins || []; const id = b.dataset.id;
        S.brief.keyPins = keys.includes(id) ? keys.filter(x => x !== id) : keys.length < KEY_MAX ? keys.concat(id) : keys;
        changed(); if (focus) renderFocus(); else render(); break;
      }
      case 'also-toggle': {
        const list = S.brief.alsoLike || []; const id = b.dataset.id;
        S.brief.alsoLike = list.includes(id) ? list.filter(x => x !== id) : list.concat(id);
        changed(); if (focus) renderFocus(); else render(); break;
      }
      case 'theme': themeOpen = i; renderFocus(); break;
      case 'theme-close': themeOpen = null; renderFocus(); break;
      case 'theme-backdrop': if (e.target === b) { themeOpen = null; renderFocus(); } break;
      case 'theme-nav': themeOpen += +b.dataset.d; renderFocus(); focusEl.querySelector('.sheet').scrollTop = 0; break;
      case 'room-open': roomOpen = roomOpen === b.dataset.room ? null : b.dataset.room; render(); break;
      case 'save': save(); break;
      case 'discard': S = JSON.parse(savedJSON); store.del(DRAFT_KEY); focus = null; render(); break;
      case 'dismiss-error': saveError = ''; renderSaveBar(); break;
      case 'restore-stale': S = staleDraft.state; S.rev = JSON.parse(savedJSON).rev; staleDraft = null; changed(); render(); break;
      case 'drop-stale': staleDraft = null; store.del(DRAFT_KEY); render(); break;
    }
  });

  document.addEventListener('keydown', e => {
    if (lightbox) {
      if (e.key === 'Escape') { e.preventDefault(); closeLightbox(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); moveLightbox(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); moveLightbox(-1); }
      return;
    }
    if (!focus && themeOpen != null && e.key === 'Escape') { themeOpen = null; renderFocus(); return; }
    if (!focus) return;
    const typing = /^(TEXTAREA|INPUT|SELECT)$/.test(e.target.tagName);
    if (e.key === 'Escape') { if (typing) e.target.blur(); else closeFocus(); return; }
    if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
    const id = focus.ids[focus.i];
    const map = { '1': 'love', l: 'love', '2': 'maybe', m: 'maybe', '3': 'cut', x: 'cut' };
    if (map[e.key]) { e.preventDefault(); const st = setStatus(id, map[e.key]); renderFocus(); if (st) setTimeout(() => moveFocus(1), 180); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); moveFocus(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); moveFocus(-1); }
  });

  // ---------- saving ----------
  function buildDoc(state) {
    const json = JSON.stringify(state).replace(/</g, '\\u003c').replace(new RegExp('\\u2028', 'g'), '\\u2028').replace(new RegExp('\\u2029', 'g'), '\\u2029');
    return '<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>' + RESET + '</style></head><body>' +
      PAGE_HEAD + '<div id="app"></div><div id="focus-root"></div><script type="application/json" id="state">' + json + '</' + 'script><script src="app.js"></' + 'script></body></html>';
  }

  async function save() {
    if (!artifactNs || saving) return;
    saving = true; saveError = ''; renderSaveBar();
    const next = JSON.parse(JSON.stringify(S));
    next.rev = (S.rev || 0) + 1;
    next.updated = new Date().toISOString();
    store.set(DRAFT_KEY, { base: S.rev, savingAs: next.rev, state: S });
    try {
      await artifactNs.publish(buildDoc(next));
      // The viewer reloads every open view to the new version.
    } catch (err) {
      saving = false;
      const code = err && err.code;
      if (code === 'conflict') saveError = 'Someone saved a newer version. The page is reloading to it, and your edits are kept in this browser.';
      else if (['not_writer', 'not_granted', 'not_declared', 'capability_disabled', 'capability_removed', 'consent_required'].includes(code)) saveError = 'This view can’t save changes. Open the brief from your own Claude account to edit it.';
      else if (code === 'rate_limited') saveError = 'Saving too often. Wait a minute, then save again.';
      else if (code === 'too_large') saveError = 'The page is too large to save. Cut some pins or shorten notes, then try again.';
      else saveError = 'Saving didn’t go through. Try again in a moment.';
      renderSaveBar();
    }
  }

  // ---------- boot ----------
  function loadDraft() {
    const d = store.get(DRAFT_KEY);
    if (!d || !d.state) return;
    if (d.savingAs && d.savingAs === S.rev) { store.del(DRAFT_KEY); return; }
    if (d.base === S.rev) { S = d.state; restored = dirty(); if (!restored) store.del(DRAFT_KEY); return; }
    staleDraft = d;
  }

  async function initCaps() {
    const c = window.claude;
    if (!c || typeof c.use !== 'function') return;
    try {
      const [user, art] = await Promise.all([c.use('user'), c.use('artifact')]);
      artifactNs = art;
      canEdit = !!(user && art && await user.canEdit());
    } catch (e) { canEdit = false; }
    if (!canEdit) return;
    const prefs = store.get(PREF_KEY) || {};
    view = prefs.view === 'pins' ? 'pins' : 'brief';
    filter = prefs.filter || 'unsorted';
    roomFilter = prefs.roomFilter || 'all';
    loadDraft();
    render();
  }

  window.addEventListener('beforeunload', e => { if (canEdit && dirty() && !saving) { e.preventDefault(); e.returnValue = ''; } });

  render();
  initCaps();
})();
