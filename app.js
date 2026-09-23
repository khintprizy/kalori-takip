'use strict';
(() => {
  const CFG = window.APP_CONFIG || {};

  const DEFAULT_TARGETS = {
    spor: { kcalMin: 2000, kcalMax: 2100, pMin: 115, pMax: 145 },
    dinlenme: { kcalMin: 1800, kcalMax: 1900, pMin: 115, pMax: 145 },
  };

  // [ad, porsiyon, porsiyon gramı (gramla ekleme için), kcal, protein, karb, yağ]
  const STARTER = [
    ['Yumurta', '1 adet', null, 70, 6, 0.5, 5],
    ['Tam buğday ekmek', '1 dilim', null, 80, 3, 14, 1],
    ['Süzme peynir', '100 g', 100, 150, 12, 3, 10],
    ['Süzme yoğurt', '200 g', 200, 120, 18, 8, 1],
    ['Şek protein quark', '1 kutu', null, 120, 20, 8, 1],
    ['Whey protein', '1 ölçek', null, 125, 24, 3, 2],
    ['Pınar protein süt', '500 ml', 500, 235, 26, 29, 1.5],
    ['Haşlanmış nohut', '1 kase (200 g)', 200, 270, 14, 40, 5],
    ['Mercimek çorbası', '1 kase', null, 200, 10, 28, 5],
    ['Zeytinyağı', '1 yemek kaşığı', null, 120, 0, 0, 14],
    ['Ceviz / kaju', '20 g', 20, 125, 4, 4, 11],
    ['Muz', '1 adet', null, 100, 1, 25, 0],
    ['Sebze tabağı', 'salatalık + kapya + havuç', null, 90, 3, 18, 0],
    ['Tavuk göğsü', '150 g', 150, 180, 35, 0, 4],
  ];

  const TABLES = ['settings', 'foods', 'meals', 'days', 'entries'];
  const CONFLICT = { settings: 'user_id', days: 'user_id,date', foods: 'id', meals: 'id', entries: 'id' };
  const COLS = {
    settings: ['targets', 'updated_at'],
    foods: ['id', 'name', 'portion', 'grams', 'kcal', 'protein', 'carb', 'fat', 'sort', 'created_at'],
    meals: ['id', 'name', 'items', 'created_at'],
    days: ['date', 'day_type'],
    entries: ['id', 'date', 'food_id', 'name', 'qty', 'qty_label', 'kcal', 'protein', 'carb', 'fat', 'created_at'],
  };
  const keyOf = (table, row) => table === 'settings' ? 'settings' : table === 'days' ? row.date : row.id;

  // ---------- yardımcılar ----------
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nf0 = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 });
  const f0 = (n) => nf0.format(n || 0);
  const f1 = (n) => nf1.format(n || 0);
  const r1 = (n) => Math.round((n || 0) * 10) / 10;
  const num = (s) => { const v = parseFloat(String(s ?? '').trim().replace(',', '.')); return Number.isFinite(v) ? v : NaN; };
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID()
    : '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) => (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)));
  const nowIso = () => new Date().toISOString();

  const pad = (n) => String(n).padStart(2, '0');
  const dateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const todayStr = () => dateStr(new Date());
  const toDate = (s) => new Date(s + 'T12:00:00');
  const addDays = (s, n) => { const d = toDate(s); d.setDate(d.getDate() + n); return dateStr(d); };
  const fmtLong = (s) => toDate(s).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
  const fmtWeekday = (s) => toDate(s).toLocaleDateString('tr-TR', { weekday: 'long' });
  const fmtShort = (s) => toDate(s).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', weekday: 'short' });

  const LS = {
    get(k, def) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { console.warn(e); } },
    del(k) { try { localStorage.removeItem(k); } catch { /* yok say */ } },
  };

  // ---------- durum ----------
  let sb = null;
  let user = null;
  let S = emptyState();
  let queue = [];
  let tab = 'today';
  let curDate = todayStr();
  let lastToday = curDate;
  let editMode = false;
  let syncing = false, syncAgain = false, syncErr = '', needLogin = false, loginVisible = false;
  let syncTimer = null;
  let sheetCtx = null;
  let login = { email: '', sent: false, msg: '' };

  function emptyState() { return { settings: null, foods: [], meals: [], days: [], entries: [] }; }
  const dataKey = () => 'kt:data:' + user.id;
  const queueKey = () => 'kt:queue:' + user.id;
  function persist() { LS.set(dataKey(), S); LS.set(queueKey(), queue); }

  // ---------- veri işlemleri (önce yerel, sonra senkron) ----------
  function applyOp(state, op) {
    if (op.table === 'settings') { if (op.op === 'upsert') state.settings = op.row; return; }
    const arr = state[op.table];
    const id = op.op === 'upsert' ? keyOf(op.table, op.row) : op.id;
    const i = arr.findIndex((r) => keyOf(op.table, r) === id);
    if (op.op === 'upsert') { if (i >= 0) arr[i] = op.row; else arr.push(op.row); }
    else if (i >= 0) arr.splice(i, 1);
  }
  const up = (table, row) => ({ table, op: 'upsert', row });
  const del = (table, id) => ({ table, op: 'delete', id });

  function commit(ops) {
    for (const op of ops) {
      if (op.op === 'upsert') op.row = { ...op.row, user_id: user.id };
      applyOp(S, op);
      queue.push(op);
    }
    persist();
    render();
    scheduleSync();
  }

  function scheduleSync() { clearTimeout(syncTimer); syncTimer = setTimeout(sync, 400); }

  // Kalıcı (tekrar denense de düzelmeyecek) veritabanı hataları; bunlar kuyruktan atılır.
  const isPermanent = (err) => !!err && typeof err.code === 'string' && (/^[0-9A-Z]{5}$/.test(err.code) || /^PGRST[12]/.test(err.code));

  async function flush() {
    while (queue.length) {
      const first = queue[0];
      let n = 1;
      if (first.op === 'upsert') {
        while (n < queue.length && n < 500 && queue[n].op === 'upsert' && queue[n].table === first.table) n++;
      }
      const batch = queue.slice(0, n);
      let res;
      if (first.op === 'upsert') {
        const rows = new Map();
        batch.forEach((o) => rows.set(keyOf(o.table, o.row), o.row));
        res = await sb.from(first.table).upsert([...rows.values()], { onConflict: CONFLICT[first.table] });
      } else {
        res = await sb.from(first.table).delete().eq('id', first.id);
      }
      if (res.error) {
        if (!isPermanent(res.error)) throw res.error;
        console.warn('Sunucu kaydı reddetti, atlanıyor:', res.error, batch);
        toast('Bir değişiklik sunucuya yazılamadı: ' + res.error.message);
      }
      queue.splice(0, n);
      LS.set(queueKey(), queue);
    }
  }

  async function fetchAll(table, order) {
    const out = [];
    const size = 1000;
    for (let from = 0; ; from += size) {
      let q = sb.from(table).select('*');
      order.forEach((c) => { q = q.order(c); });
      const { data, error } = await q.range(from, from + size - 1);
      if (error) throw error;
      out.push(...data);
      if (data.length < size) break;
    }
    return out;
  }

  async function pullAll() {
    const st = await sb.from('settings').select('*').maybeSingle();
    if (st.error) throw st.error;
    const [foods, meals, days, entries] = await Promise.all([
      fetchAll('foods', ['sort', 'created_at', 'id']),
      fetchAll('meals', ['created_at', 'id']),
      fetchAll('days', ['date']),
      fetchAll('entries', ['date', 'created_at', 'id']),
    ]);
    return { settings: st.data, foods, meals, days, entries };
  }

  async function sync() {
    if (!user || !sb || !navigator.onLine) return setStatus();
    if (syncing) { syncAgain = true; return; }
    syncing = true;
    setStatus();
    const before = JSON.stringify(S);
    let seeded = false;
    try {
      const { data: { session } } = await sb.auth.getSession();
      if (!session || session.user.id !== user.id) { needLogin = true; throw new Error('Oturum yok'); }
      needLogin = false;
      await flush();
      const pulled = await pullAll();
      for (const op of queue) applyOp(pulled, op); // çekme sırasında eklenenler kaybolmasın
      S = pulled;
      persist();
      syncErr = '';
      if (!S.settings && !queue.length) { seed(); seeded = true; }
    } catch (e) {
      console.warn('Senkron:', e);
      syncErr = e.message || String(e);
    }
    syncing = false;
    const active = document.activeElement;
    const typing = active && active.tagName === 'INPUT' && $('#app').contains(active);
    if (!seeded && JSON.stringify(S) !== before && !typing) render();
    setStatus();
    if (syncAgain) { syncAgain = false; sync(); }
  }

  function seed() {
    const t = Date.now();
    const ops = [up('settings', { targets: DEFAULT_TARGETS, updated_at: nowIso() })];
    STARTER.forEach(([name, portion, grams, kcal, protein, carb, fat], i) => {
      ops.push(up('foods', { id: uuid(), name, portion, grams, kcal, protein, carb, fat, sort: i, created_at: new Date(t + i).toISOString() }));
    });
    commit(ops);
  }

  // ---------- hesaplamalar ----------
  const targets = () => ({ ...DEFAULT_TARGETS, ...(S.settings?.targets || {}) });
  const dayType = (date) => S.days.find((d) => d.date === date)?.day_type || 'spor';
  const entriesOn = (date) => S.entries.filter((e) => e.date === date).sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
  const sum = (list) => list.reduce((a, e) => ({ kcal: a.kcal + (+e.kcal || 0), protein: a.protein + (+e.protein || 0), carb: a.carb + (+e.carb || 0), fat: a.fat + (+e.fat || 0) }), { kcal: 0, protein: 0, carb: 0, fat: 0 });
  const foodById = (id) => S.foods.find((f) => f.id === id);
  const sortedFoods = () => [...S.foods].sort((a, b) => (a.sort - b.sort) || (a.created_at < b.created_at ? -1 : 1));
  const mealTotals = (m) => sum((m.items || []).map((it) => { const f = foodById(it.food_id); return f ? scale(f, it.qty) : {}; }));

  function scale(f, qty) {
    return { kcal: r1(f.kcal * qty), protein: r1(f.protein * qty), carb: r1(f.carb * qty), fat: r1(f.fat * qty) };
  }
  function qtyLabel(f, qty, grams) {
    if (grams) return `${f1(grams)} ${/ml/i.test(f.portion) ? 'ml' : 'g'}`;
    if (!f.portion) return `${f1(qty)} porsiyon`;
    if (qty === 1) return f.portion;
    const m = f.portion.match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/); // "1 adet" × 2 → "2 adet", "500 ml" × 0,5 → "250 ml"
    return m ? `${f1(num(m[1]) * qty)} ${m[2]}` : `${f1(qty)} × ${f.portion}`;
  }
  function makeEntry(f, qty, grams) {
    return { id: uuid(), date: curDate, food_id: f.id, name: f.name, qty: Math.round(qty * 1000) / 1000, qty_label: qtyLabel(f, qty, grams), ...scale(f, qty), created_at: nowIso() };
  }

  // ---------- görünüm ----------
  function statusInfo() {
    const n = queue.length;
    const wait = n ? ` · ${n} değişiklik bekliyor` : '';
    if (!navigator.onLine) return { cls: 'offline', text: 'Çevrimdışı' + wait };
    if (!sb) return { cls: 'pending', text: 'Sunucuya bağlanılamadı' + wait };
    if (needLogin) return { cls: 'pending', text: 'Senkron için tekrar giriş gerekli · <button class="linkbtn" data-act="relogin">Giriş yap</button>' };
    if (syncing) return { cls: 'pending', text: 'Senkronize ediliyor…' };
    if (syncErr) return { cls: 'pending', text: 'Senkron başarısız, tekrar denenecek' + wait };
    if (n) return { cls: 'pending', text: `${n} değişiklik bekliyor` };
    return { cls: '', text: 'Senkronize' };
  }
  function setStatus() {
    const el = $('#status');
    if (!el) return;
    const s = statusInfo();
    el.className = 'status ' + s.cls;
    el.innerHTML = `<span class="dot"></span>${s.text}`;
  }

  function metric(label, val, min, max, unit) {
    const top = Math.max(max * 1.15, val, 1);
    const cls = val > max ? 'over' : val >= min ? 'ok' : '';
    const note = val < min ? `${f0(min - val)} ${unit} kaldı` : val > max ? `${f0(val - max)} ${unit} fazla` : 'hedefte ✓';
    return `<div class="metric">
      <div class="row">
        <div><span class="big">${f0(val)}</span><span class="unit">${unit === 'kcal' ? 'kcal' : 'g ' + label}</span></div>
        <div class="goal">hedef ${f0(min)}–${f0(max)}<br><span class="${cls === 'ok' ? 'ok' : cls === 'over' ? 'bad' : ''}">${note}</span></div>
      </div>
      <div class="bar"><div class="band" style="left:${(min / top) * 100}%;width:${((max - min) / top) * 100}%"></div><div class="fill ${cls}" style="width:${Math.min(val / top, 1) * 100}%"></div></div>
    </div>`;
  }

  function renderToday() {
    const type = dayType(curDate);
    const t = targets()[type];
    const list = entriesOn(curDate);
    const tot = sum(list);
    const isToday = curDate === todayStr();
    const foods = sortedFoods();
    return `
    <div class="daterow">
      <button class="iconbtn" data-act="day" data-v="-1" aria-label="Önceki gün">‹</button>
      <div class="date">${isToday ? 'Bugün' : esc(fmtWeekday(curDate))}<div class="small muted">${esc(fmtLong(curDate))}</div></div>
      <button class="iconbtn" data-act="day" data-v="1" aria-label="Sonraki gün" ${isToday ? 'disabled' : ''}>›</button>
    </div>
    <div class="status" id="status"></div>
    <div class="seg">
      <button data-act="dayType" data-v="spor" class="${type === 'spor' ? 'on' : ''}">Spor günü</button>
      <button data-act="dayType" data-v="dinlenme" class="${type === 'dinlenme' ? 'on' : ''}">Dinlenme günü</button>
    </div>
    <div class="card total">
      ${metric('kcal', tot.kcal, t.kcalMin, t.kcalMax, 'kcal')}
      ${metric('protein', tot.protein, t.pMin, t.pMax, 'g')}
      <div class="macros"><div><b>${f0(tot.carb)} g</b>Karbonhidrat</div><div><b>${f0(tot.fat)} g</b>Yağ</div></div>
    </div>

    <h2>Öğünler</h2>
    <div class="chips">
      ${S.meals.map((m) => { const mt = mealTotals(m); return `<button class="chip" data-act="meal" data-id="${m.id}"><div class="n">${esc(m.name)}</div><div class="d">${f0(mt.kcal)} kcal · ${f0(mt.protein)} g protein</div></button>`; }).join('')}
      <button class="chip add" data-act="mealEdit">+ Öğün</button>
    </div>

    <h2>Yiyecekler <button class="linkbtn" data-act="toggleEdit">${editMode ? 'Bitti' : 'Düzenle'}</button></h2>
    ${editMode ? '<p class="small muted" style="margin:-4px 0 10px">Düzenlemek istediğin yiyeceğe veya öğüne dokun.</p>' : ''}
    <div class="grid">
      ${foods.map((f) => `<button class="food" data-act="food" data-id="${f.id}"><div class="n">${esc(f.name)}</div><div class="d">${esc(f.portion)}<br>${f0(f.kcal)} kcal · ${f1(f.protein)} g P</div></button>`).join('')}
      <button class="food add" data-act="foodEdit">+ Yeni yiyecek</button>
    </div>

    <h2>${isToday ? 'Bugün eklenenler' : 'Bu gün eklenenler'} <span class="small">${list.length ? list.length + ' kayıt' : ''}</span></h2>
    <div class="list">
      ${list.length ? list.slice().reverse().map((e) => `
        <div class="item">
          <div class="main"><div class="n">${esc(e.name)}</div><div class="d">${esc(e.qty_label)}</div></div>
          <div class="v"><b>${f0(e.kcal)}</b> kcal<br><span class="muted">${f1(e.protein)} g P</span></div>
          <button class="del" data-act="delEntry" data-id="${e.id}" aria-label="Sil">×</button>
        </div>`).join('') : '<div class="empty">Henüz bir şey eklenmedi.</div>'}
    </div>`;
  }

  function renderHistory() {
    const byDate = new Map();
    for (const e of S.entries) {
      const d = byDate.get(e.date) || { kcal: 0, protein: 0, n: 0 };
      d.kcal += +e.kcal || 0; d.protein += +e.protein || 0; d.n++;
      byDate.set(e.date, d);
    }
    const dates = [...byDate.keys()].sort().reverse();
    const T = targets();
    const rows = dates.map((date) => {
      const d = byDate.get(date);
      const type = dayType(date);
      const t = T[type];
      const kOk = d.kcal >= t.kcalMin && d.kcal <= t.kcalMax;
      const pOk = d.protein >= t.pMin && d.protein <= t.pMax;
      return `<button class="item" data-act="openDay" data-v="${date}">
        <div class="main"><div class="n">${esc(fmtShort(date))}${date === todayStr() ? ' <span class="tag">bugün</span>' : ''}</div>
          <div class="d">${type === 'spor' ? 'Spor günü' : 'Dinlenme günü'}</div></div>
        <div class="v"><b class="${kOk ? 'ok' : 'bad'}">${f0(d.kcal)}</b> kcal<br><span class="${pOk ? 'ok' : 'bad'}">${f0(d.protein)} g P</span></div>
        <div class="mark ${kOk && pOk ? 'ok' : 'bad'}">${kOk && pOk ? '✓' : '✗'}</div>
      </button>`;
    }).join('');
    return `
      <h2 style="margin-top:8px">Geçmiş</h2>
      <p class="small muted" style="margin:-4px 0 12px">✓ = kalori ve protein hedef aralığında. Bir güne dokunarak açıp düzenleyebilirsin.</p>
      <div class="list">${rows || '<div class="empty">Henüz kayıt yok.</div>'}</div>`;
  }

  function targetInputs(type, title) {
    const t = targets()[type];
    const inp = (k, v) => `<input id="t_${type}_${k}" inputmode="numeric" value="${v}">`;
    return `<div class="card" style="margin-bottom:10px">
      <b>${title}</b>
      <div class="two"><div><label>Kalori min</label>${inp('kcalMin', t.kcalMin)}</div><div><label>Kalori max</label>${inp('kcalMax', t.kcalMax)}</div></div>
      <div class="two"><div><label>Protein min (g)</label>${inp('pMin', t.pMin)}</div><div><label>Protein max (g)</label>${inp('pMax', t.pMax)}</div></div>
    </div>`;
  }

  function renderSettings() {
    return `
      <h2 style="margin-top:8px">Hedefler</h2>
      ${targetInputs('spor', 'Spor günü')}
      ${targetInputs('dinlenme', 'Dinlenme günü')}
      <button class="btn primary" data-act="saveTargets">Hedefleri kaydet</button>

      <h2>Senkronizasyon</h2>
      <div class="card">
        <div class="status" id="status" style="text-align:left"></div>
        <div class="btns"><button class="btn" data-act="syncNow">Şimdi senkronize et</button></div>
      </div>

      <h2>Yedek</h2>
      <div class="card">
        <div class="small muted">İçe aktarma mevcut verilerle birleştirir; aynı kayıtlar güncellenir, hiçbir şey silinmez.</div>
        <div class="btns two">
          <button class="btn" data-act="export">Dışa aktar (JSON)</button>
          <button class="btn" data-act="import">İçe aktar</button>
        </div>
        <input type="file" id="importFile" accept="application/json,.json" hidden>
      </div>

      <h2>Hesap</h2>
      <div class="card">
        <div class="small muted">Giriş yapılan e-posta</div>
        <div>${esc(user.email || '')}</div>
        <div class="btns"><button class="btn danger" data-act="logout">Çıkış yap</button></div>
      </div>`;
  }

  function render() {
    if (!user || loginVisible) return;
    const html = tab === 'today' ? renderToday() : tab === 'history' ? renderHistory() : renderSettings();
    $('#app').innerHTML = `<main class="${editMode && tab === 'today' ? 'editing' : ''}">${html}</main>`;
    document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.v === tab));
    setStatus();
  }

  // ---------- giriş ----------
  function showLogin(msg) {
    loginVisible = true;
    if (msg !== undefined) login.msg = msg;
    $('#tabs').hidden = true;
    const offline = !navigator.onLine;
    $('#app').innerHTML = `<div class="center">
      <h1>Kalori Takip</h1>
      <p class="muted">Bir kez giriş yapman yeterli, oturum hatırlanır.</p>
      <label for="email">E-posta</label>
      <input id="email" type="email" inputmode="email" autocomplete="email" value="${esc(login.email)}">
      <label for="password">Şifre</label>
      <input id="password" type="password" autocomplete="current-password">
      <div class="btns">
        <button class="btn primary" data-act="signIn" ${offline ? 'disabled' : ''}>Giriş yap</button>
        <button class="btn" data-act="sendLink" ${offline ? 'disabled' : ''}>Şifresiz: e-postama giriş bağlantısı gönder</button>
      </div>
      <p class="small muted">E-posta bağlantısı bilgisayarda ve Android'de çalışır. iPhone'da ana ekrandan açtıysan şifreyle giriş yap.</p>
      ${offline ? '<p class="bad small">Giriş için internet bağlantısı gerekli.</p>' : ''}
      ${login.msg ? `<p class="small">${esc(login.msg)}</p>` : ''}
      ${user ? '<div class="btns"><button class="btn" data-act="cancelLogin">Uygulamaya dön</button></div>' : ''}
    </div>`;
  }

  function startApp(u) {
    user = { id: u.id, email: u.email };
    LS.set('kt:lastUser', user);
    S = Object.assign(emptyState(), LS.get(dataKey(), {}));
    queue = LS.get(queueKey(), []);
    needLogin = false;
    loginVisible = false;
    $('#tabs').hidden = false;
    render();
    sync();
  }

  // ---------- alt sayfalar ----------
  const sheet = () => $('#sheet');
  function openSheet(html, ctx) {
    sheetCtx = ctx || null;
    $('#sheetBody').innerHTML = html;
    if (!sheet().open) sheet().showModal();
  }
  function closeSheet() { if (sheet().open) sheet().close(); sheetCtx = null; }

  function openPortion(f) {
    const opts = [0.5, 1, 1.5, 2];
    openSheet(`
      <h3>${esc(f.name)}</h3>
      <div class="small muted">1 porsiyon = ${esc(f.portion || '—')} · ${f0(f.kcal)} kcal · ${f1(f.protein)} g protein</div>
      <div class="qty">${opts.map((q) => `<button data-act="addQty" data-v="${q}"><b>${f1(q)}</b><span>${f0(f.kcal * q)} kcal</span></button>`).join('')}</div>
      ${f.grams ? `
      <label for="customQty">veya miktar gir (${/ml/i.test(f.portion) ? 'ml' : 'gram'})</label>
      <div class="inline">
        <input id="customQty" inputmode="decimal" placeholder="örn. 250" autocomplete="off">
        <button class="btn primary" data-act="addCustom">Ekle</button>
      </div>
      <div class="small muted" id="customPreview" style="min-height:20px;margin-top:6px"></div>` : `
      <label>veya sayı seç</label>
      <div class="inline pstep">
        <button data-act="pStep" data-v="-1" aria-label="Azalt">−</button>
        <output id="pQty">${STEP_START}</output>
        <button data-act="pStep" data-v="1" aria-label="Artır">+</button>
        <button class="btn primary" data-act="addStepper">Ekle</button>
      </div>
      <div class="small muted" id="customPreview" style="min-height:20px;margin-top:6px">${esc(stepperPreview(f, STEP_START))}</div>`}
      <div class="btns two">
        <button class="btn" data-act="foodEdit" data-id="${f.id}">Düzenle</button>
        <button class="btn" data-act="closeSheet">Vazgeç</button>
      </div>`, { food: f, pq: STEP_START });
  }

  const STEP_START = 1;
  function stepperPreview(f, q) {
    return `${qtyLabel(f, q, null)} · ${f0(f.kcal * q)} kcal · ${f1(f.protein * q)} g protein`;
  }

  function customQty() {
    const f = sheetCtx?.food;
    const v = num($('#customQty')?.value);
    if (!f || !(v > 0)) return null;
    return f.grams ? { qty: v / f.grams, grams: v } : { qty: v, grams: null };
  }

  function addEntries(entries, msg) {
    commit(entries.map((e) => up('entries', e)));
    toast(msg, () => commit(entries.map((e) => del('entries', e.id))));
  }

  function openFoodEdit(f) {
    const isNew = !f;
    f = f || { name: '', portion: '', grams: null, kcal: '', protein: '', carb: '', fat: '' };
    const v = (x) => (x === null || x === undefined ? '' : String(x).replace('.', ','));
    openSheet(`
      <h3>${isNew ? 'Yeni yiyecek' : 'Yiyeceği düzenle'}</h3>
      <label for="fe_name">Ad</label><input id="fe_name" value="${esc(f.name)}" autocomplete="off">
      <label for="fe_portion">Porsiyon açıklaması</label><input id="fe_portion" value="${esc(f.portion)}" placeholder="örn. 1 kase, 100 g" autocomplete="off">
      <div class="two">
        <div><label for="fe_kcal">Kalori (kcal)</label><input id="fe_kcal" inputmode="decimal" value="${v(f.kcal)}"></div>
        <div><label for="fe_protein">Protein (g)</label><input id="fe_protein" inputmode="decimal" value="${v(f.protein)}"></div>
        <div><label for="fe_carb">Karbonhidrat (g)</label><input id="fe_carb" inputmode="decimal" value="${v(f.carb)}"></div>
        <div><label for="fe_fat">Yağ (g)</label><input id="fe_fat" inputmode="decimal" value="${v(f.fat)}"></div>
      </div>
      <label for="fe_grams">1 porsiyon kaç gram? (opsiyonel, gramla eklemek için)</label>
      <input id="fe_grams" inputmode="decimal" value="${v(f.grams)}">
      <p class="small bad" id="fe_err"></p>
      <div class="btns">
        <button class="btn primary" data-act="saveFood">Kaydet</button>
        ${isNew ? '' : '<button class="btn danger" data-act="deleteFood">Yiyeceği sil</button>'}
        <button class="btn" data-act="closeSheet">Vazgeç</button>
      </div>`, { food: isNew ? null : f });
  }

  function saveFood() {
    const g = (id) => $('#' + id).value;
    const name = g('fe_name').trim();
    const vals = {};
    for (const k of ['kcal', 'protein', 'carb', 'fat']) {
      const raw = g('fe_' + k).trim();
      const n = raw === '' ? 0 : num(raw);
      if (!(n >= 0)) { $('#fe_err').textContent = 'Değerler sayı olmalı.'; return; }
      vals[k] = n;
    }
    const gramsRaw = g('fe_grams').trim();
    const grams = gramsRaw === '' ? null : num(gramsRaw);
    if (!name) { $('#fe_err').textContent = 'Ad gerekli.'; return; }
    if (grams !== null && !(grams > 0)) { $('#fe_err').textContent = 'Gram pozitif bir sayı olmalı.'; return; }
    const old = sheetCtx?.food;
    const row = old
      ? { ...old, name, portion: g('fe_portion').trim(), grams, ...vals }
      : { id: uuid(), name, portion: g('fe_portion').trim(), grams, ...vals, sort: Math.max(-1, ...S.foods.map((x) => x.sort || 0)) + 1, created_at: nowIso() };
    closeSheet();
    commit([up('foods', row)]);
    toast(old ? 'Kaydedildi' : `${name} listeye eklendi`);
  }

  function openMealEdit(m) {
    const isNew = !m;
    const qty = new Map((m?.items || []).map((it) => [it.food_id, +it.qty || 0]));
    const foods = sortedFoods();
    openSheet(`
      <h3>${isNew ? 'Yeni öğün' : 'Öğünü düzenle'}</h3>
      <label for="me_name">Öğün adı</label>
      <input id="me_name" value="${esc(m?.name || '')}" placeholder="örn. Kahvaltı" autocomplete="off">
      <div class="small muted" id="me_total" style="margin-top:10px"></div>
      <div class="mealfoods list" style="border:0;border-radius:0">
        ${foods.map((f) => `<div class="item ${qty.get(f.id) ? 'sel' : ''}" data-row="${f.id}">
          <div class="main"><div class="n">${esc(f.name)}</div><div class="d">${esc(f.portion)}</div></div>
          <div class="stepper">
            <button data-act="mealStep" data-id="${f.id}" data-v="-0.5" aria-label="Azalt">−</button>
            <output>${f1(qty.get(f.id) || 0)}</output>
            <button data-act="mealStep" data-id="${f.id}" data-v="0.5" aria-label="Artır">+</button>
          </div></div>`).join('')}
      </div>
      <p class="small bad" id="me_err"></p>
      <div class="btns">
        <button class="btn primary" data-act="saveMeal">Kaydet</button>
        ${isNew ? '' : '<button class="btn danger" data-act="deleteMeal">Öğünü sil</button>'}
        <button class="btn" data-act="closeSheet">Vazgeç</button>
      </div>`, { meal: m, qty });
    updateMealTotal();
  }
  function updateMealTotal() {
    const t = sum([...sheetCtx.qty].map(([id, q]) => { const f = foodById(id); return f && q ? scale(f, q) : {}; }));
    $('#me_total').textContent = `Toplam: ${f0(t.kcal)} kcal · ${f0(t.protein)} g protein · ${f0(t.carb)} g karb · ${f0(t.fat)} g yağ`;
  }

  // ---------- toast ----------
  let toastTimer = null;
  function toast(msg, undo) {
    let el = $('#toast');
    if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; document.body.appendChild(el); }
    el.innerHTML = `<span>${esc(msg)}</span>${undo ? '<button id="toastUndo">Geri al</button>' : ''}`;
    el.hidden = false;
    if (undo) $('#toastUndo').onclick = () => { el.hidden = true; undo(); };
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, undo ? 5000 : 2500);
  }

  // ---------- yedek ----------
  function exportJson() {
    const strip = (r) => { const { user_id, ...rest } = r; return rest; };
    const data = {
      app: 'kalori-takip', version: 1, exported_at: nowIso(),
      settings: S.settings ? strip(S.settings) : null,
      foods: S.foods.map(strip), meals: S.meals.map(strip), days: S.days.map(strip), entries: S.entries.map(strip),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `kalori-yedek-${todayStr()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  async function importJson(file) {
    let data;
    try { data = JSON.parse(await file.text()); } catch { return toast('Dosya okunamadı (geçerli JSON değil).'); }
    const pick = (table, r) => { const o = {}; COLS[table].forEach((c) => { if (r[c] !== undefined) o[c] = r[c]; }); return o; };
    const ops = [];
    if (data.settings && data.settings.targets) ops.push(up('settings', pick('settings', data.settings)));
    for (const table of ['foods', 'meals', 'days', 'entries']) {
      for (const r of Array.isArray(data[table]) ? data[table] : []) {
        if (!r || typeof r !== 'object') continue;
        if (table === 'days' ? !(/^\d{4}-\d{2}-\d{2}$/.test(r.date) && ['spor', 'dinlenme'].includes(r.day_type)) : !r.id || !r.name) continue;
        if (table === 'entries' && !r.date) continue;
        ops.push(up(table, pick(table, r)));
      }
    }
    if (!ops.length) return toast('Dosyada içe aktarılacak kayıt bulunamadı.');
    const count = (t) => ops.filter((o) => o.table === t).length;
    if (!confirm(`${count('foods')} yiyecek, ${count('meals')} öğün, ${count('entries')} kayıt içe aktarılacak. Mevcut verilerle birleştirilecek. Devam edilsin mi?`)) return;
    commit(ops);
    toast('İçe aktarıldı');
  }

  // ---------- olaylar ----------
  const actions = {
    tab: (b) => { tab = b.dataset.v; editMode = false; if (tab === 'today') curDate = todayStr(); render(); window.scrollTo(0, 0); },
    day: (b) => { const d = addDays(curDate, +b.dataset.v); if (d <= todayStr()) { curDate = d; render(); } },
    openDay: (b) => { curDate = b.dataset.v; tab = 'today'; render(); window.scrollTo(0, 0); },
    dayType: (b) => commit([up('days', { date: curDate, day_type: b.dataset.v })]),
    toggleEdit: () => { editMode = !editMode; render(); },
    food: (b) => { const f = foodById(b.dataset.id); if (!f) return; editMode ? openFoodEdit(f) : openPortion(f); },
    foodEdit: (b) => openFoodEdit(b.dataset.id ? foodById(b.dataset.id) : null),
    addQty: (b) => { const f = sheetCtx.food; const q = +b.dataset.v; closeSheet(); addEntries([makeEntry(f, q, null)], `${f.name} eklendi`); },
    addCustom: () => {
      const c = customQty();
      if (!c) { $('#customQty').focus(); return; }
      const f = sheetCtx.food; closeSheet(); addEntries([makeEntry(f, c.qty, c.grams)], `${f.name} eklendi`);
    },
    pStep: (b) => {
      const f = sheetCtx.food;
      sheetCtx.pq = Math.max(1, sheetCtx.pq + +b.dataset.v);
      $('#pQty').textContent = sheetCtx.pq;
      $('#customPreview').textContent = stepperPreview(f, sheetCtx.pq);
    },
    addStepper: () => {
      const f = sheetCtx.food; const q = sheetCtx.pq;
      closeSheet(); addEntries([makeEntry(f, q, null)], `${f.name} eklendi`);
    },
    delEntry: (b) => {
      const e = S.entries.find((x) => x.id === b.dataset.id);
      if (!e) return;
      commit([del('entries', e.id)]);
      toast(`${e.name} silindi`, () => commit([up('entries', e)]));
    },
    saveFood,
    deleteFood: () => {
      const f = sheetCtx.food;
      if (!confirm(`"${f.name}" listeden silinsin mi? Geçmiş kayıtlar etkilenmez.`)) return;
      closeSheet(); commit([del('foods', f.id)]);
    },
    meal: (b) => {
      const m = S.meals.find((x) => x.id === b.dataset.id);
      if (!m) return;
      if (editMode) return openMealEdit(m);
      const entries = (m.items || []).map((it) => { const f = foodById(it.food_id); return f && it.qty > 0 ? makeEntry(f, +it.qty, null) : null; }).filter(Boolean);
      if (!entries.length) return toast('Bu öğündeki yiyecekler artık listede yok.');
      addEntries(entries, `${m.name} eklendi`);
    },
    mealEdit: () => openMealEdit(null),
    mealStep: (b) => {
      const id = b.dataset.id;
      const q = Math.max(0, r1((sheetCtx.qty.get(id) || 0) + +b.dataset.v));
      if (q) sheetCtx.qty.set(id, q); else sheetCtx.qty.delete(id);
      const row = b.closest('.item');
      row.querySelector('output').textContent = f1(q);
      row.classList.toggle('sel', q > 0);
      updateMealTotal();
    },
    saveMeal: () => {
      const name = $('#me_name').value.trim();
      const items = [...sheetCtx.qty].filter(([, q]) => q > 0).map(([food_id, qty]) => ({ food_id, qty }));
      if (!name) { $('#me_err').textContent = 'Öğün adı gerekli.'; return; }
      if (!items.length) { $('#me_err').textContent = 'En az bir yiyecek seç.'; return; }
      const old = sheetCtx.meal;
      const row = old ? { ...old, name, items } : { id: uuid(), name, items, created_at: nowIso() };
      closeSheet(); commit([up('meals', row)]); toast('Öğün kaydedildi');
    },
    deleteMeal: () => {
      const m = sheetCtx.meal;
      if (!confirm(`"${m.name}" öğünü silinsin mi?`)) return;
      closeSheet(); commit([del('meals', m.id)]);
    },
    closeSheet,
    saveTargets: () => {
      const t = {};
      for (const type of ['spor', 'dinlenme']) {
        t[type] = {};
        for (const k of ['kcalMin', 'kcalMax', 'pMin', 'pMax']) {
          const v = num($(`#t_${type}_${k}`).value);
          if (!(v >= 0)) return toast('Hedefler sayı olmalı.');
          t[type][k] = v;
        }
        if (t[type].kcalMin > t[type].kcalMax || t[type].pMin > t[type].pMax) return toast('Min değer max değerden büyük olamaz.');
      }
      document.activeElement?.blur();
      commit([up('settings', { targets: t, updated_at: nowIso() })]);
      toast('Hedefler kaydedildi');
    },
    syncNow: () => { syncErr = ''; sync(); },
    export: exportJson,
    import: () => $('#importFile').click(),
    logout: async () => {
      const msg = queue.length
        ? `${queue.length} değişiklik henüz sunucuya gönderilmedi ve çıkış yaparsan kaybolacak. Yine de çıkılsın mı?`
        : 'Çıkış yapılsın mı? Tekrar girmek için e-posta bağlantısı gerekecek.';
      if (!confirm(msg)) return;
      try { await sb?.auth.signOut(); } catch (e) { console.warn(e); }
      LS.del(dataKey()); LS.del(queueKey()); LS.del('kt:lastUser');
      user = null; S = emptyState(); queue = [];
      login = { email: '', sent: false, msg: '' };
      showLogin();
    },
    relogin: () => { login.email = user?.email || ''; showLogin(''); },
    cancelLogin: () => { loginVisible = false; $('#tabs').hidden = false; render(); },
    sendLink: async (b) => {
      const email = $('#email').value.trim();
      login.email = email;
      if (!/^\S+@\S+\.\S+$/.test(email)) return showLogin('Geçerli bir e-posta gir.');
      if (!sb) return showLogin('Supabase bağlantısı kurulamadı.');
      b.disabled = true; b.textContent = 'Gönderiliyor…';
      const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } });
      if (error) return showLogin('Gönderilemedi: ' + error.message);
      showLogin('E-posta gönderildi. Gelen kutunu (ve spam klasörünü) kontrol et, bağlantıya tıkla.');
    },
    signIn: async (b) => {
      const email = $('#email').value.trim();
      const password = $('#password').value;
      login.email = email;
      if (!/^\S+@\S+\.\S+$/.test(email) || !password) return showLogin('E-posta ve şifreyi gir.');
      if (!sb) return showLogin('Supabase bağlantısı kurulamadı.');
      b.disabled = true; b.textContent = 'Giriş yapılıyor…';
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) return showLogin(/invalid/i.test(error.message) ? 'E-posta veya şifre hatalı.' : 'Giriş yapılamadı: ' + error.message);
      startApp(data.user);
    },
  };

  document.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-act]');
    if (!b || b.disabled) return;
    const fn = actions[b.dataset.act];
    if (fn) fn(b, ev);
  });
  document.addEventListener('input', (ev) => {
    if (ev.target.id === 'customQty') {
      const c = customQty();
      const f = sheetCtx?.food;
      $('#customPreview').textContent = c && f ? `${f0(f.kcal * c.qty)} kcal · ${f1(f.protein * c.qty)} g protein` : '';
    }
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter') return;
    const id = ev.target.id;
    if (id === 'customQty') actions.addCustom();
    else if (id === 'email') $('#password')?.focus();
    else if (id === 'password') $('[data-act="signIn"]')?.click();
  });
  document.addEventListener('change', (ev) => {
    if (ev.target.id === 'importFile' && ev.target.files[0]) { importJson(ev.target.files[0]); ev.target.value = ''; }
  });
  $('#sheet').addEventListener('click', (ev) => { if (ev.target.id === 'sheet') closeSheet(); });
  $('#sheet').addEventListener('close', () => { sheetCtx = null; });
  window.addEventListener('online', () => { setStatus(); sync(); });
  window.addEventListener('offline', setStatus);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !user) return;
    const t = todayStr();
    if (t !== lastToday) { if (curDate === lastToday) curDate = t; lastToday = t; render(); }
    sync();
  });

  // ---------- başlangıç ----------
  async function init() {
    if (!CFG.SUPABASE_URL || /PROJE-KODUN/.test(CFG.SUPABASE_URL) || /BURAYA/.test(CFG.SUPABASE_KEY || '')) {
      $('#app').innerHTML = '<div class="center"><h1>Kurulum eksik</h1><p class="muted">config.js dosyasına Supabase adresini ve anahtarını yaz.</p></div>';
      return;
    }
    const last = LS.get('kt:lastUser', null);
    const hash = new URLSearchParams(location.hash.slice(1));
    const hashErr = hash.get('error_description');

    if (window.supabase) {
      sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' },
      });
    }
    let session = null;
    if (sb) { try { ({ data: { session } } = await sb.auth.getSession()); } catch (e) { console.warn(e); } }
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);

    if (session) startApp(session.user);
    else if (last) startApp(last); // çevrimdışıyken de yerel verilerle aç; oturum gerekiyorsa üstte uyarı çıkar
    else showLogin(hashErr ? 'Bağlantı geçersiz veya süresi dolmuş, yeniden iste.' : (sb ? '' : 'Supabase kütüphanesi yüklenemedi. İnternet bağlantını kontrol et.'));

    sb?.auth.onAuthStateChange((event, s) => setTimeout(() => {
      if (!s?.user) return;
      if (!user || user.id !== s.user.id || loginVisible) startApp(s.user);
      else if (needLogin) { needLogin = false; sync(); }
    }, 0));
  }

  init();
})();
