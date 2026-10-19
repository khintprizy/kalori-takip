'use strict';
(() => {
  const DEFAULT_TARGETS = {
    spor: { kcalMin: 2000, kcalMax: 2100, pMin: 115, pMax: 145, fMin: 55, fMax: 60 },
    dinlenme: { kcalMin: 1800, kcalMax: 1900, pMin: 115, pMax: 145, fMin: 55, fMax: 60 },
  };
  const TARGET_KEYS = ['kcalMin', 'kcalMax', 'pMin', 'pMax', 'fMin', 'fMax'];

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

  // ---------- durum (her şey bu cihazda, localStorage'da) ----------
  const DATA_KEY = 'kt:local';
  let S = emptyState();
  let tab = 'today';
  let curDate = todayStr();
  let lastToday = curDate;
  let editMode = false;
  let sheetCtx = null;
  let foodQuery = '';

  // Türkçe karakterleri sadeleştirir: "suzme" yazınca "Süzme" de bulunur.
  const norm = (s) => String(s || '').toLocaleLowerCase('tr').replace(/[ıîâûşğüöç]/g, (c) => ({ ı: 'i', î: 'i', â: 'a', û: 'u', ş: 's', ğ: 'g', ü: 'u', ö: 'o', ç: 'c' }[c]));
  const matches = (name) => { const q = norm(foodQuery).trim(); return !q || q.split(/\s+/).every((w) => norm(name).includes(w)); };
  function filterFoods() {
    let any = false;
    document.querySelectorAll('#foodGrid .food[data-q]').forEach((b) => {
      const ok = matches(b.dataset.q);
      b.hidden = !ok;
      any = any || ok;
    });
    $('#noFood').hidden = any;
    $('[data-act="clearSearch"]').hidden = !foodQuery;
  }

  function emptyState() { return { settings: null, foods: [], meals: [], days: [], entries: [] }; }
  function persist() {
    try { localStorage.setItem(DATA_KEY, JSON.stringify(S)); }
    catch (e) { console.warn(e); toast('Kaydedilemedi! Cihaz hafızası dolu olabilir, yedek al.'); }
  }

  // ---------- veri işlemleri ----------
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
    for (const op of ops) applyOp(S, op);
    persist();
    render();
  }

  function seed() {
    const t = Date.now();
    const ops = [up('settings', { targets: DEFAULT_TARGETS, updated_at: nowIso() })];
    STARTER.forEach(([name, portion, grams, kcal, protein, carb, fat], i) => {
      ops.push(up('foods', { id: uuid(), name, portion, grams, kcal, protein, carb, fat, sort: i, created_at: new Date(t + i).toISOString() }));
    });
    commit(ops);
  }

  // Yerel veriyi yükler; yoksa eski (girişli) sürümün bu cihazdaki kopyasını bir kez taşır.
  function loadState() {
    const cur = LS.get(DATA_KEY, null);
    if (cur) return Object.assign(emptyState(), cur);
    const last = LS.get('kt:lastUser', null);
    const old = last && LS.get('kt:data:' + last.id, null);
    if (!old) return null;
    const strip = (r) => { const { user_id, ...rest } = r; return rest; };
    const st = Object.assign(emptyState(), old);
    st.settings = st.settings ? strip(st.settings) : null;
    for (const t of ['foods', 'meals', 'days', 'entries']) st[t] = (st[t] || []).map(strip);
    return st;
  }

  // ---------- hesaplamalar ----------
  function targets() {
    const saved = S.settings?.targets || {};
    const out = {};
    for (const type of ['spor', 'dinlenme']) {
      const t = { ...DEFAULT_TARGETS[type], ...(saved[type] || {}) };
      // Karbonhidrat = protein ve yağ hedeflerinin (orta noktaları) kalorisi düşüldükten sonra kalan kalori / 4
      const rest = (+t.pMin + +t.pMax) / 2 * 4 + (+t.fMin + +t.fMax) / 2 * 9;
      t.cMin = Math.max(0, Math.round((t.kcalMin - rest) / 4));
      t.cMax = Math.max(0, Math.round((t.kcalMax - rest) / 4));
      out[type] = t;
    }
    return out;
  }
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
  function metric(label, val, min, max, unit) {
    const top = Math.max(max * 1.15, val, 1);
    const cls = val > max ? 'over' : val >= min ? 'ok' : '';
    const note = val < min ? `${f0(min - val)} kaldı` : val > max ? `${f0(val - max)} fazla` : 'hedefte ✓';
    return `<div class="metric">
      <div class="row">
        <span class="lbl">${label}</span>
        <span class="val"><b>${f0(val)}</b> / ${f0(min)}–${f0(max)} ${unit}</span>
        <span class="note ${cls === 'ok' ? 'ok' : cls === 'over' ? 'bad' : ''}">${note}</span>
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
    <div class="seg">
      <button data-act="dayType" data-v="spor" class="${type === 'spor' ? 'on' : ''}">Spor günü</button>
      <button data-act="dayType" data-v="dinlenme" class="${type === 'dinlenme' ? 'on' : ''}">Dinlenme günü</button>
    </div>
    <div class="card total">
      ${metric('Kalori', tot.kcal, t.kcalMin, t.kcalMax, 'kcal')}
      ${metric('Protein', tot.protein, t.pMin, t.pMax, 'g')}
      ${metric('Karb', tot.carb, t.cMin, t.cMax, 'g')}
      ${metric('Yağ', tot.fat, t.fMin, t.fMax, 'g')}
    </div>

    <h2>Öğünler</h2>
    <div class="chips">
      ${S.meals.map((m) => { const mt = mealTotals(m); return `<button class="chip" data-act="meal" data-id="${m.id}"><div class="n">${esc(m.name)}</div><div class="d">${f0(mt.kcal)} kcal · ${f0(mt.protein)} g protein</div></button>`; }).join('')}
      <button class="chip add" data-act="mealEdit">+ Öğün</button>
    </div>

    <h2>Yiyecekler <button class="linkbtn" data-act="toggleEdit">${editMode ? 'Bitti' : 'Düzenle'}</button></h2>
    ${editMode ? '<p class="small muted" style="margin:-4px 0 10px">Düzenlemek istediğin yiyeceğe veya öğüne dokun.</p>' : ''}
    <div class="search">
      <input id="foodSearch" type="text" placeholder="Yiyecek ara…" value="${esc(foodQuery)}" autocomplete="off" enterkeyhint="search">
      <button class="iconbtn" data-act="clearSearch" aria-label="Aramayı temizle" ${foodQuery ? '' : 'hidden'}>×</button>
    </div>
    <div class="grid" id="foodGrid">
      ${foods.map((f) => `<button class="food" data-act="food" data-id="${f.id}" data-q="${esc(norm(f.name))}" ${matches(f.name) ? '' : 'hidden'}><div class="n">${esc(f.name)}</div><div class="d">${esc(f.portion)}<br>${f0(f.kcal)} kcal · ${f1(f.protein)} g P</div></button>`).join('')}
      <button class="food add" data-act="quickAdd">+ Direkt makro</button>
      <button class="food add" data-act="foodEdit">+ Yeni yiyecek</button>
    </div>
    <div class="empty" id="noFood" ${foods.some((f) => matches(f.name)) ? 'hidden' : ''}>Eşleşen yiyecek yok.</div>

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
      <div class="two"><div><label>Yağ min (g)</label>${inp('fMin', t.fMin)}</div><div><label>Yağ max (g)</label>${inp('fMax', t.fMax)}</div></div>
      <div class="small muted" style="margin-top:10px">Karbonhidrat (otomatik): <b>${f0(t.cMin)}–${f0(t.cMax)} g</b> · protein ve yağdan kalan kalori</div>
    </div>`;
  }

  function renderSettings() {
    return `
      <h2 style="margin-top:8px">Hedefler</h2>
      ${targetInputs('spor', 'Spor günü')}
      ${targetInputs('dinlenme', 'Dinlenme günü')}
      <button class="btn primary" data-act="saveTargets">Hedefleri kaydet</button>

      <h2>Günlük makrolar</h2>
      <div class="card">
        <div class="small muted">Her günün toplam kalori, protein, karbonhidrat ve yağını; ayrıca aylık ortalamaları içeren bir dosya indirir.</div>
        <div class="btns"><button class="btn" data-act="exportDaily">Günlük makroları indir (JSON)</button></div>
      </div>

      <h2>Yedek</h2>
      <div class="card">
        <div class="small muted">Veriler sadece bu cihazda saklanır. Ara ara yedek alıp dosyayı güvenli bir yere (Drive, e-posta vb.) koy. İçe aktarma mevcut verilerle birleştirir; aynı kayıtlar güncellenir, hiçbir şey silinmez.</div>
        <div class="btns two">
          <button class="btn" data-act="export">Dışa aktar (JSON)</button>
          <button class="btn" data-act="import">İçe aktar</button>
        </div>
        <input type="file" id="importFile" accept="application/json,.json" hidden>
      </div>`;
  }

  function render() {
    const html = tab === 'today' ? renderToday() : tab === 'history' ? renderHistory() : renderSettings();
    $('#app').innerHTML = `<main class="${editMode && tab === 'today' ? 'editing' : ''}">${html}</main>`;
    document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.v === tab));
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
    foodQuery = '';
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

  // Listeye kaydetmeden, o güne doğrudan makro ekler.
  function openQuickAdd() {
    openSheet(`
      <h3>Direkt makro ekle</h3>
      <div class="small muted">Listeye kaydedilmez, sadece ${curDate === todayStr() ? 'bugüne' : 'bu güne'} eklenir.</div>
      <label for="qa_name">Ne yedin? (opsiyonel)</label>
      <input id="qa_name" placeholder="örn. Kumpir" autocomplete="off">
      <div class="two">
        <div><label for="qa_protein">Protein (g)</label><input id="qa_protein" inputmode="decimal"></div>
        <div><label for="qa_carb">Karbonhidrat (g)</label><input id="qa_carb" inputmode="decimal"></div>
        <div><label for="qa_fat">Yağ (g)</label><input id="qa_fat" inputmode="decimal"></div>
        <div><label for="qa_kcal">Kalori (kcal)</label><input id="qa_kcal" inputmode="decimal" placeholder="otomatik"></div>
      </div>
      <div class="small muted" style="margin-top:6px">Kaloriyi boş bırakırsan makrolardan hesaplanır.</div>
      <p class="small bad" id="qa_err"></p>
      <div class="btns two">
        <button class="btn primary" data-act="saveQuick">Ekle</button>
        <button class="btn" data-act="closeSheet">Vazgeç</button>
      </div>`);
  }
  function quickVals() {
    const v = {};
    for (const k of ['protein', 'carb', 'fat', 'kcal']) {
      const raw = $('#qa_' + k).value.trim();
      v[k] = raw === '' ? null : num(raw);
      if (v[k] !== null && !(v[k] >= 0)) return null;
    }
    v.auto = r1((v.protein || 0) * 4 + (v.carb || 0) * 4 + (v.fat || 0) * 9);
    return v;
  }
  function saveQuick() {
    const v = quickVals();
    if (!v) { $('#qa_err').textContent = 'Değerler sayı olmalı.'; return; }
    const kcal = v.kcal ?? v.auto;
    if (!(kcal > 0)) { $('#qa_err').textContent = 'En az bir değer gir.'; return; }
    const name = $('#qa_name').value.trim() || 'Direkt makro';
    const e = { id: uuid(), date: curDate, food_id: null, name, qty: 1, qty_label: 'direkt makro', kcal: r1(kcal), protein: r1(v.protein), carb: r1(v.carb), fat: r1(v.fat), created_at: nowIso() };
    closeSheet();
    addEntries([e], `${name} eklendi`);
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
  function download(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  function exportJson() {
    const data = {
      app: 'kalori-takip', version: 1, exported_at: nowIso(),
      settings: S.settings, foods: S.foods, meals: S.meals, days: S.days, entries: S.entries,
    };
    download(data, `kalori-yedek-${todayStr()}.json`);
  }

  // Sadece günlük toplamlar + aylık ortalamalar (okumak için; içe aktarılamaz).
  function exportDaily() {
    const T = targets();
    const dates = [...new Set(S.entries.map((e) => e.date))].sort();
    if (!dates.length) return toast('Henüz kayıt yok.');
    const gunler = dates.map((date) => {
      const list = S.entries.filter((e) => e.date === date);
      const tot = sum(list);
      const type = dayType(date);
      const t = T[type];
      return {
        tarih: date,
        gun_tipi: type,
        kcal: Math.round(tot.kcal),
        protein: r1(tot.protein),
        karbonhidrat: r1(tot.carb),
        yag: r1(tot.fat),
        kayit_sayisi: list.length,
        hedefte: tot.kcal >= t.kcalMin && tot.kcal <= t.kcalMax && tot.protein >= t.pMin && tot.protein <= t.pMax,
      };
    });
    const months = new Map();
    for (const g of gunler) {
      const k = g.tarih.slice(0, 7);
      if (!months.has(k)) months.set(k, []);
      months.get(k).push(g);
    }
    const avg = (arr, k) => r1(arr.reduce((a, g) => a + g[k], 0) / arr.length);
    const aylar = [...months].map(([ay, arr]) => ({
      ay,
      gun_sayisi: arr.length,
      ortalama_kcal: Math.round(avg(arr, 'kcal')),
      ortalama_protein: avg(arr, 'protein'),
      ortalama_karbonhidrat: avg(arr, 'karbonhidrat'),
      ortalama_yag: avg(arr, 'yag'),
      toplam_kcal: arr.reduce((a, g) => a + g.kcal, 0),
      hedefte_gun: arr.filter((g) => g.hedefte).length,
    }));
    download({ app: 'kalori-takip', tur: 'gunluk-makrolar', exported_at: nowIso(), hedefler: T, aylar, gunler },
      `gunluk-makrolar-${todayStr()}.json`);
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
    quickAdd: openQuickAdd,
    saveQuick,
    clearSearch: () => { foodQuery = ''; $('#foodSearch').value = ''; filterFoods(); },
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
        for (const k of TARGET_KEYS) {
          const v = num($(`#t_${type}_${k}`).value);
          if (!(v >= 0)) return toast('Hedefler sayı olmalı.');
          t[type][k] = v;
        }
        if (t[type].kcalMin > t[type].kcalMax || t[type].pMin > t[type].pMax || t[type].fMin > t[type].fMax) return toast('Min değer max değerden büyük olamaz.');
      }
      document.activeElement?.blur();
      commit([up('settings', { targets: t, updated_at: nowIso() })]);
      toast('Hedefler kaydedildi');
    },
    export: exportJson,
    exportDaily,
    import: () => $('#importFile').click(),
  };

  document.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-act]');
    if (!b || b.disabled) return;
    const fn = actions[b.dataset.act];
    if (fn) fn(b, ev);
  });
  document.addEventListener('input', (ev) => {
    if (ev.target.id === 'foodSearch') { foodQuery = ev.target.value; filterFoods(); }
    if (/^qa_(protein|carb|fat)$/.test(ev.target.id)) { const v = quickVals(); $('#qa_kcal').placeholder = v && v.auto ? `otomatik: ${f0(v.auto)}` : 'otomatik'; }
    if (ev.target.id === 'customQty') {
      const c = customQty();
      const f = sheetCtx?.food;
      $('#customPreview').textContent = c && f ? `${f0(f.kcal * c.qty)} kcal · ${f1(f.protein * c.qty)} g protein` : '';
    }
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && ev.target.id === 'customQty') actions.addCustom();
    if (ev.key === 'Enter' && ev.target.id === 'foodSearch') ev.target.blur(); // klavyeyi kapat
  });
  document.addEventListener('change', (ev) => {
    if (ev.target.id === 'importFile' && ev.target.files[0]) { importJson(ev.target.files[0]); ev.target.value = ''; }
  });
  $('#sheet').addEventListener('click', (ev) => { if (ev.target.id === 'sheet') closeSheet(); });
  $('#sheet').addEventListener('close', () => { sheetCtx = null; });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    const t = todayStr();
    if (t !== lastToday) { if (curDate === lastToday) curDate = t; lastToday = t; render(); }
  });

  // ---------- başlangıç ----------
  function init() {
    // Tarayıcıdan verileri kendiliğinden silmemesini iste (destekleniyorsa).
    try { navigator.storage?.persist?.(); } catch { /* yok say */ }
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
    $('#tabs').hidden = false;
    const st = loadState();
    if (st) { S = st; persist(); render(); }
    else seed();
  }

  init();
})();
