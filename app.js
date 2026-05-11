const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const MOIS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const MOIS_COURT = ['Janv', 'Févr', 'Mars', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sept', 'Oct', 'Nov', 'Déc'];

let state = {
  user: null,
  sources: [],
  utilisateurs: [],
  objectifs: [],
  evenements: [],
  annee: new Date().getFullYear()
};

async function init() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) {
    window.location.href = 'index.html';
    return;
  }
  state.user = session.user;

  const { data: profil } = await sb.from('utilisateurs').select('*').eq('id', state.user.id).single();
  document.getElementById('user-info').textContent = (profil?.prenom || '') + ' ' + (profil?.nom || '');

  await loadData();
  setupNav();
  setupModal();
  renderAll();
}

async function loadData() {
  const [sources, utilisateurs, objectifs, evenements] = await Promise.all([
    sb.from('sources').select('*').order('id'),
    sb.from('utilisateurs').select('*').order('prenom'),
    sb.from('objectifs').select('*'),
    sb.from('evenements').select('*').order('date_evenement', { ascending: false })
  ]);
  state.sources = sources.data || [];
  state.utilisateurs = utilisateurs.data || [];
  state.objectifs = objectifs.data || [];
  state.evenements = evenements.data || [];
}

function periodeMSI(dateStr) {
  if (!dateStr) return null;
  const m = new Date(dateStr).getMonth() + 1;
  if (m >= 2 && m <= 6) return 'P1';
  if (m === 1 || m >= 9) return 'P2';
  return 'Hors';
}

function statutEvenement(ev) {
  if (ev.resultat_contacts === null || ev.resultat_contacts === undefined) return 'À venir';
  return ev.resultat_contacts >= (ev.objectif_contacts || 0) ? 'Objectif atteint' : 'Objectif non atteint';
}

function setupNav() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('tab-active'));
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      tab.classList.add('tab-active');
      document.getElementById('view-' + tab.dataset.tab).classList.add('active');
    });
  });

  document.getElementById('btn-logout').addEventListener('click', async () => {
    await sb.auth.signOut();
    window.location.href = 'index.html';
  });

  document.getElementById('btn-add-event').addEventListener('click', () => openModal());
  document.getElementById('btn-add-from-cal').addEventListener('click', () => openModal());

  const yearSelect = document.getElementById('year-select');
  const currentYear = new Date().getFullYear();
  for (let y = currentYear - 1; y <= currentYear + 1; y++) {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y;
    if (y === state.annee) opt.selected = true;
    yearSelect.appendChild(opt);
  }
  yearSelect.addEventListener('change', (e) => {
    state.annee = parseInt(e.target.value);
    renderCalendar();
    renderDashboard();
  });
}

function setupModal() {
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal').addEventListener('click', (e) => {
    if (e.target.id === 'modal') closeModal();
  });
  document.getElementById('event-form').addEventListener('submit', saveEvent);
  document.getElementById('btn-delete').addEventListener('click', deleteEvent);
}

function openModal(prefill = {}) {
  const form = document.getElementById('event-form');
  form.reset();
  document.getElementById('event-id').value = prefill.id || '';
  document.getElementById('modal-title').textContent = prefill.id ? 'Modifier événement' : 'Nouvel événement';
  document.getElementById('btn-delete').classList.toggle('hidden', !prefill.id);

  const srcSelect = document.getElementById('event-source');
  srcSelect.innerHTML = '<option value="">Choisir...</option>';
  state.sources.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.nom;
    if (prefill.source_id === s.id) opt.selected = true;
    srcSelect.appendChild(opt);
  });

  const respSelect = document.getElementById('event-responsable');
  respSelect.innerHTML = '<option value="">Choisir...</option>';
  state.utilisateurs.forEach(u => {
    const opt = document.createElement('option');
    opt.value = u.id;
    opt.textContent = (u.prenom || '') + ' ' + (u.nom || '');
    if (prefill.responsable_id === u.id || (!prefill.id && u.id === state.user.id)) opt.selected = true;
    respSelect.appendChild(opt);
  });

  if (prefill.id) {
    document.getElementById('event-quoi').value = prefill.quoi || '';
    document.getElementById('event-date').value = prefill.date_evenement || '';
    document.getElementById('event-objectif').value = prefill.objectif_contacts || 0;
    document.getElementById('event-comment').value = prefill.comment_preparation || '';
    document.getElementById('event-resultat').value = prefill.resultat_contacts ?? '';
    document.getElementById('event-notes').value = prefill.notes || '';
  } else if (prefill.date_evenement) {
    document.getElementById('event-date').value = prefill.date_evenement;
    document.getElementById('event-quoi').value = prefill.quoi || '';
  }

  document.getElementById('modal').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal').classList.add('hidden');
}

async function saveEvent(e) {
  e.preventDefault();
  const id = document.getElementById('event-id').value;
  const data = {
    quoi: document.getElementById('event-quoi').value,
    source_id: parseInt(document.getElementById('event-source').value) || null,
    responsable_id: document.getElementById('event-responsable').value || null,
    date_evenement: document.getElementById('event-date').value,
    objectif_contacts: parseInt(document.getElementById('event-objectif').value) || 0,
    comment_preparation: document.getElementById('event-comment').value,
    resultat_contacts: document.getElementById('event-resultat').value ? parseInt(document.getElementById('event-resultat').value) : null,
    notes: document.getElementById('event-notes').value
  };

  const { error } = id
    ? await sb.from('evenements').update(data).eq('id', id)
    : await sb.from('evenements').insert([data]);

  if (error) {
    showToast('Erreur : ' + error.message, 'error');
  } else {
    showToast(id ? 'Événement modifié' : 'Événement créé', 'success');
    closeModal();
    await loadData();
    renderAll();
  }
}

async function deleteEvent() {
  const id = document.getElementById('event-id').value;
  if (!id || !confirm('Supprimer cet événement ?')) return;
  const { error } = await sb.from('evenements').delete().eq('id', id);
  if (error) {
    showToast('Erreur : ' + error.message, 'error');
  } else {
    showToast('Événement supprimé', 'success');
    closeModal();
    await loadData();
    renderAll();
  }
}

function showToast(msg, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = 'toast toast-' + type;
  setTimeout(() => toast.classList.add('hidden'), 3000);
}

function renderAll() {
  renderDashboard();
  renderCalendar();
  renderEventsTable();
  renderObjectifsTable();
}

function renderDashboard() {
  const evAnnee = state.evenements.filter(e => new Date(e.date_evenement).getFullYear() === state.annee);
  const total = evAnnee.length;
  const realises = evAnnee.filter(e => e.resultat_contacts !== null).length;
  const contacts = evAnnee.reduce((s, e) => s + (e.resultat_contacts || 0), 0);
  const objAnnuel = state.objectifs.reduce((s, o) => s + (o.cible_contacts || 0), 0);
  const taux = objAnnuel > 0 ? Math.round((contacts / objAnnuel) * 100) : 0;

  document.getElementById('kpi-total').textContent = total;
  document.getElementById('kpi-done').textContent = realises;
  document.getElementById('kpi-contacts').textContent = contacts;
  document.getElementById('kpi-objectif').textContent = objAnnuel;
  document.getElementById('kpi-rate').textContent = taux + ' %';

  const tbody = document.querySelector('#perf-table tbody');
  tbody.innerHTML = '';
  state.sources.forEach(src => {
    const cible = state.objectifs.filter(o => o.source_id === src.id).reduce((s, o) => s + (o.cible_contacts || 0), 0);
    const realise = evAnnee.filter(e => e.source_id === src.id).reduce((s, e) => s + (e.resultat_contacts || 0), 0);
    const ecart = realise - cible;
    const tauxSrc = cible > 0 ? Math.round((realise / cible) * 100) : 0;
    const statut = cible === 0 ? '—' : (realise >= cible ? 'Atteint' : 'En cours');
    const statutClass = statut === 'Atteint' ? 'badge-success' : (statut === 'En cours' ? 'badge-warning' : '');
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${src.nom}</strong></td>
      <td>${cible}</td>
      <td>${realise}</td>
      <td>${ecart >= 0 ? '+' : ''}${ecart}</td>
      <td>${tauxSrc} %</td>
      <td><span class="badge ${statutClass}">${statut}</span></td>
    `;
    tbody.appendChild(tr);
  });
}

function renderCalendar() {
  const container = document.getElementById('calendar-grid');
  container.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'cal-row cal-header';
  header.innerHTML = '<div class="cal-cell cal-source-header">Source</div>' +
    MOIS_COURT.map((m, i) => {
      const vac = (i === 6 || i === 7) ? ' cal-vacation' : '';
      return '<div class="cal-cell cal-month-header' + vac + '">' + m + '</div>';
    }).join('');
  container.appendChild(header);

  const evAnnee = state.evenements.filter(e => new Date(e.date_evenement).getFullYear() === state.annee);

  state.sources.forEach(src => {
    const row = document.createElement('div');
    row.className = 'cal-row';
    let html = '<div class="cal-cell cal-source-label">' + src.nom + '</div>';

    for (let m = 0; m < 12; m++) {
      const isVac = m === 6 || m === 7;
      const evs = evAnnee.filter(e => e.source_id === src.id && new Date(e.date_evenement).getMonth() === m);
      if (isVac) {
        html += '<div class="cal-cell cal-vacation"></div>';
      } else if (evs.length > 0) {
        html += '<div class="cal-cell cal-filled" data-evs=\'' + JSON.stringify(evs.map(e => e.id)) + '\'><span class="cal-count">' + evs.length + '</span></div>';
      } else {
        html += '<div class="cal-cell cal-empty" data-source="' + src.id + '" data-month="' + m + '"></div>';
      }
    }
    row.innerHTML = html;
    container.appendChild(row);
  });

  container.querySelectorAll('.cal-empty').forEach(cell => {
    cell.addEventListener('click', () => {
      const srcId = parseInt(cell.dataset.source);
      const month = parseInt(cell.dataset.month);
      const date = new Date(state.annee, month, 15).toISOString().split('T')[0];
      const src = state.sources.find(s => s.id === srcId);
      openModal({
        source_id: srcId,
        date_evenement: date,
        quoi: src.nom + ' ' + MOIS[month].toLowerCase()
      });
    });
  });

  container.querySelectorAll('.cal-filled').forEach(cell => {
    cell.addEventListener('click', () => {
      const ids = JSON.parse(cell.dataset.evs);
      if (ids.length === 1) {
        const ev = state.evenements.find(e => e.id === ids[0]);
        openModal(ev);
      } else {
        document.querySelector('.tab[data-tab="events"]').click();
      }
    });
  });
}

function renderEventsTable() {
  const tbody = document.querySelector('#events-table tbody');
  tbody.innerHTML = '';
  if (state.evenements.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty">Aucun événement, créez le premier avec le bouton ci-dessus.</td></tr>';
    return;
  }
  state.evenements.forEach(ev => {
    const src = state.sources.find(s => s.id === ev.source_id);
    const resp = state.utilisateurs.find(u => u.id === ev.responsable_id);
    const statut = statutEvenement(ev);
    const statutClass = statut === 'Objectif atteint' ? 'badge-success' : (statut === 'Objectif non atteint' ? 'badge-danger' : 'badge-info');
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${new Date(ev.date_evenement).toLocaleDateString('fr-FR')}</td>
      <td>${ev.quoi}</td>
      <td>${src?.nom || '—'}</td>
      <td>${resp ? (resp.prenom || '') + ' ' + (resp.nom || '') : '—'}</td>
      <td>${ev.objectif_contacts || 0}</td>
      <td>${ev.resultat_contacts ?? '—'}</td>
      <td><span class="badge ${statutClass}">${statut}</span></td>
      <td><button class="btn-link" data-id="${ev.id}">Modifier</button></td>
    `;
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll('.btn-link').forEach(btn => {
    btn.addEventListener('click', () => {
      const ev = state.evenements.find(e => e.id === parseInt(btn.dataset.id));
      openModal(ev);
    });
  });
}

function renderObjectifsTable() {
  const tbody = document.querySelector('#objectifs-table tbody');
  tbody.innerHTML = '';
  state.sources.forEach(src => {
    const p1 = state.objectifs.find(o => o.source_id === src.id && o.periode === 'P1');
    const p2 = state.objectifs.find(o => o.source_id === src.id && o.periode === 'P2');
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${src.nom}</strong></td>
      <td><input type="number" class="obj-input" data-source="${src.id}" data-periode="P1" value="${p1?.cible_contacts || 0}" min="0"></td>
      <td><input type="number" class="obj-input" data-source="${src.id}" data-periode="P2" value="${p2?.cible_contacts || 0}" min="0"></td>
      <td><strong>${(p1?.cible_contacts || 0) + (p2?.cible_contacts || 0)}</strong></td>
    `;
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll('.obj-input').forEach(input => {
    input.addEventListener('change', async () => {
      const srcId = parseInt(input.dataset.source);
      const periode = input.dataset.periode;
      const cible = parseInt(input.value) || 0;
      const existing = state.objectifs.find(o => o.source_id === srcId && o.periode === periode);
      if (existing) {
        await sb.from('objectifs').update({ cible_contacts: cible }).eq('id', existing.id);
      } else {
        await sb.from('objectifs').insert([{ source_id: srcId, periode, cible_contacts: cible }]);
      }
      await loadData();
      renderObjectifsTable();
      renderDashboard();
      showToast('Objectif mis à jour', 'success');
    });
  });
}

init();
