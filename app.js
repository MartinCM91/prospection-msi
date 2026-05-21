const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const MOIS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
const MOIS_COURT = ['Janv','Févr','Mars','Avr','Mai','Juin','Juil','Août','Sept','Oct','Nov','Déc'];
const ACTIVITES = ['Appels / Contacts','RDV effectués','Propositions envoyées'];
const COULEURS_CHART = ['#1F3864','#5DCAA5','#7F77DD','#F0997B','#FAC775','#ED93B1','#B4B2A9','#85B7EB'];

// Les 5 colonnes du tableau de tâches v7
const COLONNES_V7 = [
  { numero: 1, libelle: 'Recherche de leads', sublabel: 'Domaine 1', couleur: '#7F77DD', type: 'domaine' },
  { numero: 2, libelle: 'Phoning', sublabel: 'Domaine 2', couleur: '#5DCAA5', type: 'domaine' },
  { numero: 3, libelle: 'Expression de besoin', sublabel: 'Domaine 3', couleur: '#85B7EB', type: 'domaine' },
  { numero: 4, libelle: 'Suivi des propales', sublabel: 'Propositions', couleur: '#FAC775', type: 'propales' },
  { numero: 5, libelle: 'Avancement', sublabel: 'Com / Financ / Signé', couleur: '#1D9E75', type: 'avancement' }
];

let state = {
  user: null,
  produits: [], produitActif: null,
  sources: [], utilisateurs: [], objectifs: [], evenements: [], suivi: [],
  objectifsAnnuels: [], cibles: [], domaines: [], resultatsAttendus: [],
  annee: new Date().getFullYear(),
  hebdo_annee: new Date().getFullYear(),
  hebdo_semaine: getCurrentWeek(),
  cal_annee: new Date().getFullYear(),
  obj_annee: new Date().getFullYear(),
  plan_periode: '', plan_responsable: '',
  cal_filter_groupe: '',
  kpi_rdv_cible: 4, kpi_prop_cible: 8,
  draggedCibleId: null,
  expandedParents: new Set(),
  charts: {}
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

  state.kpi_rdv_cible = parseInt(localStorage.getItem('kpi_rdv_cible') || '4');
  state.kpi_prop_cible = parseInt(localStorage.getItem('kpi_prop_cible') || '8');

  await loadData();

  // Charger le produit actif depuis les préférences utilisateur
  const { data: pref } = await sb.from('preferences_utilisateur').select('*').eq('utilisateur_id', state.user.id).single();
  if (pref && pref.produit_courant_id) {
    state.produitActif = state.produits.find(p => p.id === pref.produit_courant_id);
  }
  if (!state.produitActif && state.produits.length > 0) {
    state.produitActif = state.produits[0];
  }

  setupProduitSwitcher();
  setupNav();
  setupAllModals();
  setupHebdo();
  setupYearSelectors();
  setupFilters();
  setupKpiCibles();
  renderAll();
}

async function loadData() {
  const results = await Promise.all([
    sb.from('produits').select('*').eq('actif', true).order('ordre_affichage'),
    sb.from('sources').select('*').order('ordre_affichage').order('nom'),
    sb.from('utilisateurs').select('*').order('prenom'),
    sb.from('objectifs').select('*'),
    sb.from('evenements').select('*').order('date_evenement', { ascending: false }),
    sb.from('suivi_hebdo').select('*'),
    sb.from('objectifs_annuels').select('*').order('annee', { ascending: false }),
    sb.from('cibles_msi').select('*').order('updated_at', { ascending: false }),
    sb.from('domaines_prospection').select('*').order('numero'),
    sb.from('resultats_attendus').select('*').order('ordre_affichage')
  ]);
  state.produits = results[0].data || [];
  state.sources = results[1].data || [];
  state.utilisateurs = results[2].data || [];
  state.objectifs = results[3].data || [];
  state.evenements = results[4].data || [];
  state.suivi = results[5].data || [];
  state.objectifsAnnuels = results[6].data || [];
  state.cibles = results[7].data || [];
  state.domaines = results[8].data || [];
  state.resultatsAttendus = results[9].data || [];
}

function formatEuro(n) { return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(n || 0); }

function fillYearSelect(el, current, range = 3) {
  el.innerHTML = '';
  const cy = new Date().getFullYear();
  for (let y = cy - 1; y <= cy + range; y++) {
    const o = document.createElement('option');
    o.value = y; o.textContent = y;
    if (y === current) o.selected = true;
    el.appendChild(o);
  }
}

// === Détermine la "colonne v7" d'une tâche à partir de son domaine ou statut ===
function getColonneCible(cible) {
  // Si la tâche a un statut_avancement, elle est dans la colonne 5
  if (cible.statut_avancement && ['Communication','Financement','Paiement','CRM','Signé','Perdu'].includes(cible.statut_avancement) && cible.etape >= 5) {
    return 5;
  }
  // Étape 4 = Suivi propales
  if (cible.etape === 4) return 4;
  // Étapes 1, 2, 3 = domaines
  if (cible.domaine_id) {
    const dom = state.domaines.find(d => d.id === cible.domaine_id);
    if (dom) return dom.numero;
  }
  // Fallback sur l'étape
  if (cible.etape <= 3) return cible.etape;
  return 5;
}

function setupProduitSwitcher() {
  const sel = document.getElementById('produit-select');
  sel.innerHTML = '';
  state.produits.forEach(p => {
    const o = document.createElement('option');
    o.value = p.id;
    o.textContent = p.code;
    if (state.produitActif && p.id === state.produitActif.id) o.selected = true;
    sel.appendChild(o);
  });
  sel.addEventListener('change', async e => {
    const newProduitId = parseInt(e.target.value);
    state.produitActif = state.produits.find(p => p.id === newProduitId);
    await sb.from('preferences_utilisateur').upsert({
      utilisateur_id: state.user.id,
      produit_courant_id: newProduitId,
      updated_at: new Date().toISOString()
    });
    updateProduitLabels();
    renderAll();
    showToast('Produit changé : ' + state.produitActif.code, 'success');
  });
  updateProduitLabels();
}

function updateProduitLabels() {
  if (!state.produitActif) return;
  const labels = document.querySelectorAll('#produit-actif-label, #produit-tableau-label');
  labels.forEach(el => el.textContent = state.produitActif.code);
}

function setupYearSelectors() {
  fillYearSelect(document.getElementById('dash-year'), state.annee);
  document.getElementById('dash-year').addEventListener('change', e => { state.annee = parseInt(e.target.value); renderDashboard(); });
  fillYearSelect(document.getElementById('year-select'), state.cal_annee);
  document.getElementById('year-select').addEventListener('change', e => { state.cal_annee = parseInt(e.target.value); renderCalendar(); });
  fillYearSelect(document.getElementById('obj-year'), state.obj_annee);
  document.getElementById('obj-year').addEventListener('change', e => { state.obj_annee = parseInt(e.target.value); renderObjectifsAnnuels(); });
}

function setupFilters() {
  document.getElementById('plan-periode').addEventListener('change', e => { state.plan_periode = e.target.value; renderKanban(); });
  const planResp = document.getElementById('plan-responsable');
  planResp.innerHTML = '<option value="">Tous</option>';
  state.utilisateurs.forEach(u => {
    const o = document.createElement('option');
    o.value = u.id; o.textContent = (u.prenom||'')+' '+(u.nom||'');
    planResp.appendChild(o);
  });
  planResp.addEventListener('change', e => { state.plan_responsable = e.target.value; renderKanban(); });
  document.getElementById('cal-filter-groupe').addEventListener('change', e => { state.cal_filter_groupe = e.target.value; renderCalendar(); });
}

function setupKpiCibles() {
  const r = document.getElementById('kpi-rdv-cible');
  const p = document.getElementById('kpi-prop-cible');
  r.value = state.kpi_rdv_cible;
  p.value = state.kpi_prop_cible;
  r.addEventListener('change', e => {
    state.kpi_rdv_cible = parseInt(e.target.value) || 4;
    localStorage.setItem('kpi_rdv_cible', state.kpi_rdv_cible);
    renderDashboard();
    showToast('Objectif RDV mis à jour', 'success');
  });
  p.addEventListener('change', e => {
    state.kpi_prop_cible = parseInt(e.target.value) || 8;
    localStorage.setItem('kpi_prop_cible', state.kpi_prop_cible);
    renderDashboard();
    showToast('Objectif propales mis à jour', 'success');
  });
}

function setupNav() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('tab-active'));
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      tab.classList.add('tab-active');
      document.getElementById('view-' + tab.dataset.tab).classList.add('active');
      if (tab.dataset.tab === 'dashboard') setTimeout(renderDashboardCharts, 50);
      if (tab.dataset.tab === 'hebdo') setTimeout(renderHebdoCharts, 50);
    });
  });
  document.getElementById('btn-logout').addEventListener('click', async () => { await sb.auth.signOut(); window.location.href = 'index.html'; });
  document.getElementById('btn-add-event').addEventListener('click', () => openModal());
  document.getElementById('btn-add-from-cal').addEventListener('click', () => openModal());
  document.getElementById('btn-add-periode').addEventListener('click', () => openModalPeriode());
  document.getElementById('btn-add-cible').addEventListener('click', () => openModalCible());
}

function setupHebdo() {
  const yearSel = document.getElementById('hebdo-year');
  const weekSel = document.getElementById('hebdo-week');
  fillYearSelect(yearSel, state.hebdo_annee);
  for (let w = 1; w <= 53; w++) {
    const o = document.createElement('option');
    o.value = w; o.textContent = 'S' + w;
    if (w === state.hebdo_semaine) o.selected = true;
    weekSel.appendChild(o);
  }
  yearSel.addEventListener('change', e => { state.hebdo_annee = parseInt(e.target.value); renderHebdo(); });
  weekSel.addEventListener('change', e => { state.hebdo_semaine = parseInt(e.target.value); renderHebdo(); });
}

function setupAllModals() {
  document.getElementById('modal-close').addEventListener('click', () => closeM('modal'));
  document.getElementById('modal').addEventListener('click', e => { if (e.target.id === 'modal') closeM('modal'); });
  document.getElementById('event-form').addEventListener('submit', saveEvent);
  document.getElementById('btn-delete').addEventListener('click', deleteEvent);
  document.getElementById('modal-periode-close').addEventListener('click', () => closeM('modal-periode'));
  document.getElementById('modal-periode').addEventListener('click', e => { if (e.target.id === 'modal-periode') closeM('modal-periode'); });
  document.getElementById('periode-form').addEventListener('submit', savePeriode);
  document.getElementById('modal-cible-close').addEventListener('click', () => closeM('modal-cible'));
  document.getElementById('modal-cible').addEventListener('click', e => { if (e.target.id === 'modal-cible') closeM('modal-cible'); });
  document.getElementById('cible-form').addEventListener('submit', saveCible);
  document.getElementById('btn-delete-cible').addEventListener('click', deleteCible);

  // Quand on change le domaine, mettre à jour la liste des résultats attendus
  document.getElementById('cible-domaine').addEventListener('change', e => {
    const domId = parseInt(e.target.value);
    updateResultatsSelect(domId);
  });
}

function closeM(id) { document.getElementById(id).classList.add('hidden'); }
function showToast(msg, type = 'info') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast toast-' + type;
  setTimeout(() => t.classList.add('hidden'), 3000);
}

function toggleParent(parentId) {
  if (state.expandedParents.has(parentId)) state.expandedParents.delete(parentId);
  else state.expandedParents.add(parentId);
  renderCalendar();
  renderObjectifsTable();
}

// ============================================================
// MODALE TÂCHE v7 (refonte complète)
// ============================================================
function openModalCible(prefill = {}) {
  document.getElementById('cible-form').reset();
  document.getElementById('cible-id').value = prefill.id || '';
  document.getElementById('modal-cible-title').textContent = prefill.id ? 'Modifier la tâche' : 'Nouvelle tâche';
  document.getElementById('btn-delete-cible').classList.toggle('hidden', !prefill.id);

  // Liste des domaines
  const domSel = document.getElementById('cible-domaine');
  domSel.innerHTML = '<option value="">— Choisir —</option>';
  state.domaines.forEach(d => {
    const o = document.createElement('option');
    o.value = d.id;
    o.textContent = d.numero + '. ' + d.nom;
    if (prefill.domaine_id === d.id) o.selected = true;
    domSel.appendChild(o);
  });

  // Responsable
  const respSel = document.getElementById('cible-responsable');
  respSel.innerHTML = '<option value="">—</option>';
  state.utilisateurs.forEach(u => {
    const o = document.createElement('option');
    o.value = u.id; o.textContent = (u.prenom||'')+' '+(u.nom||'');
    if (prefill.responsable_id === u.id || (!prefill.id && u.id === state.user.id)) o.selected = true;
    respSel.appendChild(o);
  });

  // Sources
  const srcSel = document.getElementById('cible-source');
  srcSel.innerHTML = '<option value="">—</option>';
  state.sources.filter(s => s.groupe !== 'OUTIL').forEach(s => {
    const o = document.createElement('option');
    o.value = s.id;
    o.textContent = (s.parent_id ? '  └ ' : '') + s.nom;
    if (prefill.source_id === s.id) o.selected = true;
    srcSel.appendChild(o);
  });

  // Résultats attendus
  updateResultatsSelect(prefill.domaine_id);
  if (prefill.resultat_attendu) {
    const sel = document.getElementById('cible-resultat-select');
    let found = false;
    for (let opt of sel.options) {
      if (opt.value === prefill.resultat_attendu) { opt.selected = true; found = true; break; }
    }
    if (!found && prefill.resultat_attendu) {
      document.getElementById('cible-resultat-libre').value = prefill.resultat_attendu;
    }
  }

  // Pré-remplir les champs
  if (prefill.id) {
    document.getElementById('cible-description').value = prefill.description_action || prefill.intitule || '';
    document.getElementById('cible-nombre').value = prefill.nombre_attendu || 1;
    document.getElementById('cible-echeance').value = prefill.date_echeance || '';
    document.getElementById('cible-periode').value = prefill.periode_msi || '';
    document.getElementById('cible-montant').value = prefill.montant_estime || 0;
    document.getElementById('cible-confiance').value = prefill.niveau_confiance ?? 0.5;
    document.getElementById('cible-notes').value = prefill.notes || '';
    document.getElementById('cible-statut-avancement').value = prefill.statut_avancement || 'Communication';
    document.getElementById('cible-etape').value = prefill.etape || 1;

    // Afficher la section avancement si on est en étape 5+
    const colonne = getColonneCible(prefill);
    document.getElementById('section-avancement').style.display = colonne === 5 ? 'flex' : 'none';
  } else {
    document.getElementById('cible-etape').value = 1;
    document.getElementById('section-avancement').style.display = 'none';
  }

  document.getElementById('modal-cible').classList.remove('hidden');
}

function updateResultatsSelect(domId) {
  const sel = document.getElementById('cible-resultat-select');
  sel.innerHTML = '<option value="">— Choisir dans la liste —</option>';
  const resultats = state.resultatsAttendus.filter(r => r.domaine_id === domId);
  resultats.forEach(r => {
    const o = document.createElement('option');
    o.value = r.libelle;
    o.textContent = r.libelle;
    sel.appendChild(o);
  });
}

async function saveCible(e) {
  e.preventDefault();
  const id = document.getElementById('cible-id').value;
  const domaineId = parseInt(document.getElementById('cible-domaine').value) || null;
  const resultatSelect = document.getElementById('cible-resultat-select').value;
  const resultatLibre = document.getElementById('cible-resultat-libre').value.trim();
  const resultatFinal = resultatLibre || resultatSelect || null;

  // Si l'utilisateur a saisi un résultat libre, l'ajouter à la liste
  if (resultatLibre && domaineId) {
    await sb.from('resultats_attendus').upsert({
      domaine_id: domaineId,
      libelle: resultatLibre,
      ordre_affichage: 999
    }, { onConflict: 'domaine_id,libelle' });
  }

  // Déterminer l'étape selon le domaine + statut
  let etape = parseInt(document.getElementById('cible-etape').value) || 1;
  if (domaineId) {
    const dom = state.domaines.find(d => d.id === domaineId);
    if (dom) etape = dom.numero;
  }

  const data = {
    description_action: document.getElementById('cible-description').value,
    intitule: document.getElementById('cible-description').value, // compat ancien champ
    domaine_id: domaineId,
    responsable_id: document.getElementById('cible-responsable').value || null,
    source_id: parseInt(document.getElementById('cible-source').value) || null,
    resultat_attendu: resultatFinal,
    nombre_attendu: parseInt(document.getElementById('cible-nombre').value) || 0,
    date_echeance: document.getElementById('cible-echeance').value || null,
    etape: etape,
    periode_msi: document.getElementById('cible-periode').value || null,
    montant_estime: parseFloat(document.getElementById('cible-montant').value) || 0,
    niveau_confiance: parseFloat(document.getElementById('cible-confiance').value) || 0.5,
    notes: document.getElementById('cible-notes').value || null,
    statut_avancement: document.getElementById('cible-statut-avancement').value || null,
    produit_id: state.produitActif?.id || null,
    updated_at: new Date().toISOString()
  };

  if (data.statut_avancement === 'Signé') data.date_signature = new Date().toISOString().split('T')[0];

  const { error } = id ? await sb.from('cibles_msi').update(data).eq('id', id) : await sb.from('cibles_msi').insert([data]);
  if (error) showToast('Erreur : ' + error.message, 'error');
  else { showToast(id ? 'Tâche modifiée' : 'Tâche créée', 'success'); closeM('modal-cible'); await loadData(); renderAll(); }
}

async function deleteCible() {
  const id = document.getElementById('cible-id').value;
  if (!id || !confirm('Supprimer cette tâche ?')) return;
  await sb.from('cibles_msi').delete().eq('id', id);
  showToast('Tâche supprimée', 'success'); closeM('modal-cible'); await loadData(); renderAll();
}

// === ÉVÉNEMENTS, PÉRIODES (inchangés) ===
function openModal(prefill = {}) {
  document.getElementById('event-form').reset();
  document.getElementById('event-id').value = prefill.id || '';
  document.getElementById('modal-title').textContent = prefill.id ? 'Modifier événement' : 'Nouvel événement';
  document.getElementById('btn-delete').classList.toggle('hidden', !prefill.id);
  const srcSelect = document.getElementById('event-source');
  srcSelect.innerHTML = '<option value="">Choisir...</option>';
  state.sources.filter(s => s.groupe !== 'OUTIL').forEach(s => {
    const o = document.createElement('option');
    o.value = s.id;
    o.textContent = (s.parent_id ? '  └ ' : '') + s.nom;
    if (prefill.source_id === s.id) o.selected = true;
    srcSelect.appendChild(o);
  });
  const respSelect = document.getElementById('event-responsable');
  respSelect.innerHTML = '<option value="">Choisir...</option>';
  state.utilisateurs.forEach(u => {
    const o = document.createElement('option');
    o.value = u.id; o.textContent = (u.prenom||'')+' '+(u.nom||'');
    if (prefill.responsable_id === u.id || (!prefill.id && u.id === state.user.id)) o.selected = true;
    respSelect.appendChild(o);
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
  else { showToast(id ? 'Événement modifié' : 'Événement créé', 'success'); closeM('modal'); await loadData(); renderAll(); }
}

async function deleteEvent() {
  const id = document.getElementById('event-id').value;
  if (!id || !confirm('Supprimer cet événement ?')) return;
  await sb.from('evenements').delete().eq('id', id);
  showToast('Événement supprimé', 'success'); closeM('modal'); await loadData(); renderAll();
}

function openModalPeriode() {
  document.getElementById('periode-form').reset();
  document.getElementById('modal-periode').classList.remove('hidden');
}

async function savePeriode(e) {
  e.preventDefault();
  const code = document.getElementById('periode-code').value.trim().toUpperCase();
  const commentaire = document.getElementById('periode-commentaire').value;
  if (!code) return;
  const exists = state.objectifsAnnuels.find(o => o.annee === state.obj_annee && o.periode_msi === code);
  if (exists) { showToast('Cette période existe déjà', 'error'); return; }
  await sb.from('objectifs_annuels').insert([{ annee: state.obj_annee, periode_msi: code, ca_cible: 0, msi_cible: 0, commentaire }]);
  showToast('Période ajoutée', 'success'); closeM('modal-periode'); await loadData(); renderObjectifsAnnuels(); renderDashboard();
}

// ============================================================
// RENDUS
// ============================================================
function renderAll() {
  renderDashboard();
  renderKanban();
  renderHebdo();
  renderCalendar();
  renderEventsTable();
  renderObjectifsAnnuels();
  renderObjectifsTable();
}

function getCiblesProduitActif() {
  if (!state.produitActif) return state.cibles;
  return state.cibles.filter(c => c.produit_id === state.produitActif.id || (!c.produit_id && state.produitActif.code === 'MSI'));
}

// === TABLEAU DE TÂCHES v7 (5 colonnes) ===
function renderKanban() {
  const board = document.getElementById('kanban-board');
  board.innerHTML = '';
  let cibles = getCiblesProduitActif();
  if (state.plan_periode) cibles = cibles.filter(c => c.periode_msi === state.plan_periode);
  if (state.plan_responsable) cibles = cibles.filter(c => c.responsable_id === state.plan_responsable);

  COLONNES_V7.forEach(col => {
    const div = document.createElement('div');
    div.className = 'kanban-column' + (col.type === 'avancement' ? ' col-avancement' : '');
    div.dataset.colonne = col.numero;
    const cs = cibles.filter(c => getColonneCible(c) === col.numero);
    div.innerHTML = `
      <div class="kanban-col-header" style="border-bottom-color:${col.couleur};">
        <div class="kanban-col-header-line">
          <div class="kanban-col-title">${col.numero}. ${col.libelle}</div>
          <div class="kanban-col-count">${cs.length}</div>
        </div>
        <div class="kanban-col-subtitle">${col.sublabel}</div>
      </div>
      <div class="kanban-col-body"></div>
    `;
    board.appendChild(div);
    const body = div.querySelector('.kanban-col-body');

    div.addEventListener('dragover', e => { e.preventDefault(); div.classList.add('drag-over'); });
    div.addEventListener('dragleave', () => div.classList.remove('drag-over'));
    div.addEventListener('drop', async e => {
      e.preventDefault();
      div.classList.remove('drag-over');
      const cibleId = state.draggedCibleId;
      if (!cibleId) return;
      const cible = state.cibles.find(c => c.id === cibleId);
      const colActuelle = getColonneCible(cible);
      if (colActuelle === col.numero) return;

      const newData = { updated_at: new Date().toISOString() };

      // Si on passe en colonne 1-3, on change le domaine
      if (col.numero <= 3) {
        const dom = state.domaines.find(d => d.numero === col.numero);
        if (dom) {
          newData.domaine_id = dom.id;
          newData.etape = col.numero;
          newData.statut_avancement = null;
        }
      } else if (col.numero === 4) {
        newData.etape = 4;
        newData.statut_avancement = null;
      } else if (col.numero === 5) {
        newData.etape = 5;
        if (!cible.statut_avancement) newData.statut_avancement = 'Communication';
      }

      await sb.from('cibles_msi').update(newData).eq('id', cibleId);
      showToast(`Tâche déplacée vers "${col.libelle}"`, 'success');
      await loadData(); renderAll();
    });

    if (cs.length === 0) {
      body.innerHTML = '<div class="kanban-empty">Aucune tâche</div>';
    } else {
      cs.forEach(c => {
        const resp = state.utilisateurs.find(u => u.id === c.responsable_id);
        const src = state.sources.find(s => s.id === c.source_id);
        const card = document.createElement('div');
        card.className = 'kanban-card';
        card.draggable = true;
        card.style.borderLeftColor = col.couleur;

        const description = c.description_action || c.intitule || '(sans description)';
        const isOverdue = c.date_echeance && new Date(c.date_echeance) < new Date() && col.numero < 5;

        let cardHTML = `<div class="kanban-card-title">${description}</div>`;
        if (c.resultat_attendu) {
          cardHTML += `<div class="kanban-card-resultat"><strong>Attendu :</strong> ${c.resultat_attendu}${c.nombre_attendu ? ' ('+c.nombre_attendu+')' : ''}</div>`;
        }
        if (src) {
          cardHTML += `<div class="kanban-card-resultat" style="font-size:10px;">${src.nom}</div>`;
        }
        cardHTML += `<div class="kanban-card-meta">`;
        cardHTML += `<span>${resp ? (resp.prenom||'').charAt(0)+'. '+(resp.nom||'') : '—'}</span>`;
        if (col.numero === 5 && c.statut_avancement) {
          cardHTML += `<span class="kanban-card-statut">${c.statut_avancement}</span>`;
        } else if (c.date_echeance) {
          cardHTML += `<span class="kanban-card-echeance${isOverdue ? ' overdue' : ''}">${new Date(c.date_echeance).toLocaleDateString('fr-FR')}</span>`;
        }
        if (col.numero === 5 && c.montant_estime > 0) {
          cardHTML += `<span class="kanban-card-montant">${formatEuro(c.montant_estime)} €</span>`;
        }
        cardHTML += `</div>`;

        card.innerHTML = cardHTML;
        card.addEventListener('dragstart', e => { state.draggedCibleId = c.id; card.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
        card.addEventListener('dragend', () => { card.classList.remove('dragging'); state.draggedCibleId = null; });
        card.addEventListener('click', e => { if (!card.classList.contains('dragging')) openModalCible(c); });
        body.appendChild(card);
      });
    }
  });
}

function renderDashboard() {
  const objAnnuelGlobal = state.objectifsAnnuels.find(o => o.annee === state.annee && o.periode_msi === 'ANNUEL');
  const caObjectif = objAnnuelGlobal?.ca_cible || 0;
  const msiObjectif = objAnnuelGlobal?.msi_cible || 0;
  const cibles = getCiblesProduitActif();
  const ciblesActives = cibles.filter(c => getColonneCible(c) < 5 || (c.statut_avancement && !['Signé','Perdu'].includes(c.statut_avancement)));
  const ciblesSignees = cibles.filter(c => c.statut_avancement === 'Signé');
  const caSigne = ciblesSignees.reduce((s,c) => s + (c.montant_estime || 0), 0);
  const caEnCours = ciblesActives.reduce((s,c) => s + ((c.montant_estime || 0) * (c.niveau_confiance || 0)), 0);
  const atteinteCA = caObjectif > 0 ? Math.round((caSigne / caObjectif) * 100) : 0;
  const rdvSem = state.suivi.filter(s => s.type_activite === 'RDV effectués' && s.annee === state.annee && s.semaine === state.hebdo_semaine).reduce((sum,s) => sum + (s.nombre||0), 0);
  const propMois = state.suivi.filter(s => s.type_activite === 'Propositions envoyées' && s.annee === state.annee && s.semaine >= state.hebdo_semaine-3 && s.semaine <= state.hebdo_semaine).reduce((sum,s) => sum + (s.nombre||0), 0);

  document.getElementById('kpi-rdv-sem').textContent = rdvSem;
  document.getElementById('kpi-rdv-sem-obj').textContent = 'Objectif ' + state.kpi_rdv_cible + ' / semaine';
  const cardRdv = document.getElementById('kpi-card-rdv');
  cardRdv.className = 'kpi-card-big ' + (rdvSem >= state.kpi_rdv_cible ? 'kpi-card-ok' : 'kpi-card-alert');
  document.getElementById('kpi-rdv-sem').className = 'kpi-card-big-value ' + (rdvSem >= state.kpi_rdv_cible ? 'kpi-ok' : 'kpi-alert');
  const statusRdv = document.getElementById('kpi-rdv-status');
  statusRdv.className = 'kpi-card-big-status ' + (rdvSem >= state.kpi_rdv_cible ? 'ok' : 'alert');
  statusRdv.textContent = rdvSem >= state.kpi_rdv_cible ? 'Atteint' : 'Retard';

  document.getElementById('kpi-prop-mois').textContent = propMois;
  document.getElementById('kpi-prop-mois-obj').textContent = 'Objectif ' + state.kpi_prop_cible + ' / mois';
  const cardProp = document.getElementById('kpi-card-prop');
  cardProp.className = 'kpi-card-big ' + (propMois >= state.kpi_prop_cible ? 'kpi-card-ok' : 'kpi-card-alert');
  document.getElementById('kpi-prop-mois').className = 'kpi-card-big-value ' + (propMois >= state.kpi_prop_cible ? 'kpi-ok' : 'kpi-alert');
  const statusProp = document.getElementById('kpi-prop-status');
  statusProp.className = 'kpi-card-big-status ' + (propMois >= state.kpi_prop_cible ? 'ok' : 'alert');
  statusProp.textContent = propMois >= state.kpi_prop_cible ? 'Atteint' : 'Retard';

  document.getElementById('kpi-contrats').textContent = ciblesSignees.length;
  document.getElementById('kpi-contrats-obj').textContent = 'Objectif ' + msiObjectif + ' annuel';
  const cardContrats = document.getElementById('kpi-card-contrats');
  const valContrats = document.getElementById('kpi-contrats');
  const statusContrats = document.getElementById('kpi-contrats-status');
  const contratsOk = msiObjectif > 0 && ciblesSignees.length >= msiObjectif;
  cardContrats.className = 'kpi-card-big ' + (contratsOk ? 'kpi-card-ok' : '');
  valContrats.className = 'kpi-card-big-value ' + (contratsOk ? 'kpi-ok' : '');
  if (msiObjectif > 0) {
    statusContrats.className = 'kpi-card-big-status ' + (contratsOk ? 'ok' : 'alert');
    statusContrats.textContent = contratsOk ? 'Atteint' : Math.round((ciblesSignees.length/msiObjectif)*100) + ' %';
  } else statusContrats.textContent = '';

  document.getElementById('kpi-ca-signe').textContent = formatEuro(caSigne);
  document.getElementById('kpi-ca-cours').textContent = formatEuro(caEnCours);
  document.getElementById('kpi-ca-objectif').textContent = formatEuro(caObjectif);
  document.getElementById('kpi-atteinte-ca').textContent = atteinteCA + ' %';
  document.getElementById('kpi-cibles-act').textContent = ciblesActives.length;

  // Tableau périodes
  const periodes = state.objectifsAnnuels.filter(o => o.annee === state.annee && o.periode_msi !== 'ANNUEL');
  const tbodyPer = document.querySelector('#periodes-table tbody');
  tbodyPer.innerHTML = '';
  if (periodes.length === 0) tbodyPer.innerHTML = '<tr><td colspan="7" class="empty">Aucune période définie.</td></tr>';
  else periodes.forEach(p => {
    const cs = cibles.filter(c => c.periode_msi === p.periode_msi);
    const caSP = cs.filter(c => c.statut_avancement === 'Signé').reduce((s,c) => s + (c.montant_estime||0), 0);
    const caCP = cs.filter(c => !['Signé','Perdu'].includes(c.statut_avancement)).reduce((s,c) => s + ((c.montant_estime||0)*(c.niveau_confiance||0)), 0);
    const sigP = cs.filter(c => c.statut_avancement === 'Signé').length;
    const att = p.ca_cible > 0 ? Math.round((caSP / p.ca_cible)*100) : 0;
    const cls = att >= 100 ? 'badge-success' : (att >= 50 ? 'badge-warning' : 'badge-info');
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><strong>${p.periode_msi}</strong></td><td>${formatEuro(p.ca_cible)} €</td><td>${formatEuro(caSP)} €</td><td>${formatEuro(caCP)} €</td><td><span class="badge ${cls}">${att} %</span></td><td>${p.msi_cible}</td><td>${sigP}</td>`;
    tbodyPer.appendChild(tr);
  });

  // Tableau colonnes
  const tbodyCol = document.querySelector('#colonnes-table tbody');
  tbodyCol.innerHTML = '';
  COLONNES_V7.forEach(col => {
    const cs = cibles.filter(c => getColonneCible(c) === col.numero);
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><strong>${col.numero}. ${col.libelle}</strong> <span style="color:#888780;font-size:11px;">(${col.sublabel})</span></td><td>${cs.length}</td>`;
    tbodyCol.appendChild(tr);
  });

  // Performance par commercial
  const tbodyC = document.querySelector('#commerciaux-table tbody');
  tbodyC.innerHTML = '';
  if (state.utilisateurs.length === 0) tbodyC.innerHTML = '<tr><td colspan="5" class="empty">Aucun commercial.</td></tr>';
  else state.utilisateurs.forEach(u => {
    const cs = cibles.filter(c => c.responsable_id === u.id);
    const csA = cs.filter(c => !['Signé','Perdu'].includes(c.statut_avancement));
    const rdv = state.suivi.filter(s => s.utilisateur_id === u.id && s.type_activite === 'RDV effectués').reduce((sum,s) => sum + (s.nombre||0), 0);
    const prop = state.suivi.filter(s => s.utilisateur_id === u.id && s.type_activite === 'Propositions envoyées').reduce((sum,s) => sum + (s.nombre||0), 0);
    const signe = cs.filter(c => c.statut_avancement === 'Signé').reduce((s,c) => s+(c.montant_estime||0), 0);
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><strong>${u.prenom||''} ${u.nom||''}</strong></td><td>${csA.length}</td><td>${rdv}</td><td>${prop}</td><td>${formatEuro(signe)} €</td>`;
    tbodyC.appendChild(tr);
  });

  renderDashboardCharts();
}

// ============================================================
// GRAPHIQUES Chart.js
// ============================================================
function destroyChart(name) {
  if (state.charts[name]) { state.charts[name].destroy(); delete state.charts[name]; }
}

function renderDashboardCharts() {
  if (typeof Chart === 'undefined') return;
  const cibles = getCiblesProduitActif();

  destroyChart('rdvSem');
  const ctx1 = document.getElementById('chart-rdv-sem');
  if (ctx1) {
    const semaines = [], valeurs = [], objectifs = [];
    for (let i = 11; i >= 0; i--) {
      const w = state.hebdo_semaine - i;
      if (w < 1) continue;
      semaines.push('S' + w);
      const total = state.suivi.filter(s => s.annee === state.annee && s.semaine === w && s.type_activite === 'RDV effectués').reduce((sum,s) => sum + (s.nombre||0), 0);
      valeurs.push(total);
      objectifs.push(state.kpi_rdv_cible);
    }
    state.charts.rdvSem = new Chart(ctx1, {
      type: 'bar',
      data: { labels: semaines, datasets: [
        { label: 'RDV réalisés', data: valeurs, backgroundColor: '#1F3864', borderRadius: 4 },
        { label: 'Objectif', data: objectifs, type: 'line', borderColor: '#A32D2D', backgroundColor: 'transparent', borderWidth: 2, borderDash: [5,5], pointRadius: 0 }
      ]},
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
    });
  }

  destroyChart('pipeline');
  const ctx2 = document.getElementById('chart-pipeline');
  if (ctx2) {
    const periodes = state.objectifsAnnuels.filter(o => o.annee === state.annee && o.periode_msi !== 'ANNUEL');
    const labels = periodes.map(p => p.periode_msi);
    const ciblesP = periodes.map(p => p.ca_cible || 0);
    const signes = periodes.map(p => cibles.filter(c => c.periode_msi === p.periode_msi && c.statut_avancement === 'Signé').reduce((s,c) => s + (c.montant_estime||0), 0));
    const enCours = periodes.map(p => cibles.filter(c => c.periode_msi === p.periode_msi && !['Signé','Perdu'].includes(c.statut_avancement)).reduce((s,c) => s + ((c.montant_estime||0)*(c.niveau_confiance||0)), 0));
    if (labels.length > 0) {
      state.charts.pipeline = new Chart(ctx2, {
        type: 'bar',
        data: { labels, datasets: [
          { label: 'Objectif', data: ciblesP, backgroundColor: '#B4B2A9', borderRadius: 4 },
          { label: 'Signé', data: signes, backgroundColor: '#1D9E75', borderRadius: 4 },
          { label: 'En cours (pondéré)', data: enCours, backgroundColor: '#85B7EB', borderRadius: 4 }
        ]},
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } }, tooltip: { callbacks: { label: c => c.dataset.label + ': ' + formatEuro(c.parsed.y) + ' €' } } }, scales: { y: { beginAtZero: true, ticks: { callback: v => formatEuro(v) + ' €' } } } }
      });
    }
  }

  destroyChart('commerciaux');
  const ctx3 = document.getElementById('chart-commerciaux');
  if (ctx3) {
    const labels = [], valeurs = [];
    state.utilisateurs.forEach(u => {
      const n = cibles.filter(c => c.responsable_id === u.id && !['Signé','Perdu'].includes(c.statut_avancement)).length;
      if (n > 0) { labels.push((u.prenom||'')+' '+(u.nom||'')); valeurs.push(n); }
    });
    if (labels.length > 0) {
      state.charts.commerciaux = new Chart(ctx3, {
        type: 'doughnut',
        data: { labels, datasets: [{ data: valeurs, backgroundColor: COULEURS_CHART, borderWidth: 2, borderColor: 'white' }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { font: { size: 11 }, padding: 8 } } } }
      });
    }
  }
}

function renderHebdoCharts() {
  if (typeof Chart === 'undefined') return;
  const semaines = [], rdvData = [], propData = [];
  for (let i = 11; i >= 0; i--) {
    const w = state.hebdo_semaine - i;
    if (w < 1) continue;
    semaines.push('S' + w);
    rdvData.push(state.suivi.filter(s => s.annee === state.hebdo_annee && s.semaine === w && s.type_activite === 'RDV effectués').reduce((sum,s) => sum + (s.nombre||0), 0));
    propData.push(state.suivi.filter(s => s.annee === state.hebdo_annee && s.semaine === w && s.type_activite === 'Propositions envoyées').reduce((sum,s) => sum + (s.nombre||0), 0));
  }

  destroyChart('evolRdv');
  const ctx1 = document.getElementById('chart-evol-rdv');
  if (ctx1) state.charts.evolRdv = new Chart(ctx1, {
    type: 'line',
    data: { labels: semaines, datasets: [
      { label: 'RDV effectués', data: rdvData, borderColor: '#1F3864', backgroundColor: 'rgba(31,56,100,0.1)', tension: 0.3, fill: true },
      { label: 'Objectif', data: semaines.map(() => state.kpi_rdv_cible), borderColor: '#A32D2D', borderDash: [5,5], pointRadius: 0, fill: false }
    ]},
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
  });

  destroyChart('evolProp');
  const ctx2 = document.getElementById('chart-evol-prop');
  if (ctx2) state.charts.evolProp = new Chart(ctx2, {
    type: 'line',
    data: { labels: semaines, datasets: [{ label: 'Propales envoyées', data: propData, borderColor: '#5DCAA5', backgroundColor: 'rgba(93,202,165,0.15)', tension: 0.3, fill: true }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
  });

  destroyChart('comparComm');
  const ctx3 = document.getElementById('chart-compar-comm');
  if (ctx3) {
    const labels = state.utilisateurs.map(u => (u.prenom||'')+' '+(u.nom||''));
    const rdvAll = state.utilisateurs.map(u => state.suivi.filter(s => s.utilisateur_id === u.id && s.annee === state.hebdo_annee && s.type_activite === 'RDV effectués').reduce((sum,s) => sum + (s.nombre||0), 0));
    const propAll = state.utilisateurs.map(u => state.suivi.filter(s => s.utilisateur_id === u.id && s.annee === state.hebdo_annee && s.type_activite === 'Propositions envoyées').reduce((sum,s) => sum + (s.nombre||0), 0));
    const appAll = state.utilisateurs.map(u => state.suivi.filter(s => s.utilisateur_id === u.id && s.annee === state.hebdo_annee && s.type_activite === 'Appels / Contacts').reduce((sum,s) => sum + (s.nombre||0), 0));
    state.charts.comparComm = new Chart(ctx3, {
      type: 'bar',
      data: { labels, datasets: [
        { label: 'Appels / Contacts', data: appAll, backgroundColor: '#85B7EB', borderRadius: 4 },
        { label: 'RDV effectués', data: rdvAll, backgroundColor: '#1F3864', borderRadius: 4 },
        { label: 'Propositions envoyées', data: propAll, backgroundColor: '#5DCAA5', borderRadius: 4 }
      ]},
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
    });
  }
}

function renderHebdo() {
  const tbody = document.querySelector('#hebdo-table tbody');
  tbody.innerHTML = '';
  if (state.utilisateurs.length === 0) { tbody.innerHTML = '<tr><td colspan="5" class="empty">Aucun utilisateur.</td></tr>'; return; }
  state.utilisateurs.forEach(u => {
    const tr = document.createElement('tr');
    let total = 0;
    let html = `<td><strong>${u.prenom||''} ${u.nom||''}</strong></td>`;
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
      cumul[act] = state.suivi.filter(s => s.utilisateur_id === u.id && s.annee === state.hebdo_annee && s.semaine >= startWeek && s.semaine <= state.hebdo_semaine && s.type_activite === act).reduce((sum,s) => sum + (s.nombre||0), 0);
    });
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><strong>${u.prenom||''} ${u.nom||''}</strong></td><td>${cumul['Appels / Contacts']}</td><td>${cumul['RDV effectués']}</td><td>${cumul['Propositions envoyées']}</td>`;
    tbody2.appendChild(tr);
  });
  renderHebdoCharts();
}

function renderCalendar() {
  const container = document.getElementById('calendar-grid');
  container.innerHTML = '';
  let sources = state.sources.filter(s => s.groupe !== 'OUTIL');
  if (state.cal_filter_groupe) sources = sources.filter(s => s.groupe === state.cal_filter_groupe);
  const orderedSources = [];
  const parents = sources.filter(s => !s.parent_id);
  parents.forEach(p => {
    const hasChildren = sources.some(s => s.parent_id === p.id);
    orderedSources.push({ ...p, isParent: hasChildren, hasChildren });
    if (hasChildren && state.expandedParents.has(p.id)) {
      sources.filter(s => s.parent_id === p.id).forEach(c => orderedSources.push({ ...c, isChild: true }));
    }
  });

  const header = document.createElement('div');
  header.className = 'cal-row cal-header';
  header.innerHTML = '<div class="cal-cell cal-source-header">Source</div>' +
    MOIS_COURT.map((m, i) => `<div class="cal-cell cal-month-header${(i===6||i===7)?' cal-vacation':''}">${m}</div>`).join('');
  container.appendChild(header);

  const evAnnee = state.evenements.filter(e => new Date(e.date_evenement).getFullYear() === state.cal_annee);

  orderedSources.forEach(src => {
    const row = document.createElement('div');
    row.className = 'cal-row';
    let labelClass = 'cal-source-label';
    let labelContent = src.nom;
    if (src.isParent) {
      labelClass += ' cal-source-parent';
      if (state.expandedParents.has(src.id)) labelClass += ' expanded';
      labelContent = `<span class="chevron">▶</span>${src.nom}`;
    } else if (src.isChild) {
      labelClass += ' cal-source-child';
    }
    let html = `<div class="cal-cell ${labelClass}" data-parent-toggle="${src.isParent ? src.id : ''}">${labelContent}</div>`;
    let sourceIds = [src.id];
    if (src.isParent) state.sources.filter(s => s.parent_id === src.id).forEach(c => sourceIds.push(c.id));
    for (let m = 0; m < 12; m++) {
      const isVac = m === 6 || m === 7;
      const evs = evAnnee.filter(e => sourceIds.includes(e.source_id) && new Date(e.date_evenement).getMonth() === m);
      if (isVac) html += `<div class="cal-cell cal-vacation">${m === 6 ? 'Dégryse' : ''}</div>`;
      else if (evs.length > 0) html += '<div class="cal-cell cal-filled" data-evs=\'' + JSON.stringify(evs.map(e=>e.id)) + '\'>' + evs.length + '</div>';
      else if (src.isParent) html += '<div class="cal-cell cal-empty" style="cursor:default;background:transparent;border:1px dashed #E5E3DC;"></div>';
      else html += '<div class="cal-cell cal-empty" data-source="' + src.id + '" data-month="' + m + '"></div>';
    }
    row.innerHTML = html;
    container.appendChild(row);
  });

  container.querySelectorAll('[data-parent-toggle]').forEach(el => {
    const parentId = el.dataset.parentToggle;
    if (parentId) el.addEventListener('click', e => { e.stopPropagation(); toggleParent(parseInt(parentId)); });
  });
  container.querySelectorAll('.cal-empty[data-source]').forEach(cell => {
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
      if (ids.length === 1) openModal(state.evenements.find(e => e.id === ids[0]));
      else document.querySelector('.tab[data-tab="events"]').click();
    });
  });
}

function renderEventsTable() {
  const tbody = document.querySelector('#events-table tbody');
  tbody.innerHTML = '';
  if (state.evenements.length === 0) { tbody.innerHTML = '<tr><td colspan="8" class="empty">Aucun événement.</td></tr>'; return; }
  state.evenements.forEach(ev => {
    const src = state.sources.find(s => s.id === ev.source_id);
    const resp = state.utilisateurs.find(u => u.id === ev.responsable_id);
    const statut = ev.resultat_contacts == null ? 'À venir' : (ev.resultat_contacts >= (ev.objectif_contacts||0) ? 'Objectif atteint' : 'Objectif non atteint');
    const cls = statut === 'Objectif atteint' ? 'badge-success' : (statut === 'Objectif non atteint' ? 'badge-danger' : 'badge-info');
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${new Date(ev.date_evenement).toLocaleDateString('fr-FR')}</td><td>${ev.quoi}</td><td>${src?.nom || '—'}</td><td>${resp ? (resp.prenom||'')+' '+(resp.nom||'') : '—'}</td><td>${ev.objectif_contacts || 0}</td><td>${ev.resultat_contacts ?? '—'}</td><td><span class="badge ${cls}">${statut}</span></td><td><button class="btn-link" data-id="${ev.id}">Modifier</button></td>`;
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll('.btn-link').forEach(btn => {
    btn.addEventListener('click', () => openModal(state.evenements.find(e => e.id === parseInt(btn.dataset.id))));
  });
}

function renderObjectifsAnnuels() {
  const tbody = document.querySelector('#obj-annuels-table tbody');
  tbody.innerHTML = '';
  const list = state.objectifsAnnuels.filter(o => o.annee === state.obj_annee);
  if (!list.find(o => o.periode_msi === 'ANNUEL')) {
    const tr = document.createElement('tr');
    tr.style.background = '#FFF9E6';
    tr.innerHTML = `<td><strong>ANNUEL</strong> <span class="badge badge-warning">À créer</span></td><td><input type="number" class="obj-annuel-input" data-periode="ANNUEL" data-field="ca_cible" value="0" min="0"></td><td><input type="number" class="obj-annuel-input" data-periode="ANNUEL" data-field="msi_cible" value="0" min="0"></td><td><input type="text" class="obj-annuel-input" data-periode="ANNUEL" data-field="commentaire" placeholder="Objectif global"></td><td></td>`;
    tbody.appendChild(tr);
  }
  const sorted = [...list].sort((a,b) => a.periode_msi === 'ANNUEL' ? -1 : (b.periode_msi === 'ANNUEL' ? 1 : (a.periode_msi||'').localeCompare(b.periode_msi||'')));
  sorted.forEach(obj => {
    const tr = document.createElement('tr');
    const isAnnuel = obj.periode_msi === 'ANNUEL';
    if (isAnnuel) tr.style.background = '#F0F4F9';
    tr.innerHTML = `<td><strong>${obj.periode_msi}</strong></td><td><input type="number" class="obj-annuel-input" data-id="${obj.id}" data-field="ca_cible" value="${obj.ca_cible||0}" min="0"></td><td><input type="number" class="obj-annuel-input" data-id="${obj.id}" data-field="msi_cible" value="${obj.msi_cible||0}" min="0"></td><td><input type="text" class="obj-annuel-input" data-id="${obj.id}" data-field="commentaire" value="${obj.commentaire||''}"></td><td>${isAnnuel ? '' : '<button class="btn-icon" data-delete="'+obj.id+'">✕</button>'}</td>`;
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll('.obj-annuel-input').forEach(input => {
    input.addEventListener('change', async () => {
      const id = input.dataset.id;
      const periode = input.dataset.periode;
      const field = input.dataset.field;
      const val = field === 'commentaire' ? input.value : (parseFloat(input.value) || 0);
      if (id) await sb.from('objectifs_annuels').update({ [field]: val, updated_at: new Date().toISOString() }).eq('id', id);
      else if (periode === 'ANNUEL') {
        const obj = { annee: state.obj_annee, periode_msi: 'ANNUEL', ca_cible: 0, msi_cible: 0, commentaire: '' };
        obj[field] = val;
        await sb.from('objectifs_annuels').insert([obj]);
      }
      await loadData(); renderObjectifsAnnuels(); renderDashboard();
      showToast('Mis à jour', 'success');
    });
  });
  tbody.querySelectorAll('[data-delete]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Supprimer cette période ?')) return;
      await sb.from('objectifs_annuels').delete().eq('id', btn.dataset.delete);
      await loadData(); renderObjectifsAnnuels(); renderDashboard();
      showToast('Supprimée', 'success');
    });
  });
}

function renderObjectifsTable() {
  const tbody = document.querySelector('#objectifs-table tbody');
  tbody.innerHTML = '';
  let sources = state.sources.filter(s => s.groupe !== 'OUTIL');
  const orderedSources = [];
  const parents = sources.filter(s => !s.parent_id);
  parents.forEach(p => {
    const hasChildren = sources.some(s => s.parent_id === p.id);
    orderedSources.push({ ...p, isParent: hasChildren });
    if (hasChildren && state.expandedParents.has(p.id)) {
      sources.filter(s => s.parent_id === p.id).forEach(c => orderedSources.push({ ...c, isChild: true }));
    }
  });
  orderedSources.forEach(src => {
    const tr = document.createElement('tr');
    if (src.isParent) {
      tr.className = 'objectif-parent-row' + (state.expandedParents.has(src.id) ? ' expanded' : '');
      tr.dataset.parentToggle = src.id;
      const children = state.sources.filter(s => s.parent_id === src.id);
      const allIds = [src.id, ...children.map(c => c.id)];
      const totalP1 = state.objectifs.filter(o => allIds.includes(o.source_id) && o.periode === 'P1').reduce((s,o) => s + (o.cible_contacts||0), 0);
      const totalP2 = state.objectifs.filter(o => allIds.includes(o.source_id) && o.periode === 'P2').reduce((s,o) => s + (o.cible_contacts||0), 0);
      tr.innerHTML = `<td><span class="chevron">▶</span>${src.nom}</td><td>${totalP1}</td><td>${totalP2}</td><td><strong>${totalP1+totalP2}</strong></td>`;
    } else {
      if (src.isChild) tr.className = 'objectif-child-row';
      const p1 = state.objectifs.find(o => o.source_id === src.id && o.periode === 'P1');
      const p2 = state.objectifs.find(o => o.source_id === src.id && o.periode === 'P2');
      tr.innerHTML = `<td>${src.nom}</td><td><input type="number" class="obj-input" data-source="${src.id}" data-periode="P1" value="${p1?.cible_contacts||0}" min="0"></td><td><input type="number" class="obj-input" data-source="${src.id}" data-periode="P2" value="${p2?.cible_contacts||0}" min="0"></td><td><strong>${(p1?.cible_contacts||0)+(p2?.cible_contacts||0)}</strong></td>`;
    }
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll('[data-parent-toggle]').forEach(tr => {
    tr.addEventListener('click', e => { if (e.target.tagName === 'INPUT') return; toggleParent(parseInt(tr.dataset.parentToggle)); });
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
