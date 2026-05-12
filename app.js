const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const MOIS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
const MOIS_COURT = ['Janv','Févr','Mars','Avr','Mai','Juin','Juil','Août','Sept','Oct','Nov','Déc'];
const ACTIVITES = ['Appels / Contacts','RDV effectués','Propositions envoyées'];

let state = {
  user: null,
  sources: [], utilisateurs: [], objectifs: [], evenements: [], affaires: [], suivi: [],
  objectifsAnnuels: [],
  annee: new Date().getFullYear(),
  hebdo_annee: new Date().getFullYear(),
  hebdo_semaine: getCurrentWeek(),
  cal_annee: new Date().getFullYear(),
  obj_annee: new Date().getFullYear()
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
  setupNav();
  setupModal();
  setupModalAffaire();
  setupModalPeriode();
  setupHebdo();
  setupYearSelectors();
  renderAll();
}

async function loadData() {
  const [sources, utilisateurs, objectifs, evenements, affaires, suivi, objAnnuels] = await Promise.all([
    sb.from('sources').select('*').order('id'),
    sb.from('utilisateurs').select('*').order('prenom'),
    sb.from('objectifs').select('*'),
    sb.from('evenements').select('*').order('date_evenement', { ascending: false }),
    sb.from('affaires').select('*').order('updated_at', { ascending: false }),
    sb.from('suivi_hebdo').select('*'),
    sb.from('objectifs_annuels').select('*').order('annee', { ascending: false })
  ]);
  state.sources = sources.data || [];
  state.utilisateurs = utilisateurs.data || [];
  state.objectifs = objectifs.data || [];
  state.evenements = evenements.data || [];
  state.affaires = affaires.data || [];
  state.suivi = suivi.data || [];
  state.objectifsAnnuels = objAnnuels.data || [];
}

function statutEvenement(ev) {
  if (ev.resultat_contacts === null || ev.resultat_contacts === undefined) return 'À venir';
  return ev.resultat_contacts >= (ev.objectif_contacts || 0) ? 'Objectif atteint' : 'Objectif non atteint';
}

function formatEuro(n) { return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(n || 0); }

function fillYearSelect(selectEl, current, range = 3) {
  selectEl.innerHTML = '';
  const currentYear = new Date().getFullYear();
  for (let y = currentYear - 1; y <= currentYear + range; y++) {
    const opt = document.createElement('option');
    opt.value = y; opt.textContent = y;
    if (y === current) opt.selected = true;
    selectEl.appendChild(opt);
  }
}

function setupYearSelectors() {
  const dashYear = document.getElementById('dash-year');
  fillYearSelect(dashYear, state.annee);
  dashYear.addEventListener('change', e => {
    state.annee = parseInt(e.target.value);
    renderDashboard();
  });

  const calYear = document.getElementById('year-select');
  fillYearSelect(calYear, state.cal_annee);
  calYear.addEventListener('change', e => {
    state.cal_annee = parseInt(e.target.value);
    renderCalendar();
  });

  const objYear = document.getElementById('obj-year');
  fillYearSelect(objYear, state.obj_annee);
  objYear.addEventListener('change', e => {
    state.obj_annee = parseInt(e.target.value);
    renderObjectifsAnnuels();
  });
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
    await sb.auth.signOut(); window.location.href = 'index.html';
  });
  document.getElementById('btn-add-event').addEventListener('click', () => openModal());
  document.getElementById('btn-add-from-cal').addEventListener('click', () => openModal());
  document.getElementById('btn-add-affaire').addEventListener('click', () => openModalAffaire());
  document.getElementById('btn-add-periode').addEventListener('click', () => openModalPeriode());
}

function setupHebdo() {
  const yearSel = document.getElementById('hebdo-year');
  const weekSel = document.getElementById('hebdo-week');
  fillYearSelect(yearSel, state.hebdo_annee);
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

function setupModalPeriode() {
  document.getElementById('modal-periode-close').addEventListener('click', closeModalPeriode);
  document.getElementById('modal-periode').addEventListener('click', (e) => { if (e.target.id === 'modal-periode') closeModalPeriode(); });
  document.getElementById('periode-form').addEventListener('submit', savePeriode);
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

function openModalPeriode() {
  document.getElementById('periode-form').reset();
  document.getElementById('modal-periode').classList.remove('hidden');
}

function closeModalPeriode() { document.getElementById('modal-periode').classList.add('hidden'); }

async function savePeriode(e) {
  e.preventDefault();
  const code = document.getElementById('periode-code').value.trim().toUpperCase();
  const commentaire = document.getElementById('periode-commentaire').value;
  if (!code) return;
  const exists = state.objectifsAnnuels.find(o => o.annee === state.obj_annee && o.periode_msi === code);
  if (exists) { showToast('Cette période existe déjà', 'error'); return; }
  const { error } = await sb.from('objectifs_annuels').insert([{
    annee: state.obj_annee, periode_msi: code, ca_cible: 0, msi_cible: 0, commentaire
  }]);
  if (error) showToast('Erreur : ' + error.message, 'error');
  else { showToast('Période ajoutée', 'success'); closeModalPeriode(); await loadData(); renderObjectifsAnnuels(); renderDashboard(); }
}

function showToast(msg, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = 'toast toast-' + type;
  setTimeout(() => toast.classList.add('hidden'), 3000);
}

function renderAll() {
  renderDashboard();
  renderHebdo();
  renderAffaires();
  renderCalendar();
  renderEventsTable();
  renderObjectifsAnnuels();
  renderObjectifsTable();
}

function renderDashboard() {
  const yearStart = new Date(state.annee, 0, 1);
  const yearEnd = new Date(state.annee, 11, 31);
  const affairesAnnee = state.affaires.filter(a => {
    const periodeStr = a.periode_msi || '';
    return periodeStr.includes(String(state.annee).substring(2)) || true;
  });

  const objAnnuelGlobal = state.objectifsAnnuels.find(o => o.annee === state.annee && o.periode_msi === 'ANNUEL');
  const caObjectif = objAnnuelGlobal?.ca_cible || 0;
  const msiObjectif = objAnnuelGlobal?.msi_cible || 0;

  const affairesActives = state.affaires.filter(a => !['Contrat refusé'].includes(a.etat));
  const affairesGagnees = state.affaires.filter(a => a.etat === 'Contrat validé');
  const propEnvoyees = state.affaires.filter(a => ['Proposition envoyée','Négociation en cours','Contrat validé','Contrat refusé'].includes(a.etat));
  const totalRDV = state.suivi.filter(s => s.type_activite === 'RDV effectués' && s.annee === state.annee).reduce((sum, s) => sum + (s.nombre || 0), 0);
  const totalProp = propEnvoyees.length;
  const caEnCours = affairesActives.filter(a => a.etat !== 'Contrat validé').reduce((s, a) => s + (a.montant * a.niveau_confiance || 0), 0);
  const caSigne = affairesGagnees.reduce((s, a) => s + (a.montant || 0), 0);
  const tauxProp = totalRDV > 0 ? Math.round((totalProp / totalRDV) * 100) : 0;
  const tauxSign = totalProp > 0 ? Math.round((affairesGagnees.length / totalProp) * 100) : 0;
  const atteinteCA = caObjectif > 0 ? Math.round((caSigne / caObjectif) * 100) : 0;

  document.getElementById('kpi-rdv').textContent = totalRDV;
  document.getElementById('kpi-propositions').textContent = totalProp;
  document.getElementById('kpi-ca-cours').textContent = formatEuro(caEnCours);
  document.getElementById('kpi-ca-signe').textContent = formatEuro(caSigne);
  document.getElementById('kpi-ca-objectif').textContent = formatEuro(caObjectif);
  document.getElementById('kpi-atteinte-ca').textContent = atteinteCA + ' %';
  document.getElementById('kpi-msi-signe').textContent = affairesGagnees.length;
  document.getElementById('kpi-msi-objectif').textContent = msiObjectif;

  const periodesAnnee = state.objectifsAnnuels.filter(o => o.annee === state.annee && o.periode_msi !== 'ANNUEL');
  const tbodyPer = document.querySelector('#periodes-table tbody');
  tbodyPer.innerHTML = '';
  if (periodesAnnee.length === 0) {
    tbodyPer.innerHTML = '<tr><td colspan="7" class="empty">Aucune période définie pour ' + state.annee + '. Allez dans Objectifs pour les ajouter.</td></tr>';
  } else {
    periodesAnnee.forEach(p => {
      const affairesPeriode = state.affaires.filter(a => a.periode_msi === p.periode_msi);
      const caSignePer = affairesPeriode.filter(a => a.etat === 'Contrat validé').reduce((s, a) => s + (a.montant || 0), 0);
      const caCoursPer = affairesPeriode.filter(a => !['Contrat validé','Contrat refusé'].includes(a.etat)).reduce((s, a) => s + (a.montant * a.niveau_confiance || 0), 0);
      const msiSignePer = affairesPeriode.filter(a => a.etat === 'Contrat validé').length;
      const atteintePer = p.ca_cible > 0 ? Math.round((caSignePer / p.ca_cible) * 100) : 0;
      const cls = atteintePer >= 100 ? 'badge-success' : (atteintePer >= 50 ? 'badge-warning' : 'badge-info');
      const tr = document.createElement('tr');
      tr.innerHTML = `<td><strong>${p.periode_msi}</strong></td><td>${formatEuro(p.ca_cible)} €</td><td>${formatEuro(caSignePer)} €</td><td>${formatEuro(caCoursPer)} €</td><td><span class="badge ${cls}">${atteintePer} %</span></td><td>${p.msi_cible}</td><td>${msiSignePer}</td>`;
      tbodyPer.appendChild(tr);
    });
  }

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
  if (state.utilisateurs.length === 0) {
    tbody2.innerHTML = '<tr><td colspan="5" class="empty">Aucun commercial enregistré.</td></tr>';
  } else {
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
      html += `<td><input type="number" class="hebdo-input" data-user="${u.id}" data-activite="${act}" value="${val}" min="0" style="width:80px;padding:6px 8px;border:1px solid #D3D1C7;border-radius:4px;"></td>`;
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
  const evAnnee = state.evenements.filter(e => new Date(e.date_evenement).getFullYear() === state.cal_annee);
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
      const date = new Date(state.cal_annee, month, 15).toISOString().split('T')[0];
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

function renderObjectifsAnnuels() {
  const tbody = document.querySelector('#obj-annuels-table tbody');
  tbody.innerHTML = '';
  const list = state.objectifsAnnuels.filter(o => o.annee === state.obj_annee);

  let hasAnnuel = list.find(o => o.periode_msi === 'ANNUEL');
  if (!hasAnnuel) {
    const tr = document.createElement('tr');
    tr.style.background = '#FFF9E6';
    tr.innerHTML = `<td><strong>ANNUEL</strong> <span class="badge badge-warning">À créer</span></td>
      <td><input type="number" class="obj-annuel-input" data-periode="ANNUEL" data-field="ca_cible" value="0" min="0"></td>
      <td><input type="number" class="obj-annuel-input" data-periode="ANNUEL" data-field="msi_cible" value="0" min="0"></td>
      <td><input type="text" class="obj-annuel-input" data-periode="ANNUEL" data-field="commentaire" placeholder="Objectif global ${state.obj_annee}"></td>
      <td></td>`;
    tbody.appendChild(tr);
  }

  const sorted = [...list].sort((a, b) => {
    if (a.periode_msi === 'ANNUEL') return -1;
    if (b.periode_msi === 'ANNUEL') return 1;
    return (a.periode_msi || '').localeCompare(b.periode_msi || '');
  });

  sorted.forEach(obj => {
    const tr = document.createElement('tr');
    const isAnnuel = obj.periode_msi === 'ANNUEL';
    if (isAnnuel) tr.style.background = '#F0F4F9';
    tr.innerHTML = `<td><strong>${obj.periode_msi}</strong></td>
      <td><input type="number" class="obj-annuel-input" data-id="${obj.id}" data-field="ca_cible" value="${obj.ca_cible || 0}" min="0"></td>
      <td><input type="number" class="obj-annuel-input" data-id="${obj.id}" data-field="msi_cible" value="${obj.msi_cible || 0}" min="0"></td>
      <td><input type="text" class="obj-annuel-input" data-id="${obj.id}" data-field="commentaire" value="${obj.commentaire || ''}"></td>
      <td>${isAnnuel ? '' : `<button class="btn-icon" data-delete="${obj.id}" title="Supprimer">✕</button>`}</td>`;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('.obj-annuel-input').forEach(input => {
    input.addEventListener('change', async () => {
      const id = input.dataset.id;
      const periode = input.dataset.periode;
      const field = input.dataset.field;
      const val = field === 'commentaire' ? input.value : (parseFloat(input.value) || 0);

      if (id) {
        await sb.from('objectifs_annuels').update({ [field]: val, updated_at: new Date().toISOString() }).eq('id', id);
      } else if (periode === 'ANNUEL') {
        const obj = { annee: state.obj_annee, periode_msi: 'ANNUEL', ca_cible: 0, msi_cible: 0, commentaire: '' };
        obj[field] = val;
        await sb.from('objectifs_annuels').insert([obj]);
      }
      await loadData(); renderObjectifsAnnuels(); renderDashboard();
      showToast('Objectif mis à jour', 'success');
    });
  });

  tbody.querySelectorAll('[data-delete]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Supprimer cette période ?')) return;
      await sb.from('objectifs_annuels').delete().eq('id', btn.dataset.delete);
      await loadData(); renderObjectifsAnnuels(); renderDashboard();
      showToast('Période supprimée', 'success');
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
      await loadData(); renderObjectifsTable();
      showToast('Objectif mis à jour', 'success');
    });
  });
}

init();
