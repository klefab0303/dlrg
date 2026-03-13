// ═══════════════════════════════════════════════════════════
// swimmer.js – Logik für die Schwimmer-Ansicht
// ═══════════════════════════════════════════════════════════

let currentUser = null;
let swimmerId = null;

// ─── Initialisierung ──────────────────────────────────────

(async () => {
  currentUser = await checkAuth('schwimmer');
  if (!currentUser) return;

  // Eigenes Schwimmerprofil laden
  const { data: swimmer } = await db.from('swimmers')
    .select('id,name,year').eq('user_id', currentUser.id).single();

  if (!swimmer) {
    document.body.innerHTML = '<p style="padding:2rem">Kein Schwimmerprofil gefunden.</p>';
    return;
  }

  swimmerId = swimmer.id;
  document.getElementById('nav-user').textContent = swimmer.name + ' (' + swimmer.year + ')';

  initTabs();
  loadTrainings();
  loadDisciplines('einzel');
  loadDisciplines('mannschaft');
  loadTimes();
})();

// ═══ TRAININGS ══════════════════════════════════════════

/** Nur zugewiesene Trainings laden + Anwesenheit anzeigen. */
async function loadTrainings() {
  const { data: assignments } = await db
    .from('training_swimmers').select('training_id').eq('swimmer_id', swimmerId);
  const ids = (assignments || []).map(a => a.training_id);
  const container = document.getElementById('training-list');

  if (ids.length === 0) {
    container.innerHTML = '<p style="color:var(--text-light)">Keine Trainings zugewiesen.</p>';
    return;
  }

  const { data: trainings } = await db
    .from('trainings').select('id,date,start_time,end_time').in('id', ids).order('date');

  const { data: attendances } = await db
    .from('attendance').select('training_id,status').eq('user_id', currentUser.id);
  const attMap = {};
  (attendances || []).forEach(a => { attMap[a.training_id] = a.status; });

  let html = '<table><thead><tr><th>Datum</th><th>Uhrzeit</th><th>Kommst du?</th><th></th></tr></thead><tbody>';
  (trainings || []).forEach(t => {
    const status = attMap[t.id] || '';
    html += `<tr>
      <td>${formatDate(t.date)}</td>
      <td>${formatSlot(t.start_time, t.end_time) || '–'}</td>
      <td>
        <div class="attendance-radio">
          <label><input type="radio" name="att-${t.id}" value="ja" ${status === 'ja' ? 'checked' : ''}> Ja</label>
          <label><input type="radio" name="att-${t.id}" value="nein" ${status === 'nein' ? 'checked' : ''}> Nein</label>
        </div>
      </td>
      <td><button class="btn btn-sm btn-secondary" onclick="saveAtt('${t.id}',this)">Speichern</button></td>
    </tr>`;
  });
  html += '</tbody></table>';
  container.innerHTML = html;
}

/** Anwesenheitsstatus speichern. */
async function saveAtt(trainingId, btn) {
  const sel = document.querySelector(`input[name="att-${trainingId}"]:checked`);
  if (!sel) { alert('Bitte Ja oder Nein wählen.'); return; }
  const { error } = await db.from('attendance').upsert({
    user_id: currentUser.id, training_id: trainingId, status: sel.value
  }, { onConflict: 'user_id,training_id' });
  confirmBtn(btn, !error);
}

// ═══ DISZIPLINEN ════════════════════════════════════════

/** Einzel- oder Mannschafts-Disziplinen laden. */
async function loadDisciplines(type) {
  const container = document.getElementById(type + '-list');

  if (type === 'einzel') {
    const { data } = await db.from('swimmer_disciplines')
      .select('discipline_id, disciplines(name, description, type)')
      .eq('swimmer_id', swimmerId);

    const filtered = (data || []).filter(d => d.disciplines.type === 'einzel');
    if (filtered.length === 0) {
      container.innerHTML = '<p style="color:var(--text-light)">Keine Einzeldisziplinen zugewiesen.</p>';
      return;
    }

    const { data: times } = await db.from('times')
      .select('discipline_id, time, created_at')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false });

    const timesByDisc = {};
    (times || []).forEach(t => {
      if (!timesByDisc[t.discipline_id]) timesByDisc[t.discipline_id] = [];
      timesByDisc[t.discipline_id].push(t);
    });

    let html = '';
    filtered.forEach(d => {
      const discTimes = timesByDisc[d.discipline_id] || [];
      const latest = discTimes.length > 0 ? formatTime(discTimes[0].time) : '–';
      html += `<div class="disc-item">
        <div class="disc-item-header" onclick="toggleDisc(this)">
          <span><strong>${d.disciplines.name}</strong>
            <span style="font-size:0.82rem;color:var(--text-light);margin-left:0.5rem">Letzte: ${latest}</span>
          </span>
          <span style="font-size:0.8rem;color:var(--text-light)">▼</span>
        </div>
        <div class="disc-item-body">
          ${d.disciplines.description ? '<p style="margin-bottom:0.8rem;font-style:italic">' + d.disciplines.description + '</p>' : ''}
          ${discTimes.length > 0 ? '<div class="section-title" style="margin-top:0.5rem;font-size:0.82rem">Zeiten-Historie</div><table><thead><tr><th>Datum</th><th>Zeit</th></tr></thead><tbody>' + discTimes.map(t => `<tr><td>${formatDate(t.created_at)}</td><td>${formatTime(t.time)}</td></tr>`).join('') + '</tbody></table>' : '<p style="color:var(--text-light);font-size:0.85rem">Noch keine Zeiten erfasst.</p>'}
        </div>
      </div>`;
    });
    container.innerHTML = html;
  }

  if (type === 'mannschaft') {
    const { data: teilstrecken } = await db.from('teilstrecken').select('id, name');
    const tsMap = {};
    (teilstrecken || []).forEach(t => { tsMap[t.id] = t.name; });

    const { data: myPositions } = await db.from('relay_positions')
      .select('staffel_id, position').eq('swimmer_id', swimmerId);

    if (!myPositions || myPositions.length === 0) {
      container.innerHTML = '<p style="color:var(--text-light)">Du bist keiner Staffel zugewiesen.</p>';
      return;
    }

    const gruppenIds = [...new Set(myPositions.map(p => p.staffel_id))];
    const myPosMap = {};
    myPositions.forEach(p => { myPosMap[p.staffel_id] = p.position; });

    const { data: gruppen } = await db.from('staffeln')
      .select('id, discipline_id, disciplines(name, teilstrecke_1, teilstrecke_2, teilstrecke_3, teilstrecke_4)')
      .in('id', gruppenIds);

    const { data: allPositions } = await db.from('relay_positions')
      .select('staffel_id, position, swimmer_id, swimmers(name)')
      .in('staffel_id', gruppenIds).order('position');

    let html = '';
    (gruppen || []).forEach(gr => {
      const disc = gr.disciplines;
      const legs = [
        { pos: 1, name: tsMap[disc.teilstrecke_1] || '1. Teilstrecke' },
        { pos: 2, name: tsMap[disc.teilstrecke_2] || '2. Teilstrecke' },
        { pos: 3, name: tsMap[disc.teilstrecke_3] || '3. Teilstrecke' },
        { pos: 4, name: tsMap[disc.teilstrecke_4] || '4. Teilstrecke' },
      ];
      const myPos = myPosMap[gr.id];
      const grPositions = (allPositions || []).filter(p => p.staffel_id === gr.id);

      html += `<div class="disc-item">
        <div class="disc-item-header" onclick="toggleDisc(this)">
          <strong>${disc.name}</strong>
          <span style="font-size:0.8rem;color:var(--text-light)">▼</span>
        </div>
        <div class="disc-item-body">
          <table><thead><tr><th>Teilstrecke</th><th>Schwimmer</th></tr></thead><tbody>`;

      legs.forEach(leg => {
        const pos = grPositions.find(p => p.position === leg.pos);
        const isMe = leg.pos === myPos;
        const swimmerName = pos?.swimmers?.name || '–';
        html += `<tr style="${isMe ? 'background:var(--primary-light,#e0f0ff);font-weight:600' : ''}">
          <td>${leg.name}</td>
          <td>${swimmerName}</td>
        </tr>`;
      });

      html += '</tbody></table></div></div>';
    });
    container.innerHTML = html;
  }
}

// ═══ ZEITEN ═════════════════════════════════════════════

/** Eigene Einzel- und Teilstrecken-Zeiten laden. */
async function loadTimes() {
  const { data: myDiscs } = await db.from('swimmer_disciplines')
    .select('discipline_id, disciplines(id,name,type)')
    .eq('swimmer_id', swimmerId);

  const { data: times } = await db.from('times')
    .select('discipline_id,time,created_at')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: false });

  const timesByDisc = {};
  (times || []).forEach(t => {
    if (!timesByDisc[t.discipline_id]) timesByDisc[t.discipline_id] = [];
    timesByDisc[t.discipline_id].push(t);
  });

  // Teilstrecken
  const { data: allTs } = await db.from('teilstrecken').select('id, name').order('name');
  const { data: tsTimes } = await db.from('times')
    .select('teilstrecke_id, time, created_at')
    .eq('user_id', currentUser.id)
    .not('teilstrecke_id', 'is', null)
    .order('created_at', { ascending: false });

  const tsTimeMap = {};
  (tsTimes || []).forEach(t => {
    if (!tsTimeMap[t.teilstrecke_id]) tsTimeMap[t.teilstrecke_id] = [];
    tsTimeMap[t.teilstrecke_id].push(t);
  });

  const tsContainer = document.getElementById('times-teilstrecken');
  if (allTs && allTs.length > 0) {
    // Aufteilen: ohne Zeit (offen) vs. mit Zeit (zugeklappt)
    const ohneZeit = allTs.filter(ts => !(tsTimeMap[ts.id] && tsTimeMap[ts.id].length > 0));
    const mitZeit  = allTs.filter(ts => tsTimeMap[ts.id] && tsTimeMap[ts.id].length > 0);

    let tsHtml = '';

    // Teilstrecken ohne eingetragene Zeit – direkt sichtbar
    if (ohneZeit.length > 0) {
      tsHtml += '<table><thead><tr><th>Teilstrecke</th><th>Zeit</th><th></th></tr></thead><tbody>';
      ohneZeit.forEach(ts => {
        tsHtml += `<tr>
          <td>${ts.name}</td>
          <td><input type="text" id="ts-time-${ts.id}" placeholder="0:23,45" style="width:120px;padding:6px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:0.9rem"></td>
          <td><button class="btn btn-sm btn-secondary" onclick="saveTsTime('${ts.id}',this)">Speichern</button></td>
        </tr>`;
      });
      tsHtml += '</tbody></table>';
    }

    // Teilstrecken mit Zeit – in aufklappbarem Bereich
    if (mitZeit.length > 0) {
      tsHtml += `<div class="disc-item" style="margin-top:1rem">
        <div class="disc-item-header" onclick="toggleDisc(this)">
          <strong>Bereits eingetragen (${mitZeit.length})</strong>
          <span style="font-size:0.8rem;color:var(--text-light)">▼</span>
        </div>
        <div class="disc-item-body">
          <table><thead><tr><th>Teilstrecke</th><th>Bestzeit</th><th>Neue Zeit</th><th></th></tr></thead><tbody>`;
      mitZeit.forEach(ts => {
        const best = formatTime(tsTimeMap[ts.id][0].time);
        tsHtml += `<tr>
          <td>${ts.name}</td>
          <td>${best}</td>
          <td><input type="text" id="ts-time-${ts.id}" placeholder="0:23,45" style="width:120px;padding:6px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:0.9rem"></td>
          <td><button class="btn btn-sm btn-secondary" onclick="saveTsTime('${ts.id}',this)">Speichern</button></td>
        </tr>`;
      });
      tsHtml += '</tbody></table></div></div>';
    }

    tsContainer.innerHTML = tsHtml;
  } else {
    tsContainer.innerHTML = '<p style="color:var(--text-light)">Keine Teilstrecken vorhanden.</p>';
  }

  // Einzeldisziplinen
  const einzelDiscs = (myDiscs || []).filter(d => d.disciplines.type === 'einzel');
  const container = document.getElementById('times-einzel');

  if (einzelDiscs.length === 0) {
    container.innerHTML = '<p style="color:var(--text-light)">Keine Einzeldisziplinen.</p>';
  } else {
    let html = '';
    einzelDiscs.forEach(d => {
      const discTimes = timesByDisc[d.discipline_id] || [];
      const latest = discTimes.length > 0 ? formatTime(discTimes[0].time) : '–';
      html += `<div class="disc-item">
        <div class="disc-item-header" onclick="toggleDisc(this)">
          <span><strong>${d.disciplines.name}</strong>
            <span style="font-size:0.82rem;color:var(--text-light);margin-left:0.5rem">Letzte: ${latest}</span>
          </span>
          <span style="font-size:0.8rem;color:var(--text-light)">▼</span>
        </div>
        <div class="disc-item-body">
          <div style="margin-bottom:0.8rem">
            <input type="text" id="time-${d.discipline_id}" placeholder="1:23,45"
              style="width:120px;padding:6px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:0.9rem;margin-right:0.5rem;">
            <button class="btn btn-sm btn-secondary" onclick="saveTime('${d.discipline_id}',this)">Speichern</button>
          </div>
          ${discTimes.length > 0 ? '<div class="section-title" style="font-size:0.82rem">Historie</div><table><thead><tr><th>Datum</th><th>Zeit</th></tr></thead><tbody>' + discTimes.map(t => `<tr><td>${formatDate(t.created_at)}</td><td>${formatTime(t.time)}</td></tr>`).join('') + '</tbody></table>' : '<p style="color:var(--text-light);font-size:0.85rem">Noch keine Zeiten.</p>'}
        </div>
      </div>`;
    });
    container.innerHTML = html;
  }
}

/** Einzelzeit speichern. */
async function saveTime(discId, btn) {
  const val = document.getElementById('time-' + discId).value.trim();
  if (!val) { alert('Bitte Zeit eingeben.'); return; }
  const sec = parseTime(val);
  if (sec === null) { alert('Format: mm:ss,hh'); return; }
  const { error } = await db.from('times').insert({
    user_id: currentUser.id, discipline_id: discId, time: sec
  });
  confirmBtn(btn, !error);
  if (!error) loadTimes();
}

/** Teilstreckenzeit speichern. */
async function saveTsTime(tsId, btn) {
  const val = document.getElementById('ts-time-' + tsId).value.trim();
  if (!val) { alert('Bitte Zeit eingeben.'); return; }
  const sec = parseTime(val);
  if (sec === null) { alert('Format: mm:ss,hh'); return; }
  const { error } = await db.from('times').insert({
    user_id: currentUser.id, teilstrecke_id: tsId, time: sec
  });
  confirmBtn(btn, !error);
  if (!error) { document.getElementById('ts-time-' + tsId).value = ''; loadTimes(); }
}
