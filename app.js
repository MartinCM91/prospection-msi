const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const MOIS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
const MOIS_COURT = ['Janv','Févr','Mars','Avr','Mai','Juin','Juil','Août','Sept','Oct','Nov','Déc'];
const ACTIVITES = ['Appels / Contacts','RDV effectués','Propositions envoyées'];

let state = {
  user: null, sources: [], utilisateurs: [], objectifs: [], evenements: [], affaires: [], suivi: [],
  annee: new Date().getFullYear(),
  hebdo_annee: new Date().getFullYear(),
  hebdo_semaine: getCurrentWeek()
};

function getCurrentWeek() {
  const d = new Date();
  const onejan = new Date(d.getFullYear(), 0, 1);
  return Math.ceil((((d - onejan) / 86400000) + onejan.getDay() + 1) / 7);
}

async function init() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { window.location.href = 'index.html'; return; }
  state.user = session.user;
  const { data: profil } = await sb.from('utilisateurs').select('*').eq('id', state.user.id).single();
  document.getElementById('user-info').textContent = (profil?.prenom || '') + ' ' + (profil?.nom || '');
  await loadData();
  setupNav(); setupModal(); setupModalAffaire(); setupHebdo();
  renderAll();
}

async function loadData() {
  const [sources, utilisateurs, objectifs, evenements, affaires, suivi] = await Promise.all([
    sb.from('sources').select('*').order('id'),
    sb.from('utilisateurs').select('*').order('prenom'),
    sb.from('objectifs').select('*'),
    sb.from('evenements').select('*').order('date_evenement', { ascending: false }),
    sb.from('affaires').select('*').order('updated_at', { ascending: false }),
    sb.from('suivi_hebdo').select('*')
  ]);
  state.sources = sources.data || [];
  state.utilisateurs = utilisateurs.data || [];
  state.objectifs = objectifs.data || [];
  state.evenements = evenements.data || [];
  state.affaires = affaires.data || [];
  state.suivi = suivi.data || [];
}

function statutEvenement(ev) {
  if (ev.resultat_contacts === null || ev.resultat_contacts === undefined) return 'À venir';
  return ev.resultat_contacts >= (ev.objectif_contacts || 0) ? 'Objectif atteint' : 'Objectif non atteint';
}

function formatEuro(n) { return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(n || 0); }

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
    await sb.auth.signOut(); window.location.href = 'index.html';
  });
  document.getElementById('btn-add-event').addEventListener('click', () => openModal());
  document.getElementById('btn-add-from-cal').addEventListener('click', () => openModal());
  document.getElementById('btn-add-affaire').addEventListener('click', () => openModalAffaire());

  const yearSelect = document.getElementById('year-select');
  const currentYear = new Date().getFullYear();
  for (let y = currentYear - 1; y <= currentYear + 1; y++) {
    const opt = document.createElement('option');
    opt.value = y; opt.textContent = y;
    if (y === state.annee) opt.selected = true;
    yearSelect.appendChild(opt);
  }
  yearSelect.addEventListener('change', (e) => {
    state.annee = parseInt(e.target.value);
    renderCalendar(); renderDashboard();
  });
}

function setupHebdo() {
  const yearSel = document.getElementById('hebdo-year');
  const weekSel = document.getElementById('hebdo-week');
  const currentYear = new Date().getFullYear();
  for (let y = currentYear - 1; y <= currentYear + 1; y++) {
    const opt = document.createElement('option');
    opt.value = y; opt.textContent = y;
    if (y === state.hebdo_annee) opt.selected = true;
    yearSel.appendChild(opt);
  }
  for (let w = 1; w <= 53; w++) {
    const opt = document.createElement('option');
    opt.value = w; opt.textContent = 'S' + w;
    if (w === state.hebdo_semaine) opt.selected = true;
    weekSel.appendChild(opt);
  }
  yearSel.addEventListener('change', e => { state.hebdo_annee = parseInt(e.target.value); renderHebdo(); });
  weekSel.addEventListener('change', e => { state.hebdo_semaine = parseInt(e.target.value); renderHebdo(); });
}

function setupModal() {
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });
  document.getElementById('event-form').addEventListener('submit', saveEvent);
  document.getElementById('btn-delete').addEventListener('click', deleteEvent);
}

function setupModalAffaire() {
  document.getElementById('modal-affaire-close').addEventListener('click', closeModalAffaire);
  document.getElementById('modal-affaire').addEventListener('click', (e) => { if (e.target.id === 'modal-affaire') closeModalAffaire(); });
  document.getElementById('affaire-form').addEventListener('submit', saveAffaire);
  document.getElementById('btn-delete-affaire').addEventListener('click', deleteAffaire);
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
    opt.value = s.id; opt.textContent = s.nom;
    if (prefill.source_id === s.id) opt.selected = true;
    srcSelect.appendChild(opt);
  });
  const respSelect = document.getElementById('event-responsable');
  respSelect.innerHTML = '<option value="">Choisir...</option>';
  state.utilisateurs.forEach(u => {
    const opt = document.createElement('option');
    opt.value = u.id; opt.textContent = (u.prenom || '') + ' ' + (u.nom || '');
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

function closeModal() { document.getElementById('modal').classList.add('hidden'); }

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
  const { error } = id ? await sb.from('evenements').update(data).eq('id', id) : await sb.from('evenements').insert([data]);
  if (error) showToast('Erreur : ' + error.message, 'error');
  else { showToast(id ? 'Événement modifié' : 'Événement créé', 'success'); closeModal(); await loadData(); renderAll(); }
}

async function deleteEvent() {
  const id = document.getElementById('event-id').value;
  if (!id || !confirm('Supprimer cet événement ?')) return;
  const { error } = await sb.from('evenements').delete().eq('id', id);
  if (error) showToast('Erreur : ' + error.message, 'error');
  else { showToast('Événement supprimé', 'success'); closeModal(); await loadData(); renderAll(); }
}

function openModalAffaire(prefill = {}) {
  const form = document.getElementById('affaire-form');
  form.reset();
  document.getElementById('affaire-id').value = prefill.id || '';
  document.getElementById('modal-affaire-title').textContent = prefill.id ? 'Modifier affaire' : 'Nouvelle affaire';
  document.getElementById('btn-delete-affaire').classList.toggle('hidden', !prefill.id);
  const respSelect = document.getElementById('affaire-responsable');
  respSelect.innerHTML = '<option value="">Choisir...</option>';
  state.utilisateurs.forEach(u => {
    const opt = document.createElement('option');
    opt.value = u.id; opt.textContent = (u.prenom || '') + ' ' + (u.nom || '');
    if (prefill.responsable_id === u.id || (!prefill.id && u.id === state.user.id)) opt.selected = true;
    respSelect.appendChild(opt);
  });
  if (prefill.id) {
    document.getElementById('affaire-client').value = prefill.client || '';
    document.getElementById('affaire-type').value = prefill.type_client || 'Prospect';
    document.getElementById('affaire-intitule').value = prefill.intitule || '';
    document.getElementById('affaire-numero').value = prefill.numero_affaire || '';
    document.getElementById('affaire-etat').value = prefill.etat || 'Qualification';
    document.getElementById('affaire-confiance').value = prefill.niveau_confiance ?? 0.5;
    document.getElementById('affaire-montant').value = prefill.montant || 0;
    document.getElementById('affaire-periode').value = prefill.periode_msi || '';
    document.getElementById('affaire-raison').value = prefill.raison_refus || '';
    document.getElementById('affaire-notes').value = prefill.notes || '';
  }
  document.getElementById('modal-affaire').classList.remove('hidden');
}

function closeModalAffaire() { document.getElementById('modal-affaire').classList.add('hidden'); }

async function saveAffaire(e) {
  e.preventDefault();
  const id = document.getElementById('affaire-id').value;
  const data = {
    client: document.getElementById('affaire-client').value,
    type_client: document.getElementById('affaire-type').value,
    intitule: document.getElementById('affaire-intitule').value,
    numero_affaire: document.getElementById('affaire-numero').value || null,
    responsable_id: document.getElementById('affaire-responsable').value || null,
    etat: document.getElementById('affaire-etat').value,
    niveau_confiance: parseFloat(document.getElementById('affaire-confiance').value) || 0,
    montant: parseFloat(document.getElementById('affaire-montant').value) || 0,
    periode_msi: document.getElementById('affaire-periode').value || null,
    raison_refus: document.getElementById('affaire-raison').value || null,
    notes: document.getElementById('affaire-notes').value || null,
    updated_at: new Date().toISOString()
  };
  const { error } = id ? await sb.from('affaires').update(data).eq('id', id) : await sb.from('affaires').insert([data]);
  if (error) showToast('Erreur : ' + error.message, 'error');
  else { showToast(id ? 'Affaire modifiée' : 'Affaire créée', 'success'); closeModalAffaire(); await loadData(); renderAll(); }
}

async function deleteAffaire() {
  const id = document.getElementById('affaire-id').value;
  if (!id || !confirm('Supprimer cette affaire ?')) return;
  const { error } = await sb.from('affaires').delete().eq('id', id);
  if (error) showToast('Erreur : ' + error.message, 'error');
  else { showToast('Affaire supprimée', 'success'); closeModalAffaire(); await loadData(); renderAll(); }
}

function showToast(msg, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = 'toast toast-' + type;
  setTimeout(() => toast.classList.add('hidden'), 3000);
}

function renderAll() { renderDashboard(); renderHebdo(); renderAffaires(); renderCalendar(); renderEventsTable(); renderObjectifsTable(); }

function renderDashboard() {
  const affairesActives = state.affaires.filter(a => !['Contrat refusé'].includes(a.etat));
  const affairesGagnees = state.affaires.filter(a => a.etat === 'Contrat validé');
  const propEnvoyees = state.affaires.filter(a => ['Proposition envoyée','Négociation en cours','Contrat validé','Contrat refusé'].includes(a.etat));
  const totalRDV = state.suivi.filter(s => s.type_activite === 'RDV effectués').reduce((sum, s) => sum + (s.nombre || 0), 0);
  const totalProp = propEnvoyees.length;
  const caEnCours = affairesActives.filter(a => a.etat !== 'Contrat validé').reduce((s, a) => s + (a.montant * a.niveau_confiance || 0), 0);
  const caSigne = affairesGagnees.reduce((s, a) => s + (a.montant || 0), 0);
  const tauxProp = totalRDV > 0 ? Math.round((totalProp / totalRDV) * 100) : 0;
  const tauxSign = totalProp > 0 ? Math.round((affairesGagnees.length / totalProp) * 100) : 0;
  document.getElementById('kpi-rdv').textContent = totalRDV;
  document.getElementById('kpi-propositions').textContent = totalProp;
  document.getElementById('kpi-ca-cours').textContent = formatEuro(caEnCours);
  document.getElementById('kpi-ca-signe').textContent = formatEuro(caSigne);
  document.getElementById('kpi-taux-prop').textContent = tauxProp + ' %';
  document.getElementById('kpi-taux-sign').textContent = tauxSign + ' %';
  document.getElementById('kpi-affaires-gagne').textContent = affairesGagnees.length;

  const etats = ['Qualification','Expression de besoin','Proposition envoyée','Négociation en cours','Contrat validé','Contrat refusé'];
  const tbody = document.querySelector('#etats-table tbody');
  tbody.innerHTML = '';
  etats.forEach(etat => {
    const list = state.affaires.filter(a => a.etat === etat);
    const total = list.reduce((s, a) => s + (a.montant || 0), 0);
    const pondere = list.reduce((s, a) => s + (a.montant * a.niveau_confiance || 0), 0);
    const cls = etat === 'Contrat validé' ? 'badge-success' : (etat === 'Contrat refusé' ? 'badge-danger' : 'badge-info');
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><span class="badge ${cls}">${etat}</span></td><td>${list.length}</td><td>${formatEuro(total)} €</td><td>${formatEuro(pondere)} €</td>`;
    tbody.appendChild(tr);
  });

  const tbody2 = document.querySelector('#commerciaux-table tbody');
  tbody2.innerHTML = '';
  state.utilisateurs.forEach(u => {
    const rdv = state.suivi.filter(s => s.utilisateur_id === u.id && s.type_activite === 'RDV effectués').reduce((sum, s) => sum + (s.nombre || 0), 0);
    const prop = state.suivi.filter(s => s.utilisateur_id === u.id && s.type_activite === 'Propositions envoyées').reduce((sum, s) => sum + (s.nombre || 0), 0);
    const cours = state.affaires.filter(a => a.responsable_id === u.id && !['Contrat validé','Contrat refusé'].includes(a.etat)).reduce((s, a) => s + (a.montant * a.niveau_confiance || 0), 0);
    const signe = state.affaires.filter(a => a.responsable_id === u.id && a.etat === 'Contrat validé').reduce((s, a) => s + (a.montant || 0), 0);
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><strong>${u.prenom || ''} ${u.nom || ''}</strong></td><td>${rdv}</td><td>${prop}</td><td>${formatEuro(cours)} €</td><td>${formatEuro(signe)} €</td>`;
    tbody2.appendChild(tr);
  });
}

function renderHebdo() {
  const tbody = document.querySelector('#hebdo-table tbody');
  tbody.innerHTML = '';
  if (state.utilisateurs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty">Aucun utilisateur. Connectez-vous d\'abord avec chaque commercial.</td></tr>';
    return;
  }
  state.utilisateurs.forEach(u => {
    const tr = document.createElement('tr');
    let total = 0;
    let html = `<td><strong>${u.prenom || ''} ${u.nom || ''}</strong></td>`;
    ACTIVITES.forEach(act => {
      const rec = state.suivi.find(s => s.utilisateur_id === u.id && s.annee === state.hebdo_annee && s.semaine === state.hebdo_semaine && s.type_activite === act);
      const val = rec?.nombre ?? 0;
      total += val;
      html += `<td><input type="number" class="hebdo-input" data-user="${u.id}" data-activite="${act}" value="${val}" min="0" style="width:80px;"></td>`;
    });
    html += `<td><strong>${total}</strong></td>`;
    tr.innerHTML = html;
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll('.hebdo-input').forEach(input => {
    input.addEventListener('change', async () => {
      const userId = input.dataset.user;
      const activite = input.dataset.activite;
      const nombre = parseInt(input.value) || 0;
      const existing = state.suivi.find(s => s.utilisateur_id === userId && s.annee === state.hebdo_annee && s.semaine === state.hebdo_semaine && s.type_activite === activite);
      if (existing) await sb.from('suivi_hebdo').update({ nombre, updated_at: new Date().toISOString() }).eq('id', existing.id);
      else await sb.from('suivi_hebdo').insert([{ utilisateur_id: userId, annee: state.hebdo_annee, semaine: state.hebdo_semaine, type_activite: activite, nombre }]);
      await loadData(); renderHebdo(); renderDashboard();
      showToast('Enregistré', 'success');
    });
  });

  const tbody2 = document.querySelector('#hebdo-recap-table tbody');
  tbody2.innerHTML = '';
  const startWeek = Math.max(1, state.hebdo_semaine - 3);
  state.utilisateurs.forEach(u => {
    const cumul = {};
    ACTIVITES.forEach(act => {
      cumul[act] = state.suivi.filter(s => s.utilisateur_id === u.id && s.annee === state.hebdo_annee && s.semaine >= startWeek && s.semaine <= state.hebdo_semaine && s.type_activite === act).reduce((sum, s) => sum + (s.nombre || 0), 0);
    });
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><strong>${u.prenom || ''} ${u.nom || ''}</strong></td><td>${cumul['Appels / Contacts']}</td><td>${cumul['RDV effectués']}</td><td>${cumul['Propositions envoyées']}</td>`;
    tbody2.appendChild(tr);
  });
}

function renderAffaires() {
  const tbody = document.querySelector('#affaires-table tbody');
  tbody.innerHTML = '';
  if (state.affaires.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty">Aucune affaire. Créez la première avec le bouton ci-dessus.</td></tr>';
    return;
  }
  state.affaires.forEach(a => {
    const resp = state.utilisateurs.find(u => u.id === a.responsable_id);
    const pondere = (a.montant || 0) * (a.niveau_confiance || 0);
    const cls = a.etat === 'Contrat validé' ? 'badge-success' : (a.etat === 'Contrat refusé' ? 'badge-danger' : 'badge-info');
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><strong>${a.client}</strong></td><td>${a.intitule}</td><td>${resp ? (resp.prenom||'')+' '+(resp.nom||'') : '—'}</td><td><span class="badge ${cls}">${a.etat}</span></td><td>${formatEuro(a.montant)} €</td><td>${Math.round((a.niveau_confiance || 0) * 100)} %</td><td>${formatEuro(pondere)} €</td><td>${a.periode_msi || '—'}</td><td><button class="btn-link" data-id="${a.id}">Modifier</button></td>`;
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll('.btn-link').forEach(btn => {
    btn.addEventListener('click', () => {
      const a = state.affaires.find(x => x.id === parseInt(btn.dataset.id));
      openModalAffaire(a);
    });
  });
}

function renderCalendar() {
  const container = document.getElementById('calendar-grid');
  container.innerHTML = '';
  const header = document.createElement('div');
  header.className = 'cal-row cal-header';
  header.innerHTML = '<div class="cal-cell cal-source-header">Source</div>' +
    MOIS_COURT.map((m, i) => `<div class="cal-cell cal-month-header${(i===6||i===7)?' cal-vacation':''}">${m}</div>`).join('');
  container.appendChild(header);
  const evAnnee = state.evenements.filter(e => new Date(e.date_evenement).getFullYear() === state.annee);
  state.sources.forEach(src => {
    const row = document.createElement('div');
    row.className = 'cal-row';
    let html = '<div class="cal-cell cal-source-label">' + src.nom + '</div>';
    for (let m = 0; m < 12; m++) {
      const isVac = m === 6 || m === 7;
      const evs = evAnnee.filter(e => e.source_id === src.id && new Date(e.date_evenement).getMonth() === m);
      if (isVac) html += '<div class="cal-cell cal-vacation"></div>';
      else if (evs.length > 0) html += '<div class="cal-cell cal-filled" data-evs=\'' + JSON.stringify(evs.map(e=>e.id)) + '\'><span class="cal-count">' + evs.length + '</span></div>';
      else html += '<div class="cal-cell cal-empty" data-source="' + src.id + '" data-month="' + m + '"></div>';
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
      openModal({ source_id: srcId, date_evenement: date, quoi: src.nom + ' ' + MOIS[month].toLowerCase() });
    });
  });
  container.querySelectorAll('.cal-filled').forEach(cell => {
    cell.addEventListener('click', () => {
      const ids = JSON.parse(cell.dataset.evs);
      if (ids.length === 1) { const ev = state.evenements.find(e => e.id === ids[0]); openModal(ev); }
      else document.querySelector('.tab[data-tab="events"]').click();
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
    const cls = statut === 'Objectif atteint' ? 'badge-success' : (statut === 'Objectif non atteint' ? 'badge-danger' : 'badge-info');
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${new Date(ev.date_evenement).toLocaleDateString('fr-FR')}</td><td>${ev.quoi}</td><td>${src?.nom || '—'}</td><td>${resp ? (resp.prenom||'')+' '+(resp.nom||'') : '—'}</td><td>${ev.objectif_contacts || 0}</td><td>${ev.resultat_contacts ?? '—'}</td><td><span class="badge ${cls}">${statut}</span></td><td><button class="btn-link" data-id="${ev.id}">Modifier</button></td>`;
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
    tr.innerHTML = `<td><strong>${src.nom}</strong></td><td><input type="number" class="obj-input" data-source="${src.id}" data-periode="P1" value="${p1?.cible_contacts || 0}" min="0"></td><td><input type="number" class="obj-input" data-source="${src.id}" data-periode="P2" value="${p2?.cible_contacts || 0}" min="0"></td><td><strong>${(p1?.cible_contacts || 0) + (p2?.cible_contacts || 0)}</strong></td>`;
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll('.obj-input').forEach(input => {
    input.addEventListener('change', async () => {
      const srcId = parseInt(input.dataset.source);
      const periode = input.dataset.periode;
      const cible = parseInt(input.value) || 0;
      const existing = state.objectifs.find(o => o.source_id === srcId && o.periode === periode);
      if (existing) await sb.from('objectifs').update({ cible_contacts: cible }).eq('id', existing.id);
      else await sb.from('objectifs').insert([{ source_id: srcId, periode, cible_contacts: cible }]);
      await loadData(); renderObjectifsTable(); renderDashboard();
      showToast('Objectif mis à jour', 'success');
    });
  });
}

init();
