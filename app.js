const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const MOIS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
const MOIS_COURT = ['Janv','Févr','Mars','Avr','Mai','Juin','Juil','Août','Sept','Oct','Nov','Déc'];
const ACTIVITES = ['Appels / Contacts','RDV planifiés','RDV qualifiés','Propositions envoyées'];

// Icônes par type de jalon MSI (pour calendrier annuel)
const JALON_ICONS = {
  'Revue projet':        '📊',
  'Intervention client': '🎯',
  'Soutenance':          '🎤',
  'Livrable':            '📦',
  'Réunion':             '👥',
  'Autre':               '📍'
};
const COULEURS_CHART = ['#1F3864','#5DCAA5','#7F77DD','#F0997B','#FAC775','#ED93B1','#B4B2A9','#85B7EB'];

// 5 colonnes v8
const COLONNES_V8 = [
  { numero: 1, libelle: 'Leads',                       sublabel: 'Recherche',                couleur: '#7F77DD', type: 'domaine' },
  { numero: 2, libelle: 'Phoning',                     sublabel: 'Appels',                   couleur: '#5DCAA5', type: 'domaine' },
  { numero: 3, libelle: 'RDV Qualification du besoin', sublabel: 'RDV / Smart Diag',         couleur: '#85B7EB', type: 'domaine' },
  { numero: 4, libelle: 'Rédaction de l\'offre',       sublabel: 'Propale en rédaction',     couleur: '#FAC775', type: 'redaction' },
  { numero: 5, libelle: 'Avancement',                  sublabel: 'Négociation / Signé / Perdu', couleur: '#1D9E75', type: 'avancement' }
];

const KPI_TYPES = [
  { code: 'contacts',          label: 'Nombre de contacts' },
  { code: 'rdv_qualifies',     label: 'RDV qualifiés' },
  { code: 'propales_redigees', label: 'Offres rédigées' },
  { code: 'en_cours',          label: 'En négociation' },
  { code: 'offres_signees',    label: 'Offres signées' },
  { code: 'offres_perdues',    label: 'Offres perdues' }
];

const SOURCES_AVEC_CHECKLIST = [
  'Réseau pro','Alumnis','Salons','Meeting-Ingé','JPO','Webinaires',
  'Anciens clients','Maîtres de stage','Maîtres d\'apprentissage','Événements'
];

let state = {
  user: null,
  produits: [], produitActif: null,
  sources: [], utilisateurs: [], objectifs: [], evenements: [], suivi: [],
  objectifsAnnuels: [], cibles: [], domaines: [], resultatsAttendus: [],
  checklist: [], evtObjectifs: [], kpiObjectifs: [],
  jalons: [], cibleResultats: [],
  annee: new Date().getFullYear(),
  hebdo_annee: new Date().getFullYear(),
  hebdo_semaine: getCurrentWeek(),
  cal_annee: new Date().getFullYear(),
  obj_annee: new Date().getFullYear(),
  plan_periode: '', plan_responsable: '', plan_show_done: false,
  plan_annee: '', plan_mois: '', plan_semaine: '',
  cal_filter_groupe: '',
  cal_zoom_month: null, // null = vue annuelle, 0-11 = mois zoomé
  kpi_rdv_cible: 4, kpi_prop_cible: 8,
  draggedCibleId: null,
  expandedParents: new Set(),
  charts: {},
  currentChecklistSourceId: null,
  tempResultats: []
};

function getCurrentWeek() {
  const d = new Date();
  const onejan = new Date(d.getFullYear(), 0, 1);
  return Math.ceil((((d - onejan) / 86400000) + onejan.getDay() + 1) / 7);
}

function dateToWeek(d) {
  if (!d) return null;
  const date = new Date(d);
  const onejan = new Date(date.getFullYear(), 0, 1);
  return Math.ceil((((date - onejan) / 86400000) + onejan.getDay() + 1) / 7);
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
  const { data: pref } = await sb.from('preferences_utilisateur').select('*').eq('utilisateur_id', state.user.id).single();
  if (pref && pref.produit_courant_id) state.produitActif = state.produits.find(p => p.id === pref.produit_courant_id);
  if (!state.produitActif && state.produits.length > 0) state.produitActif = state.produits[0];
  setupProduitSwitcher();
  setupNav();
  setupAllModals();
  setupHebdo();
  setupYearSelectors();
  setupFilters();
  setupKpiCibles();
  setupResets();
  setupExport();
  setupFullscreen();
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
    sb.from('resultats_attendus').select('*').order('ordre_affichage'),
    sb.from('checklist_source').select('*').order('ordre_affichage'),
    sb.from('evenement_objectifs').select('*').order('ordre_affichage'),
    sb.from('kpi_objectifs').select('*'),
    sb.from('jalons_msi').select('*').order('date_debut'),
    sb.from('cible_resultats_attendus').select('*')
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
  state.checklist = results[10].data || [];
  state.evtObjectifs = results[11].data || [];
  state.kpiObjectifs = results[12].data || [];
  state.jalons = results[13].data || [];
  state.cibleResultats = results[14].data || [];
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

function getColonneCible(cible) {
  // statut_avancement défini = colonne 5
  if (cible.statut_avancement && ['Négociation','Signé','Perdu','Communication','Financement','Paiement','CRM'].includes(cible.statut_avancement) && cible.etape >= 5) return 5;
  if (cible.etape === 4) return 4;
  if (cible.domaine_id) {
    const dom = state.domaines.find(d => d.id === cible.domaine_id);
    if (dom) return dom.numero;
  }
  if (cible.etape <= 3) return cible.etape;
  return 5;
}

function isTacheEnRetard(cible) {
  if (cible.est_terminee) return false;
  if (!cible.date_echeance) return false;
  return new Date(cible.date_echeance) < new Date();
}

function isTacheSansEcheance(cible) {
  return !cible.est_terminee && !cible.date_echeance;
}

function setupProduitSwitcher() {
  const sel = document.getElementById('produit-select');
  sel.innerHTML = '';
  state.produits.forEach(p => {
    const o = document.createElement('option');
    o.value = p.id; o.textContent = p.code;
    if (state.produitActif && p.id === state.produitActif.id) o.selected = true;
    sel.appendChild(o);
  });
  sel.addEventListener('change', async e => {
    const newProduitId = parseInt(e.target.value);
    state.produitActif = state.produits.find(p => p.id === newProduitId);
    await sb.from('preferences_utilisateur').upsert({ utilisateur_id: state.user.id, produit_courant_id: newProduitId, updated_at: new Date().toISOString() });
    updateProduitLabels();
    renderAll();
    showToast('Produit changé : ' + state.produitActif.code, 'success');
  });
  updateProduitLabels();
}

function updateProduitLabels() {
  if (!state.produitActif) return;
  document.querySelectorAll('#produit-actif-label, #produit-tableau-label, #obj-produit-label, #produit-revue-label').forEach(el => el.textContent = state.produitActif.code);
}

function setupYearSelectors() {
  fillYearSelect(document.getElementById('dash-year'), state.annee);
  document.getElementById('dash-year').addEventListener('change', e => { state.annee = parseInt(e.target.value); renderDashboard(); });
  fillYearSelect(document.getElementById('year-select'), state.cal_annee);
  document.getElementById('year-select').addEventListener('change', e => { state.cal_annee = parseInt(e.target.value); renderCalendar(); renderJalons(); });
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
  document.getElementById('plan-show-done').addEventListener('change', e => { state.plan_show_done = e.target.checked; renderKanban(); });

  // Filtre Année
  const annSel = document.getElementById('plan-annee');
  if (annSel) {
    annSel.innerHTML = '<option value="">Toutes</option>';
    const cy = new Date().getFullYear();
    for (let y = cy - 1; y <= cy + 2; y++) {
      const o = document.createElement('option');
      o.value = y; o.textContent = y;
      annSel.appendChild(o);
    }
    annSel.addEventListener('change', e => { state.plan_annee = e.target.value; renderKanban(); });
  }

  // Filtre Mois
  const moisSel = document.getElementById('plan-mois');
  if (moisSel) {
    moisSel.innerHTML = '<option value="">Tous</option>';
    MOIS.forEach((m, i) => {
      const o = document.createElement('option');
      o.value = i; o.textContent = m;
      moisSel.appendChild(o);
    });
    moisSel.addEventListener('change', e => { state.plan_mois = e.target.value; renderKanban(); });
  }

  // Filtre Semaine
  const semSel = document.getElementById('plan-semaine');
  if (semSel) {
    semSel.innerHTML = '<option value="">Toutes</option>';
    for (let w = 1; w <= 53; w++) {
      const o = document.createElement('option');
      o.value = w; o.textContent = 'S' + w;
      semSel.appendChild(o);
    }
    semSel.addEventListener('change', e => { state.plan_semaine = e.target.value; renderKanban(); });
  }

  // Boutons rapides
  const btnSem = document.getElementById('btn-filter-this-week');
  if (btnSem) btnSem.addEventListener('click', () => {
    state.plan_annee = new Date().getFullYear().toString();
    state.plan_semaine = getCurrentWeek().toString();
    state.plan_mois = '';
    if (annSel) annSel.value = state.plan_annee;
    if (semSel) semSel.value = state.plan_semaine;
    if (moisSel) moisSel.value = '';
    renderKanban();
  });
  const btnMois = document.getElementById('btn-filter-this-month');
  if (btnMois) btnMois.addEventListener('click', () => {
    state.plan_annee = new Date().getFullYear().toString();
    state.plan_mois = new Date().getMonth().toString();
    state.plan_semaine = '';
    if (annSel) annSel.value = state.plan_annee;
    if (moisSel) moisSel.value = state.plan_mois;
    if (semSel) semSel.value = '';
    renderKanban();
  });
  const btnClear = document.getElementById('btn-filter-clear');
  if (btnClear) btnClear.addEventListener('click', () => {
    state.plan_annee = ''; state.plan_mois = ''; state.plan_semaine = '';
    if (annSel) annSel.value = '';
    if (moisSel) moisSel.value = '';
    if (semSel) semSel.value = '';
    renderKanban();
  });

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
    showToast('Objectif offres mis à jour', 'success');
  });
}

function setupResets() {
  document.getElementById('btn-reset-periodes').addEventListener('click', async () => {
    if (!confirm('Remettre à 0 toutes les valeurs cibles (CA et nombre) des périodes ? Les données réalisées sont conservées.')) return;
    const periodes = state.objectifsAnnuels.filter(o => o.annee === state.obj_annee);
    for (const p of periodes) {
      await sb.from('objectifs_annuels').update({ ca_cible: 0, msi_cible: 0, updated_at: new Date().toISOString() }).eq('id', p.id);
    }
    await loadData(); renderObjectifsAnnuels(); renderDashboard();
    showToast('Périodes remises à 0', 'success');
  });
  document.getElementById('btn-reset-kpi').addEventListener('click', async () => {
    if (!confirm('Remettre à 0 toutes les valeurs cibles des 6 KPI pour ' + state.produitActif?.code + ' ?')) return;
    const kpis = state.kpiObjectifs.filter(k => k.produit_id === state.produitActif?.id);
    for (const k of kpis) {
      await sb.from('kpi_objectifs').update({ valeur_cible: 0, updated_at: new Date().toISOString() }).eq('id', k.id);
    }
    await loadData(); renderKpi6Table(); renderDashboard();
    showToast('KPI remis à 0', 'success');
  });
  document.getElementById('btn-reset-objectifs-sources').addEventListener('click', async () => {
    if (!confirm('Remettre à 0 tous les objectifs de contacts par source ?')) return;
    for (const o of state.objectifs) {
      await sb.from('objectifs').update({ cible_contacts: 0 }).eq('id', o.id);
    }
    await loadData(); renderObjectifsTable();
    showToast('Objectifs sources remis à 0', 'success');
  });
}

function setupExport() {
  document.getElementById('btn-export-excel').addEventListener('click', exportToExcel);
  document.getElementById('kpi-periode-filtre')?.addEventListener('change', () => renderDashboard());
}

function setupFullscreen() {
  document.getElementById('btn-fullscreen-cal').addEventListener('click', () => {
    const c = document.getElementById('calendar-container');
    c.classList.toggle('fullscreen');
    document.getElementById('btn-fullscreen-cal').textContent = c.classList.contains('fullscreen') ? '⛶ Quitter' : '⛶ Plein écran';
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
  document.getElementById('btn-add-source-cal').addEventListener('click', () => openModalSource());
  document.getElementById('btn-add-jalon').addEventListener('click', () => openModalJalon());
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
  document.getElementById('btn-voir-checklist').addEventListener('click', () => {
    const srcId = parseInt(document.getElementById('event-source').value);
    if (srcId) openChecklistModal(srcId);
  });
  document.getElementById('btn-add-objectif-evt').addEventListener('click', () => {
    const evtId = document.getElementById('event-id').value;
    if (!evtId) { showToast('Enregistrez d\'abord l\'événement', 'error'); return; }
    openModalObjectifEvt({ evenement_id: parseInt(evtId) });
  });

  document.getElementById('modal-periode-close').addEventListener('click', () => closeM('modal-periode'));
  document.getElementById('modal-periode').addEventListener('click', e => { if (e.target.id === 'modal-periode') closeM('modal-periode'); });
  document.getElementById('periode-form').addEventListener('submit', savePeriode);

  document.getElementById('modal-cible-close').addEventListener('click', () => closeM('modal-cible'));
  document.getElementById('modal-cible').addEventListener('click', e => { if (e.target.id === 'modal-cible') closeM('modal-cible'); });
  document.getElementById('cible-form').addEventListener('submit', saveCible);
  document.getElementById('btn-delete-cible').addEventListener('click', deleteCible);

  // Résultats attendus multiples
  document.getElementById('cible-resultat-select').addEventListener('change', e => {
    if (e.target.value) {
      addResultatTag(e.target.value);
      e.target.value = '';
    }
  });
  document.getElementById('cible-resultat-libre').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const v = e.target.value.trim();
      if (v) { addResultatTag(v); e.target.value = ''; }
    }
  });
  document.getElementById('cible-echeance').addEventListener('change', e => {
    document.getElementById('cible-echeance-alert').style.display = e.target.value ? 'none' : 'inline';
  });

  document.getElementById('modal-checklist-close').addEventListener('click', () => closeM('modal-checklist'));
  document.getElementById('modal-checklist').addEventListener('click', e => { if (e.target.id === 'modal-checklist') closeM('modal-checklist'); });
  document.getElementById('btn-add-checklist-item').addEventListener('click', () => openModalChecklistItem({ source_id: state.currentChecklistSourceId }));

  document.getElementById('modal-cl-item-close').addEventListener('click', () => closeM('modal-checklist-item'));
  document.getElementById('modal-checklist-item').addEventListener('click', e => { if (e.target.id === 'modal-checklist-item') closeM('modal-checklist-item'); });
  document.getElementById('cl-item-form').addEventListener('submit', saveChecklistItem);
  document.getElementById('btn-delete-cl-item').addEventListener('click', deleteChecklistItem);

  document.getElementById('modal-obj-evt-close').addEventListener('click', () => closeM('modal-objectif-evt'));
  document.getElementById('modal-objectif-evt').addEventListener('click', e => { if (e.target.id === 'modal-objectif-evt') closeM('modal-objectif-evt'); });
  document.getElementById('obj-evt-form').addEventListener('submit', saveObjectifEvt);
  document.getElementById('btn-delete-obj-evt').addEventListener('click', deleteObjectifEvt);

  document.getElementById('modal-source-close').addEventListener('click', () => closeM('modal-source'));
  document.getElementById('modal-source').addEventListener('click', e => { if (e.target.id === 'modal-source') closeM('modal-source'); });
  document.getElementById('source-form').addEventListener('submit', saveSource);

  document.getElementById('modal-jalon-close').addEventListener('click', () => closeM('modal-jalon'));
  document.getElementById('modal-jalon').addEventListener('click', e => { if (e.target.id === 'modal-jalon') closeM('modal-jalon'); });
  document.getElementById('jalon-form').addEventListener('submit', saveJalon);
  document.getElementById('btn-delete-jalon').addEventListener('click', deleteJalon);
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
// MODALE TÂCHE v8 (avec case terminée + résultats multiples + 2 champs nombre)
// ============================================================
function openModalCible(prefill = {}) {
  document.getElementById('cible-form').reset();
  document.getElementById('cible-id').value = prefill.id || '';
  document.getElementById('modal-cible-title').textContent = prefill.id ? 'Modifier la tâche' : 'Nouvelle tâche';
  document.getElementById('btn-delete-cible').classList.toggle('hidden', !prefill.id);

  // Select Colonne/Étape : les 5 colonnes
  const domSel = document.getElementById('cible-domaine');
  domSel.innerHTML = '';
  COLONNES_V8.forEach(col => {
    const o = document.createElement('option');
    o.value = col.numero;
    o.textContent = col.numero + '. ' + col.libelle;
    domSel.appendChild(o);
  });

  // Déterminer la colonne actuelle
  let currentCol = 1;
  if (prefill.id) {
    currentCol = getColonneCible(prefill);
  } else if (prefill._forceCol) {
    currentCol = prefill._forceCol;
  }
  domSel.value = currentCol;

  domSel.addEventListener('change', () => updateColonneSections(parseInt(domSel.value)));

  const respSel = document.getElementById('cible-responsable');
  respSel.innerHTML = '<option value="">—</option>';
  state.utilisateurs.forEach(u => {
    const o = document.createElement('option');
    o.value = u.id; o.textContent = (u.prenom||'')+' '+(u.nom||'');
    if (prefill.responsable_id === u.id || (!prefill.id && u.id === state.user.id)) o.selected = true;
    respSel.appendChild(o);
  });

  const srcSel = document.getElementById('cible-source');
  srcSel.innerHTML = '<option value="">—</option>';
  state.sources.filter(s => s.groupe !== 'OUTIL').forEach(s => {
    const o = document.createElement('option');
    o.value = s.id; o.textContent = (s.parent_id ? '  └ ' : '') + s.nom;
    if (prefill.source_id === s.id) o.selected = true;
    srcSel.appendChild(o);
  });

  // Résultats attendus
  state.tempResultats = [];
  if (prefill.id) {
    const existingResultats = state.cibleResultats.filter(r => r.cible_id === prefill.id);
    existingResultats.forEach(r => state.tempResultats.push(r.resultat_libelle));
    if (existingResultats.length === 0 && prefill.resultat_attendu) state.tempResultats.push(prefill.resultat_attendu);
  }
  renderResultatsTags();

  if (prefill.id) {
    document.getElementById('cible-description').value = prefill.description_action || prefill.intitule || '';
    document.getElementById('cible-nb-contacts').value = prefill.nombre_contacts_attendus || 0;
    document.getElementById('cible-nb-rdv').value = prefill.nombre_rdv_attendus || 0;
    if (document.getElementById('cible-nb-appels')) document.getElementById('cible-nb-appels').value = prefill.nb_appels || 0;
    // Champs col 3
    const el3a = document.getElementById('cible-nb-besoins-id');
    const el3b = document.getElementById('cible-nb-besoins-ret');
    if (el3a) el3a.value = prefill.nb_besoins_id || 0;
    if (el3b) el3b.value = prefill.nb_besoins_ret || 0;
    // Champs col 4
    const el4a = document.getElementById('cible-nb-prop-real');
    const el4b = document.getElementById('cible-nb-prop-ret');
    if (el4a) el4a.value = prefill.nb_prop_real || 0;
    if (el4b) el4b.value = prefill.nb_prop_ret || 0;

    document.getElementById('cible-echeance').value = prefill.date_echeance || '';
    document.getElementById('cible-echeance-alert').style.display = prefill.date_echeance ? 'none' : 'inline';
    document.getElementById('cible-montant').value = prefill.montant_estime || 0;
    document.getElementById('cible-confiance').value = prefill.niveau_confiance ?? 0.5;
    document.getElementById('cible-notes').value = prefill.notes || '';
    document.getElementById('cible-terminee').checked = prefill.est_terminee || false;
    document.getElementById('cible-date-signature').value = prefill.date_signature || '';
    document.getElementById('cible-periode').value = prefill.periode_msi || '';
    let statut = prefill.statut_avancement || 'Négociation';
    if (['Communication','Financement','Paiement','CRM'].includes(statut)) statut = 'Négociation';
    document.getElementById('cible-statut-avancement').value = statut;
    document.getElementById('cible-etape').value = prefill.etape || currentCol;
  } else {
    document.getElementById('cible-etape').value = currentCol;
    document.getElementById('cible-echeance-alert').style.display = 'inline';
  }

  updateColonneSections(currentCol);
  document.getElementById('modal-cible').classList.remove('hidden');
}

function updateColonneSections(colNum) {
  const s1 = document.getElementById('section-col-1');
  const s2 = document.getElementById('section-col-2');
  const s3 = document.getElementById('section-col-3');
  const s4 = document.getElementById('section-col-4');
  const s5 = document.getElementById('section-avancement');
  if (s1) s1.style.display = (colNum === 1) ? 'flex' : 'none';
  if (s2) s2.style.display = (colNum === 2) ? 'flex' : 'none';
  if (s3) s3.style.display = (colNum === 3) ? 'flex' : 'none';
  if (s4) s4.style.display = (colNum === 4) ? 'flex' : 'none';
  if (s5) s5.style.display = (colNum >= 5) ? 'flex' : 'none';
  document.getElementById('cible-etape').value = colNum;
}

  const respSel = document.getElementById('cible-responsable');
  respSel.innerHTML = '<option value="">—</option>';
  state.utilisateurs.forEach(u => {
    const o = document.createElement('option');
    o.value = u.id; o.textContent = (u.prenom||'')+' '+(u.nom||'');
    if (prefill.responsable_id === u.id || (!prefill.id && u.id === state.user.id)) o.selected = true;
    respSel.appendChild(o);
  });

  const srcSel = document.getElementById('cible-source');
  srcSel.innerHTML = '<option value="">—</option>';
  state.sources.filter(s => s.groupe !== 'OUTIL').forEach(s => {
    const o = document.createElement('option');
    o.value = s.id; o.textContent = (s.parent_id ? '  └ ' : '') + s.nom;
    if (prefill.source_id === s.id) o.selected = true;
    srcSel.appendChild(o);
  });

function updateResultatsSelect(domId) {
  const sel = document.getElementById('cible-resultat-select');
  sel.innerHTML = '<option value="">— Choisir dans la liste —</option>';
  state.resultatsAttendus.filter(r => r.domaine_id === domId).forEach(r => {
    if (!state.tempResultats.includes(r.libelle)) {
      const o = document.createElement('option');
      o.value = r.libelle; o.textContent = r.libelle;
      sel.appendChild(o);
    }
  });
}

function addResultatTag(libelle) {
  if (state.tempResultats.includes(libelle)) return;
  state.tempResultats.push(libelle);
  renderResultatsTags();
  const domId = parseInt(document.getElementById('cible-domaine').value);
  if (domId) updateResultatsSelect(domId);
}

function removeResultatTag(libelle) {
  state.tempResultats = state.tempResultats.filter(r => r !== libelle);
  renderResultatsTags();
  const domId = parseInt(document.getElementById('cible-domaine').value);
  if (domId) updateResultatsSelect(domId);
}

function renderResultatsTags() {
  const container = document.getElementById('resultats-attendus-list');
  container.innerHTML = '';
  if (state.tempResultats.length === 0) {
    container.innerHTML = '<span class="hint">Aucun résultat ajouté</span>';
    return;
  }
  state.tempResultats.forEach(r => {
    const tag = document.createElement('span');
    tag.className = 'resultat-tag';
    tag.innerHTML = `${r}<span class="resultat-tag-delete">✕</span>`;
    tag.querySelector('.resultat-tag-delete').addEventListener('click', () => removeResultatTag(r));
    container.appendChild(tag);
  });
}

document.addEventListener('change', e => {
  if (e.target.id === 'cible-domaine') updateResultatsSelect(parseInt(e.target.value));
});

async function saveCible(e) {
  e.preventDefault();
  const id = document.getElementById('cible-id').value;
  const colNum = parseInt(document.getElementById('cible-domaine').value) || 1;

  // Trouver le domaine_id correspondant au numéro de colonne (si <= 3)
  let domaineId = null;
  if (colNum <= 3) {
    const dom = state.domaines.find(d => d.numero === colNum);
    if (dom) domaineId = dom.id;
  }

  const estTerminee = document.getElementById('cible-terminee').checked;
  const data = {
    description_action: document.getElementById('cible-description').value,
    intitule: document.getElementById('cible-description').value,
    domaine_id: domaineId,
    responsable_id: document.getElementById('cible-responsable').value || null,
    source_id: parseInt(document.getElementById('cible-source').value) || null,
    nombre_contacts_attendus: parseInt(document.getElementById('cible-nb-contacts').value) || 0,
    nombre_rdv_attendus: parseInt(document.getElementById('cible-nb-rdv').value) || 0,
    nb_appels: parseInt(document.getElementById('cible-nb-appels')?.value) || 0,
    date_echeance: document.getElementById('cible-echeance').value || null,
    etape: colNum,
    periode_msi: document.getElementById('cible-periode').value || null,
    montant_estime: parseFloat(document.getElementById('cible-montant').value) || 0,
    niveau_confiance: parseFloat(document.getElementById('cible-confiance').value) || 0.5,
    notes: document.getElementById('cible-notes').value || null,
    statut_avancement: colNum >= 5 ? document.getElementById('cible-statut-avancement').value : null,
    est_terminee: estTerminee,
    date_terminee: estTerminee ? new Date().toISOString() : null,
    produit_id: state.produitActif?.id || null,
    updated_at: new Date().toISOString()
  };
  if (data.statut_avancement === 'Signé') {
    data.date_signature = document.getElementById('cible-date-signature').value || new Date().toISOString().split('T')[0];
  }

  const { data: result, error } = id 
    ? await sb.from('cibles_msi').update(data).eq('id', id).select() 
    : await sb.from('cibles_msi').insert([data]).select();
  
  if (error) { showToast('Erreur : ' + error.message, 'error'); return; }
  
  const cibleId = id || (result && result[0]?.id);
  if (cibleId) {
    // Supprimer anciens résultats puis re-créer
    await sb.from('cible_resultats_attendus').delete().eq('cible_id', cibleId);
    for (const r of state.tempResultats) {
      await sb.from('cible_resultats_attendus').insert([{ cible_id: cibleId, resultat_libelle: r }]);
      // Ajouter à la liste globale si nouveau
      if (domaineId && !state.resultatsAttendus.find(x => x.domaine_id === domaineId && x.libelle === r)) {
        await sb.from('resultats_attendus').upsert({ domaine_id: domaineId, libelle: r, ordre_affichage: 999 }, { onConflict: 'domaine_id,libelle' });
      }
    }
  }
  showToast(id ? 'Tâche modifiée' : 'Tâche créée', 'success');
  closeM('modal-cible');
  await loadData(); renderAll();
}

async function deleteCible() {
  const id = document.getElementById('cible-id').value;
  if (!id || !confirm('Supprimer cette tâche ?')) return;
  await sb.from('cibles_msi').delete().eq('id', id);
  showToast('Tâche supprimée', 'success'); closeM('modal-cible'); await loadData(); renderAll();
}

// ============================================================
// ÉVÉNEMENTS
// ============================================================
function openModal(prefill = {}) {
  document.getElementById('event-form').reset();
  document.getElementById('event-id').value = prefill.id || '';
  document.getElementById('modal-title').textContent = prefill.id ? 'Modifier événement' : 'Nouvel événement';
  document.getElementById('btn-delete').classList.toggle('hidden', !prefill.id);
  const srcSelect = document.getElementById('event-source');
  srcSelect.innerHTML = '<option value="">Choisir...</option>';
  state.sources.filter(s => s.groupe !== 'OUTIL').forEach(s => {
    const o = document.createElement('option');
    o.value = s.id; o.textContent = (s.parent_id ? '  └ ' : '') + s.nom;
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
    document.getElementById('event-date-fin').value = prefill.date_fin || '';
    document.getElementById('event-type').value = prefill.type_evenement || 'Extérieur';
    document.getElementById('event-lieu-libre').value = prefill.lieu_libre || '';
    document.getElementById('event-lieu-ville').value = prefill.lieu_ville || '';
    document.getElementById('event-lieu-cp').value = prefill.lieu_code_postal || '';
    document.getElementById('event-lieu-adresse').value = prefill.lieu_adresse || '';
    document.getElementById('event-comment').value = prefill.comment_preparation || '';
    document.getElementById('event-notes').value = prefill.notes || '';
    renderEventObjectifsList(prefill.id);
  } else if (prefill.date_evenement) {
    document.getElementById('event-date').value = prefill.date_evenement;
    document.getElementById('event-quoi').value = prefill.quoi || '';
    document.getElementById('event-objectifs-list').innerHTML = '<p class="hint">Enregistrez l\'événement pour ajouter des objectifs.</p>';
  }
  document.getElementById('modal').classList.remove('hidden');
}

function renderEventObjectifsList(evtId) {
  const container = document.getElementById('event-objectifs-list');
  container.innerHTML = '';
  const objs = state.evtObjectifs.filter(o => o.evenement_id === evtId);
  if (objs.length === 0) { container.innerHTML = '<p class="hint">Aucun objectif défini.</p>'; return; }
  objs.forEach(o => {
    const div = document.createElement('div');
    div.className = 'event-objectif-item';
    const realise = o.nombre_realise !== null ? o.nombre_realise : '—';
    div.innerHTML = `<div class="event-objectif-item-content"><div class="event-objectif-item-type">${o.type_objectif}</div><div class="event-objectif-item-desc">${o.description || '(sans description)'}</div></div><div class="event-objectif-item-stats"><strong>${realise}</strong> / ${o.nombre_cible}</div>`;
    div.addEventListener('click', () => openModalObjectifEvt(o));
    container.appendChild(div);
  });
}

async function saveEvent(e) {
  e.preventDefault();
  const id = document.getElementById('event-id').value;
  const data = {
    quoi: document.getElementById('event-quoi').value,
    source_id: parseInt(document.getElementById('event-source').value) || null,
    responsable_id: document.getElementById('event-responsable').value || null,
    date_evenement: document.getElementById('event-date').value,
    date_fin: document.getElementById('event-date-fin').value || null,
    type_evenement: document.getElementById('event-type').value,
    lieu_libre: document.getElementById('event-lieu-libre').value || null,
    lieu_ville: document.getElementById('event-lieu-ville').value || null,
    lieu_code_postal: document.getElementById('event-lieu-cp').value || null,
    lieu_adresse: document.getElementById('event-lieu-adresse').value || null,
    comment_preparation: document.getElementById('event-comment').value,
    notes: document.getElementById('event-notes').value
  };
  const { data: result, error } = id
    ? await sb.from('evenements').update(data).eq('id', id).select()
    : await sb.from('evenements').insert([data]).select();
  if (error) showToast('Erreur : ' + error.message, 'error');
  else {
    showToast(id ? 'Événement modifié' : 'Événement créé', 'success');
    if (!id && result && result[0]) {
      document.getElementById('event-id').value = result[0].id;
      renderEventObjectifsList(result[0].id);
      document.getElementById('btn-delete').classList.remove('hidden');
      await loadData();
      renderCalendar(); // rafraîchissement rapide
    } else {
      closeM('modal');
      await loadData();
      renderAll();
    }
  }
}

async function deleteEvent() {
  const id = document.getElementById('event-id').value;
  if (!id || !confirm('Supprimer cet événement ?')) return;
  await sb.from('evenements').delete().eq('id', id);
  showToast('Événement supprimé', 'success'); closeM('modal'); await loadData(); renderAll();
}

function openModalObjectifEvt(prefill = {}) {
  document.getElementById('obj-evt-form').reset();
  document.getElementById('obj-evt-id').value = prefill.id || '';
  document.getElementById('obj-evt-evt-id').value = prefill.evenement_id || document.getElementById('event-id').value;
  document.getElementById('modal-obj-evt-title').textContent = prefill.id ? 'Modifier objectif' : 'Nouvel objectif';
  document.getElementById('btn-delete-obj-evt').classList.toggle('hidden', !prefill.id);
  if (prefill.id) {
    document.getElementById('obj-evt-type').value = prefill.type_objectif || 'Contacts';
    document.getElementById('obj-evt-desc').value = prefill.description || '';
    document.getElementById('obj-evt-cible').value = prefill.nombre_cible || 0;
    document.getElementById('obj-evt-realise').value = prefill.nombre_realise ?? '';
    document.getElementById('obj-evt-commentaire').value = prefill.commentaire || '';
  }
  document.getElementById('modal-objectif-evt').classList.remove('hidden');
}

async function saveObjectifEvt(e) {
  e.preventDefault();
  const id = document.getElementById('obj-evt-id').value;
  const evtId = parseInt(document.getElementById('obj-evt-evt-id').value);
  const data = {
    evenement_id: evtId,
    type_objectif: document.getElementById('obj-evt-type').value,
    description: document.getElementById('obj-evt-desc').value || null,
    nombre_cible: parseInt(document.getElementById('obj-evt-cible').value) || 0,
    nombre_realise: document.getElementById('obj-evt-realise').value ? parseInt(document.getElementById('obj-evt-realise').value) : null,
    commentaire: document.getElementById('obj-evt-commentaire').value || null
  };
  const { error } = id ? await sb.from('evenement_objectifs').update(data).eq('id', id) : await sb.from('evenement_objectifs').insert([data]);
  if (error) showToast('Erreur : ' + error.message, 'error');
  else { showToast(id ? 'Objectif modifié' : 'Objectif créé', 'success'); closeM('modal-objectif-evt'); await loadData(); renderEventObjectifsList(evtId); }
}

async function deleteObjectifEvt() {
  const id = document.getElementById('obj-evt-id').value;
  const evtId = parseInt(document.getElementById('obj-evt-evt-id').value);
  if (!id || !confirm('Supprimer cet objectif ?')) return;
  await sb.from('evenement_objectifs').delete().eq('id', id);
  showToast('Objectif supprimé', 'success'); closeM('modal-objectif-evt'); await loadData(); renderEventObjectifsList(evtId);
}

// ============================================================
// CHECKLISTS
// ============================================================
function openChecklistModal(sourceId) {
  state.currentChecklistSourceId = sourceId;
  const src = state.sources.find(s => s.id === sourceId);
  if (!src) return;
  document.getElementById('modal-checklist-title').textContent = 'Checklist : ' + src.nom;
  document.getElementById('checklist-info').innerHTML = `<strong>${src.nom}</strong><span class="checklist-info-sep">·</span>${src.categorie || 'Source'}<br>Cette checklist est partagée entre tous les utilisateurs et événements de cette source.`;
  renderChecklistItems(sourceId);
  document.getElementById('modal-checklist').classList.remove('hidden');
}

function renderChecklistItems(sourceId) {
  const container = document.getElementById('checklist-items');
  container.innerHTML = '';
  const items = state.checklist.filter(c => c.source_id === sourceId);
  const countEl = document.getElementById('checklist-count');
  if (countEl) countEl.innerHTML = `<strong>${items.length}</strong> action${items.length > 1 ? 's' : ''}`;
  if (items.length === 0) {
    container.innerHTML = '<p class="empty">Aucune action dans la checklist. Cliquez sur "+ Ajouter une action".</p>';
    return;
  }
  items.forEach((item, idx) => {
    const div = document.createElement('div');
    div.className = 'checklist-item';
    let detailsHTML = '';
    if (item.delai) detailsHTML += `<span class="checklist-detail-badge checklist-detail-delai">${item.delai}</span>`;
    if (item.responsable_type) detailsHTML += `<span class="checklist-detail-badge checklist-detail-responsable">${item.responsable_type}</span>`;
    if (item.outils) detailsHTML += `<span class="checklist-detail-badge checklist-detail-outils">${item.outils}</span>`;
    div.innerHTML = `<div class="checklist-item-number">${idx + 1}</div><div class="checklist-item-content"><div class="checklist-item-action">${item.action}</div>${detailsHTML ? `<div class="checklist-item-details">${detailsHTML}</div>` : ''}</div><button class="checklist-item-edit" type="button">Modifier</button>`;
    div.addEventListener('click', () => openModalChecklistItem(item));
    container.appendChild(div);
  });
}

function openModalChecklistItem(prefill = {}) {
  document.getElementById('cl-item-form').reset();
  document.getElementById('cl-item-id').value = prefill.id || '';
  document.getElementById('cl-item-source-id').value = prefill.source_id || state.currentChecklistSourceId;
  document.getElementById('modal-cl-item-title').textContent = prefill.id ? 'Modifier action' : 'Nouvelle action';
  document.getElementById('btn-delete-cl-item').classList.toggle('hidden', !prefill.id);
  if (prefill.id) {
    document.getElementById('cl-item-action').value = prefill.action || '';
    document.getElementById('cl-item-responsable').value = prefill.responsable_type || '';
    document.getElementById('cl-item-delai').value = prefill.delai || '';
    document.getElementById('cl-item-outils').value = prefill.outils || '';
  }
  document.getElementById('modal-checklist-item').classList.remove('hidden');
}

async function saveChecklistItem(e) {
  e.preventDefault();
  const id = document.getElementById('cl-item-id').value;
  const sourceId = parseInt(document.getElementById('cl-item-source-id').value);
  const data = {
    source_id: sourceId,
    action: document.getElementById('cl-item-action').value,
    responsable_type: document.getElementById('cl-item-responsable').value || null,
    delai: document.getElementById('cl-item-delai').value || null,
    outils: document.getElementById('cl-item-outils').value || null
  };
  const { error } = id ? await sb.from('checklist_source').update(data).eq('id', id) : await sb.from('checklist_source').insert([data]);
  if (error) showToast('Erreur : ' + error.message, 'error');
  else { showToast(id ? 'Action modifiée' : 'Action créée', 'success'); closeM('modal-checklist-item'); await loadData(); renderChecklistItems(sourceId); }
}

async function deleteChecklistItem() {
  const id = document.getElementById('cl-item-id').value;
  const sourceId = parseInt(document.getElementById('cl-item-source-id').value);
  if (!id || !confirm('Supprimer cette action ?')) return;
  await sb.from('checklist_source').delete().eq('id', id);
  showToast('Action supprimée', 'success'); closeM('modal-checklist-item'); await loadData(); renderChecklistItems(sourceId);
}

// ============================================================
// SOURCES (création depuis calendrier)
// ============================================================
function openModalSource(prefill = {}) {
  document.getElementById('source-form').reset();
  document.getElementById('source-id').value = prefill.id || '';
  document.getElementById('modal-source-title').textContent = prefill.id ? 'Modifier source' : 'Nouvelle source';
  const parentSel = document.getElementById('source-parent');
  parentSel.innerHTML = '<option value="">— Aucun parent (source principale)</option>';
  state.sources.filter(s => !s.parent_id && s.id !== prefill.id).forEach(s => {
    const o = document.createElement('option');
    o.value = s.id; o.textContent = s.nom;
    if (prefill.parent_id === s.id) o.selected = true;
    parentSel.appendChild(o);
  });
  if (prefill.id) {
    document.getElementById('source-nom').value = prefill.nom || '';
    document.getElementById('source-groupe').value = prefill.groupe || 'EVENEMENT';
    document.getElementById('source-categorie').value = prefill.categorie || '';
  }
  document.getElementById('modal-source').classList.remove('hidden');
}

async function saveSource(e) {
  e.preventDefault();
  const id = document.getElementById('source-id').value;
  const data = {
    nom: document.getElementById('source-nom').value,
    groupe: document.getElementById('source-groupe').value,
    categorie: document.getElementById('source-categorie').value || null,
    parent_id: parseInt(document.getElementById('source-parent').value) || null,
    ordre_affichage: 100
  };
  const { error } = id ? await sb.from('sources').update(data).eq('id', id) : await sb.from('sources').insert([data]);
  if (error) showToast('Erreur : ' + error.message, 'error');
  else { showToast(id ? 'Source modifiée' : 'Source créée', 'success'); closeM('modal-source'); await loadData(); renderCalendar(); }
}

// ============================================================
// JALONS MSI
// ============================================================
function openModalJalon(prefill = {}) {
  document.getElementById('jalon-form').reset();
  document.getElementById('jalon-id').value = prefill.id || '';
  document.getElementById('modal-jalon-title').textContent = prefill.id ? 'Modifier le jalon' : 'Nouveau jalon MSI';
  document.getElementById('btn-delete-jalon').classList.toggle('hidden', !prefill.id);
  if (prefill.id) {
    document.getElementById('jalon-titre').value = prefill.titre || '';
    document.getElementById('jalon-type').value = prefill.type_jalon || 'Revue projet';
    document.getElementById('jalon-couleur').value = prefill.couleur || '#A32D2D';
    document.getElementById('jalon-date').value = prefill.date_debut || '';
    document.getElementById('jalon-date-fin').value = prefill.date_fin || '';
    document.getElementById('jalon-desc').value = prefill.description || '';
  }
  document.getElementById('modal-jalon').classList.remove('hidden');
}

async function saveJalon(e) {
  e.preventDefault();
  const id = document.getElementById('jalon-id').value;
  const data = {
    produit_id: state.produitActif?.id || null,
    titre: document.getElementById('jalon-titre').value,
    type_jalon: document.getElementById('jalon-type').value,
    couleur: document.getElementById('jalon-couleur').value,
    date_debut: document.getElementById('jalon-date').value,
    date_fin: document.getElementById('jalon-date-fin').value || null,
    description: document.getElementById('jalon-desc').value || null,
    updated_at: new Date().toISOString()
  };
  const { error } = id ? await sb.from('jalons_msi').update(data).eq('id', id) : await sb.from('jalons_msi').insert([data]);
  if (error) showToast('Erreur : ' + error.message, 'error');
  else { showToast(id ? 'Jalon modifié' : 'Jalon créé', 'success'); closeM('modal-jalon'); await loadData(); renderJalons(); }
}

async function deleteJalon() {
  const id = document.getElementById('jalon-id').value;
  if (!id || !confirm('Supprimer ce jalon ?')) return;
  await sb.from('jalons_msi').delete().eq('id', id);
  showToast('Jalon supprimé', 'success'); closeM('modal-jalon'); await loadData(); renderJalons();
}

// ============================================================
// PÉRIODES
// ============================================================
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
  renderJalons();
  renderEventsTable();
  renderObjectifsAnnuels();
  renderKpi6Table();
  renderObjectifsTable();
  renderRevue();
}

function getCiblesProduitActif() {
  if (!state.produitActif) return state.cibles;
  return state.cibles.filter(c => c.produit_id === state.produitActif.id || (!c.produit_id && state.produitActif.code === 'MSI'));
}

function renderKanban() {
  const board = document.getElementById('kanban-board');
  board.innerHTML = '';
  let cibles = getCiblesProduitActif();
  if (state.plan_periode) cibles = cibles.filter(c => c.periode_msi === state.plan_periode);
  if (state.plan_responsable) cibles = cibles.filter(c => c.responsable_id === state.plan_responsable);
  if (!state.plan_show_done) cibles = cibles.filter(c => !c.est_terminee);

  // Filtres année/mois/semaine sur l'échéance
  if (state.plan_annee) {
    cibles = cibles.filter(c => {
      if (!c.date_echeance) return false;
      return new Date(c.date_echeance).getFullYear() === parseInt(state.plan_annee);
    });
  }
  if (state.plan_mois !== '' && state.plan_mois !== null) {
    cibles = cibles.filter(c => {
      if (!c.date_echeance) return false;
      return new Date(c.date_echeance).getMonth() === parseInt(state.plan_mois);
    });
  }
  if (state.plan_semaine) {
    cibles = cibles.filter(c => {
      if (!c.date_echeance) return false;
      return dateToWeek(c.date_echeance) === parseInt(state.plan_semaine);
    });
  }

  COLONNES_V8.forEach(col => {
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
      if (getColonneCible(cible) === col.numero) return;
      // Mettre à jour la colonne en BDD
      const newData = { updated_at: new Date().toISOString() };
      if (col.numero <= 3) {
        const dom = state.domaines.find(d => d.numero === col.numero);
        if (dom) { newData.domaine_id = dom.id; newData.etape = col.numero; newData.statut_avancement = null; }
      } else if (col.numero === 4) {
        newData.etape = 4; newData.statut_avancement = null;
      } else if (col.numero === 5) {
        newData.etape = 5;
        if (!cible.statut_avancement || ['Communication','Financement','Paiement','CRM'].includes(cible.statut_avancement)) {
          newData.statut_avancement = 'Négociation';
        }
      }
      await sb.from('cibles_msi').update(newData).eq('id', cibleId);
      await loadData();
      // Ouvrir la modale avec la bonne colonne pré-sélectionnée
      const updatedCible = state.cibles.find(c => c.id === cibleId);
      if (updatedCible) {
        openModalCible({ ...updatedCible, _forceCol: col.numero });
      }
      renderAll();
    });

    if (cs.length === 0) {
      body.innerHTML = '<div class="kanban-empty">Aucune tâche</div>';
    } else {
      cs.forEach(c => renderKanbanCard(c, col, body));
    }
  });
}

function renderKanbanCard(c, col, body) {
  const resp = state.utilisateurs.find(u => u.id === c.responsable_id);
  const src = state.sources.find(s => s.id === c.source_id);
  const card = document.createElement('div');
  card.className = 'kanban-card';
  if (c.est_terminee) card.classList.add('tache-terminee');
  if (isTacheEnRetard(c)) card.classList.add('tache-retard');
  if (isTacheSansEcheance(c)) card.classList.add('tache-retard-soft');
  card.draggable = !c.est_terminee;
  card.style.borderLeftColor = col.couleur;

  const description = c.description_action || c.intitule || '(sans description)';

  // Header avec checkbox
  let html = `
    <div class="kanban-card-header">
      <label class="kanban-card-check" onclick="event.stopPropagation()">
        <input type="checkbox" data-toggle-done="${c.id}" ${c.est_terminee ? 'checked' : ''}>
      </label>
      <div class="kanban-card-title">${description}</div>
    </div>
  `;

  // Résultats attendus (multiples)
  const resultats = state.cibleResultats.filter(r => r.cible_id === c.id);
  const resultatsLibelles = resultats.map(r => r.resultat_libelle);
  if (resultatsLibelles.length === 0 && c.resultat_attendu) resultatsLibelles.push(c.resultat_attendu);
  if (resultatsLibelles.length > 0) {
    html += `<div class="kanban-card-resultat"><strong>Attendu :</strong> ${resultatsLibelles.join(', ')}</div>`;
  }

  // Nombres attendus
  if (c.nombre_contacts_attendus > 0 || c.nombre_rdv_attendus > 0) {
    html += `<div class="kanban-card-nb">`;
    if (c.nombre_contacts_attendus > 0) html += `<span>👥 ${c.nombre_contacts_attendus} contacts</span>`;
    if (c.nombre_rdv_attendus > 0) html += `<span>🗓️ ${c.nombre_rdv_attendus} RDV</span>`;
    html += `</div>`;
  }

  if (src) html += `<div class="kanban-card-resultat" style="font-size:10px;">${src.nom}</div>`;

  html += `<div class="kanban-card-meta">`;
  html += `<span>${resp ? (resp.prenom||'').charAt(0)+'. '+(resp.nom||'') : '—'}</span>`;
  if (col.numero === 5 && c.statut_avancement) {
    html += `<span class="kanban-card-statut">${c.statut_avancement}</span>`;
  } else if (c.date_echeance) {
    const isOver = isTacheEnRetard(c);
    html += `<span class="kanban-card-echeance${isOver ? ' overdue' : ''}">${new Date(c.date_echeance).toLocaleDateString('fr-FR')}${isOver ? ' ⚠️' : ''}</span>`;
  } else if (!c.est_terminee) {
    html += `<span class="kanban-card-echeance missing">⚠️ Sans échéance</span>`;
  }
  if (col.numero === 5 && c.montant_estime > 0) html += `<span class="kanban-card-montant">${formatEuro(c.montant_estime)} €</span>`;
  html += `</div>`;

  card.innerHTML = html;

  // Drag & drop
  card.addEventListener('dragstart', e => {
    if (c.est_terminee) { e.preventDefault(); return; }
    state.draggedCibleId = c.id; card.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move';
  });
  card.addEventListener('dragend', () => { card.classList.remove('dragging'); state.draggedCibleId = null; });

  // Toggle terminée
  card.querySelector('[data-toggle-done]').addEventListener('change', async e => {
    e.stopPropagation();
    const done = e.target.checked;
    await sb.from('cibles_msi').update({ 
      est_terminee: done, 
      date_terminee: done ? new Date().toISOString() : null,
      updated_at: new Date().toISOString()
    }).eq('id', c.id);
    await loadData(); renderAll();
    showToast(done ? 'Tâche marquée comme terminée' : 'Tâche réouverte', 'success');
  });

  // Clic ouverture
  card.addEventListener('click', e => {
    if (e.target.type === 'checkbox') return;
    if (!card.classList.contains('dragging')) openModalCible(c);
  });

  body.appendChild(card);
}

function renderDashboard() {
  const objAnnuelGlobal = state.objectifsAnnuels.find(o => o.annee === state.annee && o.periode_msi === 'ANNUEL');
  const caObjectif = objAnnuelGlobal?.ca_cible || 0;
  const msiObjectif = objAnnuelGlobal?.msi_cible || 0;
  const cibles = getCiblesProduitActif();
  const ciblesOuvertes = cibles.filter(c => !c.est_terminee);
  const ciblesEnAvancement = cibles.filter(c => getColonneCible(c) === 5 && !c.est_terminee);
  const ciblesSignees = cibles.filter(c => c.statut_avancement === 'Signé');
  const ciblesPerdues = cibles.filter(c => c.statut_avancement === 'Perdu');
  const ciblesEnNegociation = cibles.filter(c => c.statut_avancement === 'Négociation' && !c.est_terminee);
  const ciblesSigneesAvecDate = ciblesSignees.filter(c => c.date_signature);
  const ciblesSigneesSansDate = ciblesSignees.filter(c => !c.date_signature);

  // Filtre période MSI pour le KPI contrats signés
  const periodeFiltre = document.getElementById('kpi-periode-filtre')?.value || '';
  const ciblesSigneesPeriode = periodeFiltre ? ciblesSignees.filter(c => c.periode_msi === periodeFiltre) : ciblesSignees;
  const ciblesSigneesAvecDatePeriode = ciblesSigneesPeriode.filter(c => c.date_signature);
  const ciblesSigneesSansDatePeriode = ciblesSigneesPeriode.filter(c => !c.date_signature);

  const caSigne = ciblesSigneesPeriode.reduce((s,c) => s + (c.montant_estime || 0), 0);
  const caEnCours = ciblesEnAvancement.filter(c => !['Signé','Perdu'].includes(c.statut_avancement)).reduce((s,c) => s + ((c.montant_estime || 0) * (c.niveau_confiance || 0)), 0);
  const atteinteCA = caObjectif > 0 ? Math.round((caSigne / caObjectif) * 100) : 0;
  const rdvSem = state.suivi.filter(s => s.type_activite === 'RDV qualifiés' && s.annee === state.annee && s.semaine === state.hebdo_semaine).reduce((sum,s) => sum + (s.nombre||0), 0);
  const propMois = state.suivi.filter(s => s.type_activite === 'Propositions envoyées' && s.annee === state.annee && s.semaine >= state.hebdo_semaine-3 && s.semaine <= state.hebdo_semaine).reduce((sum,s) => sum + (s.nombre||0), 0);

  // 3 KPI prioritaires
  document.getElementById('kpi-rdv-sem').textContent = rdvSem;
  document.getElementById('kpi-rdv-sem-obj').textContent = 'Objectif ' + state.kpi_rdv_cible + ' / semaine';
  const cardRdv = document.getElementById('kpi-card-rdv');
  cardRdv.className = 'kpi-card-big ' + (rdvSem >= state.kpi_rdv_cible ? 'kpi-card-ok' : 'kpi-card-alert');
  document.getElementById('kpi-rdv-sem').className = 'kpi-card-big-value ' + (rdvSem >= state.kpi_rdv_cible ? 'kpi-ok' : 'kpi-alert');
  document.getElementById('kpi-rdv-status').className = 'kpi-card-big-status ' + (rdvSem >= state.kpi_rdv_cible ? 'ok' : 'alert');
  document.getElementById('kpi-rdv-status').textContent = rdvSem >= state.kpi_rdv_cible ? 'Atteint' : 'Retard';

  document.getElementById('kpi-prop-mois').textContent = propMois;
  document.getElementById('kpi-prop-mois-obj').textContent = 'Objectif ' + state.kpi_prop_cible + ' / mois';
  const cardProp = document.getElementById('kpi-card-prop');
  cardProp.className = 'kpi-card-big ' + (propMois >= state.kpi_prop_cible ? 'kpi-card-ok' : 'kpi-card-alert');
  document.getElementById('kpi-prop-mois').className = 'kpi-card-big-value ' + (propMois >= state.kpi_prop_cible ? 'kpi-ok' : 'kpi-alert');
  document.getElementById('kpi-prop-status').className = 'kpi-card-big-status ' + (propMois >= state.kpi_prop_cible ? 'ok' : 'alert');
  document.getElementById('kpi-prop-status').textContent = propMois >= state.kpi_prop_cible ? 'Atteint' : 'Retard';

  document.getElementById('kpi-contrats').textContent = ciblesSigneesAvecDatePeriode.length + (ciblesSigneesSansDatePeriode.length > 0 ? ' + ' + ciblesSigneesSansDatePeriode.length + ' ⏳' : '');
  document.getElementById('kpi-contrats-obj').textContent = periodeFiltre ? 'Période ' + periodeFiltre + ' — Objectif ' + msiObjectif : 'Toutes périodes — Objectif ' + msiObjectif;
  const cardContrats = document.getElementById('kpi-card-contrats');
  const contratsOk = msiObjectif > 0 && ciblesSigneesPeriode.length >= msiObjectif;
  cardContrats.className = 'kpi-card-big ' + (contratsOk ? 'kpi-card-ok' : '');
  document.getElementById('kpi-contrats').className = 'kpi-card-big-value ' + (contratsOk ? 'kpi-ok' : '');
  const statusContrats = document.getElementById('kpi-contrats-status');
  if (msiObjectif > 0) { statusContrats.className = 'kpi-card-big-status ' + (contratsOk ? 'ok' : 'alert'); statusContrats.textContent = contratsOk ? 'Atteint' : Math.round((ciblesSigneesPeriode.length/msiObjectif)*100) + ' %'; }
  else statusContrats.textContent = '';

  // 6 KPI avec chiffres ET pourcentages
  const kpiCibles = {};
  if (state.produitActif) {
    state.kpiObjectifs.filter(k => k.produit_id === state.produitActif.id && k.periode_msi === 'ANNUEL').forEach(k => kpiCibles[k.type_kpi] = k.valeur_cible);
  }
  const rdvAnnee = state.suivi.filter(s => s.annee === state.annee && s.type_activite === 'RDV qualifiés').reduce((sum,s) => sum + (s.nombre||0), 0);
  const contactsAnnee = state.suivi.filter(s => s.annee === state.annee && s.type_activite === 'Appels / Contacts').reduce((sum,s) => sum + (s.nombre||0), 0);
  const propAnnee = state.suivi.filter(s => s.annee === state.annee && s.type_activite === 'Propositions envoyées').reduce((sum,s) => sum + (s.nombre||0), 0);

  function setKpi(realiseId, objId, pctId, realise, cible) {
    document.getElementById(realiseId).textContent = realise;
    document.getElementById(objId).textContent = cible ? 'Cible ' + cible : '';
    const pctEl = document.getElementById(pctId);
    if (pctEl) {
      if (cible > 0) {
        const pct = Math.round((realise / cible) * 100);
        pctEl.textContent = pct + ' %';
        pctEl.className = 'kpi-percent' + (pct >= 100 ? '' : (pct < 50 ? ' alert' : ''));
      } else { pctEl.textContent = ''; }
    }
  }
  setKpi('kpi6-contacts', 'kpi6-contacts-obj', 'kpi6-contacts-pct', contactsAnnee, kpiCibles.contacts || 0);
  setKpi('kpi6-rdv', 'kpi6-rdv-obj', 'kpi6-rdv-pct', rdvAnnee, kpiCibles.rdv_qualifies || 0);
  setKpi('kpi6-propales', 'kpi6-propales-obj', 'kpi6-propales-pct', propAnnee, kpiCibles.propales_redigees || 0);
  document.getElementById('kpi6-encours').textContent = ciblesEnNegociation.length;
  setKpi('kpi6-signees', 'kpi6-signees-obj', 'kpi6-signees-pct', ciblesSigneesPeriode.length, kpiCibles.offres_signees || 0);
  const elAttenteDate = document.getElementById('kpi6-attente-date');
  if (elAttenteDate) elAttenteDate.textContent = ciblesSigneesSansDate.length;
  document.getElementById('kpi6-perdues').textContent = ciblesPerdues.length;
  document.getElementById('kpi6-perdues-obj').textContent = kpiCibles.offres_perdues ? 'Cible max ' + kpiCibles.offres_perdues : '';

  document.getElementById('kpi-ca-signe').textContent = formatEuro(caSigne);
  document.getElementById('kpi-ca-cours').textContent = formatEuro(caEnCours);
  document.getElementById('kpi-ca-objectif').textContent = formatEuro(caObjectif);
  document.getElementById('kpi-atteinte-ca').textContent = atteinteCA + ' %';
  document.getElementById('kpi-cibles-act').textContent = ciblesOuvertes.length;

  // Périodes
  const periodes = state.objectifsAnnuels.filter(o => o.annee === state.annee && o.periode_msi !== 'ANNUEL');
  const tbodyPer = document.querySelector('#periodes-table tbody');
  tbodyPer.innerHTML = '';
  if (periodes.length === 0) tbodyPer.innerHTML = '<tr><td colspan="7" class="empty">Aucune période définie.</td></tr>';
  else periodes.forEach(p => {
    const cs = cibles.filter(c => c.periode_msi === p.periode_msi);
    const caSP = cs.filter(c => c.statut_avancement === 'Signé').reduce((s,c) => s + (c.montant_estime||0), 0);
    const caCP = cs.filter(c => !['Signé','Perdu'].includes(c.statut_avancement) && !c.est_terminee).reduce((s,c) => s + ((c.montant_estime||0)*(c.niveau_confiance||0)), 0);
    const sigP = cs.filter(c => c.statut_avancement === 'Signé').length;
    const att = p.ca_cible > 0 ? Math.round((caSP / p.ca_cible)*100) : 0;
    const cls = att >= 100 ? 'badge-success' : (att >= 50 ? 'badge-warning' : 'badge-info');
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><strong>${p.periode_msi}</strong></td><td>${formatEuro(p.ca_cible)} €</td><td>${formatEuro(caSP)} €</td><td>${formatEuro(caCP)} €</td><td><span class="badge ${cls}">${att} %</span></td><td>${p.msi_cible}</td><td>${sigP}</td>`;
    tbodyPer.appendChild(tr);
  });

  // Colonnes : ouvertes vs terminées
  const tbodyCol = document.querySelector('#colonnes-table tbody');
  tbodyCol.innerHTML = '';
  COLONNES_V8.forEach(col => {
    const cs = cibles.filter(c => getColonneCible(c) === col.numero);
    const ouvertes = cs.filter(c => !c.est_terminee).length;
    const terminees = cs.filter(c => c.est_terminee).length;
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><strong>${col.numero}. ${col.libelle}</strong></td><td>${ouvertes}</td><td>${terminees}</td><td>${cs.length}</td>`;
    tbodyCol.appendChild(tr);
  });

  // Tâches en retard
  const tbodyR = document.querySelector('#retards-table tbody');
  tbodyR.innerHTML = '';
  const retards = cibles.filter(c => isTacheEnRetard(c));
  if (retards.length === 0) tbodyR.innerHTML = '<tr><td colspan="5" class="empty">Aucune tâche en retard 🎉</td></tr>';
  else retards.forEach(c => {
    const resp = state.utilisateurs.find(u => u.id === c.responsable_id);
    const col = COLONNES_V8.find(co => co.numero === getColonneCible(c));
    const jours = Math.floor((new Date() - new Date(c.date_echeance)) / 86400000);
    const tr = document.createElement('tr');
    tr.className = 'retard';
    tr.innerHTML = `<td>${c.description_action || c.intitule}</td><td>${resp ? (resp.prenom||'')+' '+(resp.nom||'') : '—'}</td><td>${col?.libelle || '—'}</td><td>${new Date(c.date_echeance).toLocaleDateString('fr-FR')}</td><td><strong>${jours} j</strong></td>`;
    tr.style.cursor = 'pointer';
    tr.addEventListener('click', () => openModalCible(c));
    tbodyR.appendChild(tr);
  });

  // Performance par commercial : tâches actives à faire (ouvertes, non terminées)
  const tbodyC = document.querySelector('#commerciaux-table tbody');
  tbodyC.innerHTML = '';
  if (state.utilisateurs.length === 0) tbodyC.innerHTML = '<tr><td colspan="5" class="empty">Aucun commercial.</td></tr>';
  else state.utilisateurs.forEach(u => {
    const cs = cibles.filter(c => c.responsable_id === u.id);
    const csOuvertes = cs.filter(c => !c.est_terminee).length;
    const rdv = state.suivi.filter(s => s.utilisateur_id === u.id && s.type_activite === 'RDV qualifiés').reduce((sum,s) => sum + (s.nombre||0), 0);
    const prop = state.suivi.filter(s => s.utilisateur_id === u.id && s.type_activite === 'Propositions envoyées').reduce((sum,s) => sum + (s.nombre||0), 0);
    const signe = cs.filter(c => c.statut_avancement === 'Signé').reduce((s,c) => s+(c.montant_estime||0), 0);
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><strong>${u.prenom||''} ${u.nom||''}</strong></td><td>${csOuvertes}</td><td>${rdv}</td><td>${prop}</td><td>${formatEuro(signe)} €</td>`;
    tbodyC.appendChild(tr);
  });

  renderDashboardCharts();
}

function renderKpi6Table() {
  const tbody = document.querySelector('#kpi6-table tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  if (!state.produitActif) return;
  KPI_TYPES.forEach(kpi => {
    const existing = state.kpiObjectifs.find(k => k.produit_id === state.produitActif.id && k.periode_msi === 'ANNUEL' && k.type_kpi === kpi.code);
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><strong>${kpi.label}</strong></td><td><input type="number" class="kpi-input" data-kpi="${kpi.code}" data-id="${existing?.id || ''}" value="${existing?.valeur_cible || 0}" min="0"></td><td><input type="text" class="kpi-input" data-kpi="${kpi.code}" data-field="commentaire" data-id="${existing?.id || ''}" value="${existing?.commentaire || ''}" style="max-width:300px;"></td>`;
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll('.kpi-input').forEach(input => {
    input.addEventListener('change', async () => {
      const kpiCode = input.dataset.kpi;
      const field = input.dataset.field || 'valeur_cible';
      const id = input.dataset.id;
      const val = field === 'commentaire' ? input.value : (parseInt(input.value) || 0);
      const data = { produit_id: state.produitActif.id, periode_msi: 'ANNUEL', type_kpi: kpiCode };
      data[field] = val;
      if (id) await sb.from('kpi_objectifs').update({ [field]: val, updated_at: new Date().toISOString() }).eq('id', id);
      else await sb.from('kpi_objectifs').upsert(data, { onConflict: 'produit_id,periode_msi,type_kpi' });
      await loadData(); renderKpi6Table(); renderDashboard();
      showToast('KPI mis à jour', 'success');
    });
  });
}

function renderDashboardCharts() {
  if (typeof Chart === 'undefined') return;
  const cibles = getCiblesProduitActif();

  if (state.charts.rdvSem) { state.charts.rdvSem.destroy(); delete state.charts.rdvSem; }
  const ctx1 = document.getElementById('chart-rdv-sem');
  if (ctx1) {
    const semaines = [], valeurs = [], objectifs = [];
    for (let i = 11; i >= 0; i--) {
      const w = state.hebdo_semaine - i;
      if (w < 1) continue;
      semaines.push('S' + w);
      valeurs.push(state.suivi.filter(s => s.annee === state.annee && s.semaine === w && s.type_activite === 'RDV qualifiés').reduce((sum,s) => sum + (s.nombre||0), 0));
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

  if (state.charts.pipeline) { state.charts.pipeline.destroy(); delete state.charts.pipeline; }
  const ctx2 = document.getElementById('chart-pipeline');
  if (ctx2) {
    const periodes = state.objectifsAnnuels.filter(o => o.annee === state.annee && o.periode_msi !== 'ANNUEL');
    const labels = periodes.map(p => p.periode_msi);
    const ciblesP = periodes.map(p => p.ca_cible || 0);
    const signes = periodes.map(p => cibles.filter(c => c.periode_msi === p.periode_msi && c.statut_avancement === 'Signé').reduce((s,c) => s + (c.montant_estime||0), 0));
    const enCours = periodes.map(p => cibles.filter(c => c.periode_msi === p.periode_msi && !['Signé','Perdu'].includes(c.statut_avancement) && !c.est_terminee).reduce((s,c) => s + ((c.montant_estime||0)*(c.niveau_confiance||0)), 0));
    if (labels.length > 0) state.charts.pipeline = new Chart(ctx2, {
      type: 'bar',
      data: { labels, datasets: [
        { label: 'Objectif', data: ciblesP, backgroundColor: '#B4B2A9', borderRadius: 4 },
        { label: 'Signé', data: signes, backgroundColor: '#1D9E75', borderRadius: 4 },
        { label: 'En cours (pondéré)', data: enCours, backgroundColor: '#85B7EB', borderRadius: 4 }
      ]},
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } }, tooltip: { callbacks: { label: c => c.dataset.label + ': ' + formatEuro(c.parsed.y) + ' €' } } }, scales: { y: { beginAtZero: true, ticks: { callback: v => formatEuro(v) + ' €' } } } }
    });
  }

  if (state.charts.commerciaux) { state.charts.commerciaux.destroy(); delete state.charts.commerciaux; }
  const ctx3 = document.getElementById('chart-commerciaux');
  if (ctx3) {
    const labels = [], valeurs = [];
    state.utilisateurs.forEach(u => {
      const n = cibles.filter(c => c.responsable_id === u.id && !c.est_terminee).length;
      if (n > 0) { labels.push((u.prenom||'')+' '+(u.nom||'')); valeurs.push(n); }
    });
    if (labels.length > 0) state.charts.commerciaux = new Chart(ctx3, {
      type: 'doughnut',
      data: { labels, datasets: [{ data: valeurs, backgroundColor: COULEURS_CHART, borderWidth: 2, borderColor: 'white' }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { font: { size: 11 }, padding: 8 } } } }
    });
  }
}

function renderHebdoCharts() {
  if (typeof Chart === 'undefined') return;
  const semaines = [], rdvData = [], propData = [];
  for (let i = 11; i >= 0; i--) {
    const w = state.hebdo_semaine - i;
    if (w < 1) continue;
    semaines.push('S' + w);
    rdvData.push(state.suivi.filter(s => s.annee === state.hebdo_annee && s.semaine === w && s.type_activite === 'RDV qualifiés').reduce((sum,s) => sum + (s.nombre||0), 0));
    propData.push(state.suivi.filter(s => s.annee === state.hebdo_annee && s.semaine === w && s.type_activite === 'Propositions envoyées').reduce((sum,s) => sum + (s.nombre||0), 0));
  }
  if (state.charts.evolRdv) { state.charts.evolRdv.destroy(); delete state.charts.evolRdv; }
  const ctx1 = document.getElementById('chart-evol-rdv');
  if (ctx1) state.charts.evolRdv = new Chart(ctx1, {
    type: 'line',
    data: { labels: semaines, datasets: [
      { label: 'RDV qualifiés', data: rdvData, borderColor: '#1F3864', backgroundColor: 'rgba(31,56,100,0.1)', tension: 0.3, fill: true },
      { label: 'Objectif', data: semaines.map(() => state.kpi_rdv_cible), borderColor: '#A32D2D', borderDash: [5,5], pointRadius: 0, fill: false }
    ]},
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
  });
  if (state.charts.evolProp) { state.charts.evolProp.destroy(); delete state.charts.evolProp; }
  const ctx2 = document.getElementById('chart-evol-prop');
  if (ctx2) state.charts.evolProp = new Chart(ctx2, {
    type: 'line',
    data: { labels: semaines, datasets: [{ label: 'Offres envoyées', data: propData, borderColor: '#5DCAA5', backgroundColor: 'rgba(93,202,165,0.15)', tension: 0.3, fill: true }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
  });
  if (state.charts.comparComm) { state.charts.comparComm.destroy(); delete state.charts.comparComm; }
  const ctx3 = document.getElementById('chart-compar-comm');
  if (ctx3) {
    const labels = state.utilisateurs.map(u => (u.prenom||'')+' '+(u.nom||''));
    const rdvAll = state.utilisateurs.map(u => state.suivi.filter(s => s.utilisateur_id === u.id && s.annee === state.hebdo_annee && s.type_activite === 'RDV qualifiés').reduce((sum,s) => sum + (s.nombre||0), 0));
    const propAll = state.utilisateurs.map(u => state.suivi.filter(s => s.utilisateur_id === u.id && s.annee === state.hebdo_annee && s.type_activite === 'Propositions envoyées').reduce((sum,s) => sum + (s.nombre||0), 0));
    const appAll = state.utilisateurs.map(u => state.suivi.filter(s => s.utilisateur_id === u.id && s.annee === state.hebdo_annee && s.type_activite === 'Appels / Contacts').reduce((sum,s) => sum + (s.nombre||0), 0));
    state.charts.comparComm = new Chart(ctx3, {
      type: 'bar',
      data: { labels, datasets: [
        { label: 'Appels / Contacts', data: appAll, backgroundColor: '#85B7EB', borderRadius: 4 },
        { label: 'RDV qualifiés', data: rdvAll, backgroundColor: '#1F3864', borderRadius: 4 },
        { label: 'Offres envoyées', data: propAll, backgroundColor: '#5DCAA5', borderRadius: 4 }
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

  // Tâches ouvertes à T0 vs T+1
  renderTachesT0T1();

  // Récap mensuel
  const tbody2 = document.querySelector('#hebdo-recap-table tbody');
  tbody2.innerHTML = '';
  const startWeek = Math.max(1, state.hebdo_semaine - 3);
  state.utilisateurs.forEach(u => {
    const cumul = {};
    ACTIVITES.forEach(act => {
      cumul[act] = state.suivi.filter(s => s.utilisateur_id === u.id && s.annee === state.hebdo_annee && s.semaine >= startWeek && s.semaine <= state.hebdo_semaine && s.type_activite === act).reduce((sum,s) => sum + (s.nombre||0), 0);
    });
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><strong>${u.prenom||''} ${u.nom||''}</strong></td><td>${cumul['Appels / Contacts']}</td><td>${cumul['RDV planifiés'] || 0}</td><td>${cumul['RDV qualifiés']}</td><td>${cumul['Propositions envoyées']}</td>`;
    tbody2.appendChild(tr);
  });
  renderHebdoCharts();
}

function renderTachesT0T1() {
  const tbody = document.querySelector('#hebdo-taches-table tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  const cibles = getCiblesProduitActif();
  // Tâches avec échéance dans la semaine actuelle ou avant, non terminées
  const taches = cibles.filter(c => {
    if (!c.date_echeance) return false;
    const week = dateToWeek(c.date_echeance);
    return week <= state.hebdo_semaine;
  });
  if (taches.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty">Aucune tâche à suivre cette semaine.</td></tr>';
    return;
  }
  taches.forEach(c => {
    const resp = state.utilisateurs.find(u => u.id === c.responsable_id);
    const col = COLONNES_V8.find(co => co.numero === getColonneCible(c));
    let statut, cls;
    if (c.est_terminee) { statut = '✅ Fermée'; cls = 'badge-success'; }
    else {
      const echW = dateToWeek(c.date_echeance);
      if (echW < state.hebdo_semaine) { statut = '⚠️ Retard depuis S' + echW; cls = 'badge-danger'; }
      else { statut = '🟡 Ouverte à T+1'; cls = 'badge-warning'; }
    }
    const tr = document.createElement('tr');
    if (statut.startsWith('⚠️')) tr.className = 'retard';
    else if (statut.startsWith('🟡')) tr.className = 'retard-soft';
    tr.innerHTML = `<td>${c.description_action || c.intitule}</td><td>${resp ? (resp.prenom||'')+' '+(resp.nom||'') : '—'}</td><td>${col?.libelle || '—'}</td><td>${new Date(c.date_echeance).toLocaleDateString('fr-FR')}</td><td><span class="badge ${cls}">${statut}</span></td>`;
    tr.style.cursor = 'pointer';
    tr.addEventListener('click', () => openModalCible(c));
    tbody.appendChild(tr);
  });
}

function renderCalendar() {
  // Si on est en mode zoom mois, afficher la vue mensuelle
  if (state.cal_zoom_month !== null) {
    renderMonthZoom();
    return;
  }
  const container = document.getElementById('calendar-grid');
  container.innerHTML = '';
  let sources = state.sources.filter(s => s.groupe !== 'OUTIL');
  if (state.cal_filter_groupe) sources = sources.filter(s => s.groupe === state.cal_filter_groupe);
  const orderedSources = [];
  const parents = sources.filter(s => !s.parent_id);
  parents.forEach(p => {
    const hasChildren = sources.some(s => s.parent_id === p.id);
    orderedSources.push({ ...p, isParent: hasChildren });
    if (hasChildren && state.expandedParents.has(p.id)) {
      sources.filter(s => s.parent_id === p.id).forEach(c => orderedSources.push({ ...c, isChild: true }));
    }
  });

  const header = document.createElement('div');
  header.className = 'cal-row cal-header';
  header.innerHTML = '<div class="cal-cell cal-source-header">Source</div>' + MOIS_COURT.map((m, i) => `<div class="cal-cell cal-month-header cal-month-clickable" data-zoom-month="${i}" title="Zoom sur ${MOIS[i]}">${m} 🔍</div>`).join('');
  container.appendChild(header);

  // Ligne des jalons MSI (sous le header)
  const jalonsAnnee = state.jalons.filter(j => {
    if (state.produitActif && j.produit_id && j.produit_id !== state.produitActif.id) return false;
    return new Date(j.date_debut).getFullYear() === state.cal_annee;
  });
  if (jalonsAnnee.length > 0) {
    const jalonsRow = document.createElement('div');
    jalonsRow.className = 'cal-row cal-jalons-row';
    let jhtml = '<div class="cal-cell cal-source-label" style="font-weight:600;color:#1F3864;background:#F0F4F9;">🏁 Jalons MSI</div>';
    for (let m = 0; m < 12; m++) {
      const jsMois = jalonsAnnee.filter(j => new Date(j.date_debut).getMonth() === m);
      if (jsMois.length === 0) {
        jhtml += '<div class="cal-cell" style="background:transparent;"></div>';
      } else {
        const tooltip = jsMois.map(j => `${j.titre} (${new Date(j.date_debut).toLocaleDateString('fr-FR')})`).join('\n');
        let icons = '';
        jsMois.forEach(j => {
          const icon = JALON_ICONS[j.type_jalon] || '📍';
          icons += `<span class="cal-jalon-icon" style="color:${j.couleur || '#A32D2D'};" title="${j.titre} - ${new Date(j.date_debut).toLocaleDateString('fr-FR')}" data-jalon-id="${j.id}">${icon}</span>`;
        });
        jhtml += `<div class="cal-cell cal-jalons-cell" data-zoom-month="${m}" title="${tooltip}">${icons}</div>`;
      }
    }
    jalonsRow.innerHTML = jhtml;
    container.appendChild(jalonsRow);
  }

  const evAnnee = state.evenements.filter(e => new Date(e.date_evenement).getFullYear() === state.cal_annee);

  orderedSources.forEach(src => {
    const row = document.createElement('div');
    row.className = 'cal-row';
    let labelClass = 'cal-source-label';
    let labelContent;
    const hasChecklist = SOURCES_AVEC_CHECKLIST.includes(src.nom);
    const checklistIcon = hasChecklist 
      ? `<span class="cal-source-checklist" data-checklist-source="${src.id}" title="Voir la checklist de préparatifs">📋</span>`
      : '';
    if (src.isParent) {
      labelClass += ' cal-source-parent';
      if (state.expandedParents.has(src.id)) labelClass += ' expanded';
      labelContent = `<span style="display:flex;align-items:center;flex:1;cursor:pointer;" data-parent-toggle="${src.id}"><span class="chevron">▶</span><span class="cal-source-text">${src.nom}</span></span>${checklistIcon}`;
    } else {
      if (src.isChild) labelClass += ' cal-source-child';
      labelContent = `<span class="cal-source-text">${src.nom}</span>${checklistIcon}`;
    }
    let html = `<div class="cal-cell ${labelClass}">${labelContent}</div>`;
    let sourceIds = [src.id];
    if (src.isParent) state.sources.filter(s => s.parent_id === src.id).forEach(c => sourceIds.push(c.id));
    for (let m = 0; m < 12; m++) {
      const evs = evAnnee.filter(e => sourceIds.includes(e.source_id) && new Date(e.date_evenement).getMonth() === m);
      if (evs.length > 0) html += '<div class="cal-cell cal-filled" data-evs=\'' + JSON.stringify(evs.map(e=>e.id)) + '\'>' + evs.length + '</div>';
      else if (src.isParent) html += '<div class="cal-cell cal-empty" style="cursor:default;background:transparent;border:1px dashed #E5E3DC;"></div>';
      else html += '<div class="cal-cell cal-empty" data-source="' + src.id + '" data-month="' + m + '"></div>';
    }
    row.innerHTML = html;
    container.appendChild(row);
  });

  container.querySelectorAll('[data-parent-toggle]').forEach(el => {
    el.addEventListener('click', e => { e.stopPropagation(); toggleParent(parseInt(el.dataset.parentToggle)); });
  });
  container.querySelectorAll('[data-checklist-source]').forEach(el => {
    el.addEventListener('click', e => { e.stopPropagation(); openChecklistModal(parseInt(el.dataset.checklistSource)); });
  });
  container.querySelectorAll('[data-zoom-month]').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target.closest('[data-jalon-id]')) return; // si clic sur icône jalon, on la gère ailleurs
      const m = parseInt(el.dataset.zoomMonth);
      state.cal_zoom_month = m;
      renderCalendar();
    });
  });
  container.querySelectorAll('[data-jalon-id]').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation();
      const j = state.jalons.find(x => x.id === parseInt(el.dataset.jalonId));
      if (j) openModalJalon(j);
    });
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

// === VUE ZOOM MENSUEL ===
function renderMonthZoom() {
  const container = document.getElementById('calendar-grid');
  const month = state.cal_zoom_month;
  const annee = state.cal_annee;
  const moisLabel = MOIS[month];

  // Récupérer événements et jalons du mois
  const evsMois = state.evenements.filter(e => {
    const d = new Date(e.date_evenement);
    return d.getFullYear() === annee && d.getMonth() === month;
  });
  const jalonsMois = state.jalons.filter(j => {
    if (state.produitActif && j.produit_id && j.produit_id !== state.produitActif.id) return false;
    const d = new Date(j.date_debut);
    return d.getFullYear() === annee && d.getMonth() === month;
  });

  // Calculer la grille (premier jour, nombre de jours)
  const firstDay = new Date(annee, month, 1);
  const lastDay = new Date(annee, month + 1, 0);
  const nbJours = lastDay.getDate();
  let dayOfWeek = firstDay.getDay(); // 0 = dim, 1 = lun...
  if (dayOfWeek === 0) dayOfWeek = 7; // pour avoir lundi=1, dim=7
  const offset = dayOfWeek - 1; // nombre de cases vides avant le 1er

  let html = `
    <div class="month-zoom-header">
      <button class="btn-secondary" id="btn-back-cal">← Retour vue annuelle</button>
      <h3 style="margin:0;color:#1F3864;">${moisLabel} ${annee}</h3>
      <div></div>
    </div>
    <div class="month-zoom-grid">
      <div class="month-day-header">Lun</div>
      <div class="month-day-header">Mar</div>
      <div class="month-day-header">Mer</div>
      <div class="month-day-header">Jeu</div>
      <div class="month-day-header">Ven</div>
      <div class="month-day-header">Sam</div>
      <div class="month-day-header">Dim</div>
  `;

  // Cases vides avant le 1er
  for (let i = 0; i < offset; i++) html += '<div class="month-day-cell month-day-empty"></div>';

  // Jours du mois
  for (let day = 1; day <= nbJours; day++) {
    const dateStr = `${annee}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const evsJour = evsMois.filter(e => {
      const ds = e.date_evenement;
      const df = e.date_fin || e.date_evenement;
      return dateStr >= ds && dateStr <= df;
    });
    const jalonsJour = jalonsMois.filter(j => {
      const ds = j.date_debut;
      const df = j.date_fin || j.date_debut;
      return dateStr >= ds && dateStr <= df;
    });
    const isToday = dateStr === new Date().toISOString().split('T')[0];
    let dayContent = `<div class="month-day-num${isToday ? ' today' : ''}">${day}</div>`;
    if (evsJour.length > 0) {
      evsJour.forEach(e => {
        const src = state.sources.find(s => s.id === e.source_id);
        dayContent += `<div class="month-day-event" data-evt-id="${e.id}" title="${e.quoi}">${src ? src.nom.substring(0,12) : ''}${e.quoi ? ' · '+e.quoi.substring(0,20) : ''}</div>`;
      });
    }
    if (jalonsJour.length > 0) {
      jalonsJour.forEach(j => {
        const icon = JALON_ICONS[j.type_jalon] || '📍';
        dayContent += `<div class="month-day-jalon" style="border-left-color:${j.couleur || '#A32D2D'};" data-jalon-id="${j.id}" title="${j.titre}">${icon} ${j.titre.substring(0,18)}</div>`;
      });
    }
    html += `<div class="month-day-cell${isToday ? ' is-today' : ''}" data-date="${dateStr}">${dayContent}</div>`;
  }

  html += '</div>';

  // Liste chronologique sous le calendrier
  html += '<h3 style="margin-top:24px;">Liste chronologique</h3><div class="month-list">';
  const allItems = [
    ...evsMois.map(e => ({ ...e, _type: 'event', _date: e.date_evenement })),
    ...jalonsMois.map(j => ({ ...j, _type: 'jalon', _date: j.date_debut }))
  ].sort((a, b) => a._date.localeCompare(b._date));

  if (allItems.length === 0) {
    html += '<p class="empty">Aucun événement ni jalon ce mois-ci.</p>';
  } else {
    allItems.forEach(item => {
      if (item._type === 'event') {
        const src = state.sources.find(s => s.id === item.source_id);
        let datesStr = new Date(item.date_evenement).toLocaleDateString('fr-FR');
        if (item.date_fin && item.date_fin !== item.date_evenement) datesStr += ' → ' + new Date(item.date_fin).toLocaleDateString('fr-FR');
        html += `<div class="month-list-item" data-evt-id="${item.id}"><div class="month-list-date">${datesStr}</div><div class="month-list-content"><div class="month-list-titre">${item.quoi}</div><div class="month-list-meta">${src?.nom || '—'} · ${item.type_evenement || 'Extérieur'}${item.lieu_libre ? ' · '+item.lieu_libre : (item.lieu_ville ? ' · '+item.lieu_ville : '')}</div></div></div>`;
      } else {
        const icon = JALON_ICONS[item.type_jalon] || '📍';
        let datesStr = new Date(item.date_debut).toLocaleDateString('fr-FR');
        if (item.date_fin && item.date_fin !== item.date_debut) datesStr += ' → ' + new Date(item.date_fin).toLocaleDateString('fr-FR');
        html += `<div class="month-list-item month-list-jalon" data-jalon-id="${item.id}" style="border-left-color:${item.couleur || '#A32D2D'};"><div class="month-list-date">${datesStr}</div><div class="month-list-content"><div class="month-list-titre">${icon} ${item.titre}</div><div class="month-list-meta">${item.type_jalon}${item.description ? ' · '+item.description : ''}</div></div></div>`;
      }
    });
  }
  html += '</div>';

  container.innerHTML = html;

  document.getElementById('btn-back-cal').addEventListener('click', () => {
    state.cal_zoom_month = null;
    renderCalendar();
  });
  container.querySelectorAll('[data-evt-id]').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation();
      openModal(state.evenements.find(x => x.id === parseInt(el.dataset.evtId)));
    });
  });
  container.querySelectorAll('[data-jalon-id]').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation();
      openModalJalon(state.jalons.find(x => x.id === parseInt(el.dataset.jalonId)));
    });
  });
  container.querySelectorAll('.month-day-cell[data-date]').forEach(cell => {
    cell.addEventListener('click', e => {
      if (e.target.closest('[data-evt-id]') || e.target.closest('[data-jalon-id]')) return;
      openModal({ date_evenement: cell.dataset.date });
    });
  });
}

function renderJalons() {
  const container = document.getElementById('jalons-grid');
  if (!container) return;
  container.innerHTML = '';
  const jalons = state.jalons.filter(j => {
    if (!state.produitActif) return true;
    return j.produit_id === state.produitActif.id || !j.produit_id;
  }).filter(j => new Date(j.date_debut).getFullYear() === state.cal_annee);

  if (jalons.length === 0) {
    container.innerHTML = '<p class="empty">Aucun jalon défini pour ' + state.cal_annee + '. Cliquez sur "+ Nouveau jalon" pour en ajouter.</p>';
    return;
  }
  jalons.forEach(j => {
    const div = document.createElement('div');
    div.className = 'jalon-card';
    div.style.borderLeftColor = j.couleur || '#A32D2D';
    let dateStr = new Date(j.date_debut).toLocaleDateString('fr-FR');
    if (j.date_fin && j.date_fin !== j.date_debut) dateStr += ' → ' + new Date(j.date_fin).toLocaleDateString('fr-FR');
    div.innerHTML = `<div class="jalon-card-date">${dateStr}</div><div class="jalon-card-content"><div class="jalon-card-titre">${j.titre}</div>${j.description ? `<div class="jalon-card-desc">${j.description}</div>` : ''}</div><div class="jalon-card-type" style="background:${j.couleur}22;color:${j.couleur};">${j.type_jalon}</div><button class="btn-secondary" type="button" style="font-size:12px;padding:5px 10px;">Modifier</button>`;
    div.addEventListener('click', () => openModalJalon(j));
    container.appendChild(div);
  });
}

function renderEventsTable() {
  const tbody = document.querySelector('#events-table tbody');
  tbody.innerHTML = '';
  if (state.evenements.length === 0) { tbody.innerHTML = '<tr><td colspan="8" class="empty">Aucun événement.</td></tr>'; return; }
  state.evenements.forEach(ev => {
    const src = state.sources.find(s => s.id === ev.source_id);
    const resp = state.utilisateurs.find(u => u.id === ev.responsable_id);
    const objs = state.evtObjectifs.filter(o => o.evenement_id === ev.id);
    let statut = 'À venir', cls = 'badge-info';
    if (objs.length > 0) {
      const allDone = objs.every(o => o.nombre_realise !== null);
      if (allDone) {
        const allOk = objs.every(o => (o.nombre_realise || 0) >= o.nombre_cible);
        statut = allOk ? 'Objectifs atteints' : 'Objectifs partiels';
        cls = allOk ? 'badge-success' : 'badge-warning';
      }
    }
    let datesStr = new Date(ev.date_evenement).toLocaleDateString('fr-FR');
    if (ev.date_fin && ev.date_fin !== ev.date_evenement) datesStr += ' → ' + new Date(ev.date_fin).toLocaleDateString('fr-FR');
    let lieu = ev.lieu_libre || [ev.lieu_ville, ev.lieu_code_postal].filter(x => x).join(' ');
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${datesStr}</td><td><span class="badge ${ev.type_evenement === 'Intérieur' ? 'badge-info' : 'badge-warning'}">${ev.type_evenement || 'Extérieur'}</span></td><td>${ev.quoi}</td><td>${src?.nom || '—'}</td><td>${lieu || '—'}</td><td>${resp ? (resp.prenom||'')+' '+(resp.nom||'') : '—'}</td><td><span class="badge ${cls}">${statut}</span></td><td><button class="btn-link" data-id="${ev.id}">Modifier</button></td>`;
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

// ============================================================
// REVUE (mensuelle / trimestrielle / par période MSI)
// ============================================================
function renderRevue() {
  const container = document.getElementById('revue-content');
  if (!container) return;

  const typeSelect = document.getElementById('revue-type');
  const valueSelect = document.getElementById('revue-value');
  if (!typeSelect.dataset.setup) {
    typeSelect.addEventListener('change', () => { setupRevueValueSelect(); renderRevueContent(); });
    valueSelect.addEventListener('change', renderRevueContent);
    typeSelect.dataset.setup = '1';
  }
  setupRevueValueSelect();
  renderRevueContent();
}

function setupRevueValueSelect() {
  const typeSelect = document.getElementById('revue-type');
  const valueSelect = document.getElementById('revue-value');
  const type = typeSelect.value;
  valueSelect.innerHTML = '';
  const now = new Date();
  const annee = now.getFullYear();

  if (type === 'mensuel') {
    for (let y = annee - 1; y <= annee; y++) {
      for (let m = 0; m < 12; m++) {
        const o = document.createElement('option');
        o.value = y + '-' + m;
        o.textContent = MOIS[m] + ' ' + y;
        // Mois précédent par défaut
        const prev = new Date(annee, now.getMonth() - 1, 1);
        if (y === prev.getFullYear() && m === prev.getMonth()) o.selected = true;
        valueSelect.appendChild(o);
      }
    }
  } else if (type === 'trimestriel') {
    for (let y = annee - 1; y <= annee; y++) {
      for (let q = 1; q <= 4; q++) {
        const o = document.createElement('option');
        o.value = y + '-T' + q;
        o.textContent = 'T' + q + ' ' + y;
        if (y === annee && q === Math.floor(now.getMonth() / 3) + 1) o.selected = true;
        valueSelect.appendChild(o);
      }
    }
  } else if (type === 'periode_msi') {
    const periodes = [...new Set(state.objectifsAnnuels.map(o => o.periode_msi))].filter(p => p && p !== 'ANNUEL');
    periodes.forEach(p => {
      const o = document.createElement('option');
      o.value = p;
      o.textContent = p;
      valueSelect.appendChild(o);
    });
  }
}

function renderRevueContent() {
  const container = document.getElementById('revue-content');
  const type = document.getElementById('revue-type').value;
  const value = document.getElementById('revue-value').value;
  if (!value) { container.innerHTML = '<p class="empty">Sélectionnez une période.</p>'; return; }

  let weekFilter, dateMin, dateMax, label;
  const cibles = getCiblesProduitActif();

  if (type === 'mensuel') {
    const [y, m] = value.split('-').map(Number);
    dateMin = new Date(y, m, 1);
    dateMax = new Date(y, m + 1, 0, 23, 59, 59);
    label = MOIS[m] + ' ' + y;
    weekFilter = s => s.annee === y && s.semaine >= dateToWeek(dateMin.toISOString().split('T')[0]) && s.semaine <= dateToWeek(dateMax.toISOString().split('T')[0]);
  } else if (type === 'trimestriel') {
    const [y, qStr] = value.split('-T');
    const annee = parseInt(y);
    const q = parseInt(qStr);
    dateMin = new Date(annee, (q - 1) * 3, 1);
    dateMax = new Date(annee, q * 3, 0, 23, 59, 59);
    label = 'T' + q + ' ' + annee;
    weekFilter = s => s.annee === annee && s.semaine >= dateToWeek(dateMin.toISOString().split('T')[0]) && s.semaine <= dateToWeek(dateMax.toISOString().split('T')[0]);
  } else if (type === 'periode_msi') {
    label = 'Période ' + value;
    weekFilter = s => true; // pas de filtre semaine pour période MSI
  }

  // KPI calculés
  const suiviPeriode = type === 'periode_msi' ? state.suivi : state.suivi.filter(weekFilter);

  const nbContacts = suiviPeriode.filter(s => s.type_activite === 'Appels / Contacts').reduce((sum,s) => sum + (s.nombre||0), 0);
  const nbRdvPlanifies = suiviPeriode.filter(s => s.type_activite === 'RDV planifiés').reduce((sum,s) => sum + (s.nombre||0), 0);
  const nbRdvEffectues = suiviPeriode.filter(s => s.type_activite === 'RDV qualifiés').reduce((sum,s) => sum + (s.nombre||0), 0);
  const nbOffres = suiviPeriode.filter(s => s.type_activite === 'Propositions envoyées').reduce((sum,s) => sum + (s.nombre||0), 0);

  // Cibles signées/perdues filtrées
  const ciblesFiltrees = cibles.filter(c => {
    if (type === 'periode_msi') return c.periode_msi === value;
    const d = c.date_signature ? new Date(c.date_signature) : (c.date_terminee ? new Date(c.date_terminee) : null);
    if (!d) return false;
    return d >= dateMin && d <= dateMax;
  });
  const ciblesSigneesRevue = ciblesFiltrees.filter(c => c.statut_avancement === 'Signé');
  const nbSigne = ciblesSigneesRevue.length;
  const nbSigneAvecDate = ciblesSigneesRevue.filter(c => c.date_signature).length;
  const nbSigneSansDate = ciblesSigneesRevue.filter(c => !c.date_signature).length;
  const nbPerdu = ciblesFiltrees.filter(c => c.statut_avancement === 'Perdu').length;
  const caSigne = ciblesSigneesRevue.reduce((s,c) => s + (c.montant_estime||0), 0);

  // Aussi compter les cibles signées toutes périodes mais sans date de signature
  const toutesSigneesSansDate = cibles.filter(c => c.statut_avancement === 'Signé' && !c.date_signature).length;

  // Calcul de la période précédente pour comparaison (si mensuel/trimestriel)
  let prevSuivi = [];
  let prevCibles = [];
  if (type === 'mensuel') {
    const [y, m] = value.split('-').map(Number);
    const prevMin = new Date(y, m - 1, 1);
    const prevMax = new Date(y, m, 0, 23, 59, 59);
    prevSuivi = state.suivi.filter(s => s.annee === prevMin.getFullYear() && s.semaine >= dateToWeek(prevMin.toISOString().split('T')[0]) && s.semaine <= dateToWeek(prevMax.toISOString().split('T')[0]));
    prevCibles = cibles.filter(c => {
      const d = c.date_signature ? new Date(c.date_signature) : null;
      if (!d) return false;
      return d >= prevMin && d <= prevMax;
    });
  } else if (type === 'trimestriel') {
    const [y, qStr] = value.split('-T');
    const annee = parseInt(y);
    const q = parseInt(qStr);
    const prevQ = q === 1 ? 4 : q - 1;
    const prevAnnee = q === 1 ? annee - 1 : annee;
    const prevMin = new Date(prevAnnee, (prevQ - 1) * 3, 1);
    const prevMax = new Date(prevAnnee, prevQ * 3, 0, 23, 59, 59);
    prevSuivi = state.suivi.filter(s => s.annee === prevAnnee && s.semaine >= dateToWeek(prevMin.toISOString().split('T')[0]) && s.semaine <= dateToWeek(prevMax.toISOString().split('T')[0]));
    prevCibles = cibles.filter(c => {
      const d = c.date_signature ? new Date(c.date_signature) : null;
      if (!d) return false;
      return d >= prevMin && d <= prevMax;
    });
  }

  const prevContacts = prevSuivi.filter(s => s.type_activite === 'Appels / Contacts').reduce((sum,s) => sum + (s.nombre||0), 0);
  const prevRdvPlanifies = prevSuivi.filter(s => s.type_activite === 'RDV planifiés').reduce((sum,s) => sum + (s.nombre||0), 0);
  const prevRdvEffectues = prevSuivi.filter(s => s.type_activite === 'RDV qualifiés').reduce((sum,s) => sum + (s.nombre||0), 0);
  const prevOffres = prevSuivi.filter(s => s.type_activite === 'Propositions envoyées').reduce((sum,s) => sum + (s.nombre||0), 0);
  const prevSigne = prevCibles.filter(c => c.statut_avancement === 'Signé').length;
  const prevPerdu = prevCibles.filter(c => c.statut_avancement === 'Perdu').length;

  function evol(now, prev) {
    if (prev === 0 && now === 0) return '';
    if (prev === 0) return `<span class="evol-up">+ Nouveau</span>`;
    const diff = now - prev;
    const pct = Math.round((diff / prev) * 100);
    const cls = diff >= 0 ? 'evol-up' : 'evol-down';
    const arrow = diff >= 0 ? '↑' : '↓';
    return `<span class="${cls}">${arrow} ${pct}%</span>`;
  }

  let html = `
    <h3 style="margin-top:0;">Rétrospective — ${label}</h3>
    <div class="revue-kpi-grid">
      <div class="revue-kpi-card">
        <div class="revue-kpi-label">Appels / Contacts</div>
        <div class="revue-kpi-value">${nbContacts}</div>
        ${type !== 'periode_msi' ? `<div class="revue-kpi-evol">vs précédent : ${prevContacts} ${evol(nbContacts, prevContacts)}</div>` : ''}
      </div>
      <div class="revue-kpi-card">
        <div class="revue-kpi-label">RDV planifiés</div>
        <div class="revue-kpi-value">${nbRdvPlanifies}</div>
        ${type !== 'periode_msi' ? `<div class="revue-kpi-evol">vs précédent : ${prevRdvPlanifies} ${evol(nbRdvPlanifies, prevRdvPlanifies)}</div>` : ''}
      </div>
      <div class="revue-kpi-card">
        <div class="revue-kpi-label">RDV qualifiés</div>
        <div class="revue-kpi-value">${nbRdvEffectues}</div>
        ${type !== 'periode_msi' ? `<div class="revue-kpi-evol">vs précédent : ${prevRdvEffectues} ${evol(nbRdvEffectues, prevRdvEffectues)}</div>` : ''}
      </div>
      <div class="revue-kpi-card">
        <div class="revue-kpi-label">Offres rédigées</div>
        <div class="revue-kpi-value">${nbOffres}</div>
        ${type !== 'periode_msi' ? `<div class="revue-kpi-evol">vs précédent : ${prevOffres} ${evol(nbOffres, prevOffres)}</div>` : ''}
      </div>
      <div class="revue-kpi-card revue-kpi-positif">
        <div class="revue-kpi-label">Contrats signés</div>
        <div class="revue-kpi-value">${nbSigne}${nbSigneSansDate > 0 ? ` <span style="font-size:14px;color:#BA7517;">(${nbSigneSansDate} ⏳ sans date)</span>` : ''}</div>
        ${type !== 'periode_msi' ? `<div class="revue-kpi-evol">vs précédent : ${prevSigne} ${evol(nbSigne, prevSigne)}</div>` : ''}
      </div>
      <div class="revue-kpi-card revue-kpi-negatif">
        <div class="revue-kpi-label">Contrats perdus</div>
        <div class="revue-kpi-value">${nbPerdu}</div>
        ${type !== 'periode_msi' ? `<div class="revue-kpi-evol">vs précédent : ${prevPerdu} ${evol(nbPerdu, prevPerdu)}</div>` : ''}
      </div>
      <div class="revue-kpi-card revue-kpi-financier">
        <div class="revue-kpi-label">CA signé sur la période</div>
        <div class="revue-kpi-value">${formatEuro(caSigne)} €</div>
      </div>
    </div>
  `;

  // Taux de conversion
  const tauxConv = nbRdvEffectues > 0 ? Math.round((nbSigne / nbRdvEffectues) * 100) : 0;
  const tauxClotureOffre = nbOffres > 0 ? Math.round((nbSigne / nbOffres) * 100) : 0;
  const tauxContactRdv = nbContacts > 0 ? Math.round((nbRdvEffectues / nbContacts) * 100) : 0;
  html += `
    <h3>Taux de conversion</h3>
    <div class="revue-conv-grid">
      <div class="revue-conv-card"><div class="revue-conv-label">Contacts → RDV</div><div class="revue-conv-value">${tauxContactRdv}%</div></div>
      <div class="revue-conv-card"><div class="revue-conv-label">RDV → Offre</div><div class="revue-conv-value">${nbRdvEffectues > 0 ? Math.round((nbOffres / nbRdvEffectues) * 100) : 0}%</div></div>
      <div class="revue-conv-card"><div class="revue-conv-label">Offres → Signature</div><div class="revue-conv-value">${tauxClotureOffre}%</div></div>
      <div class="revue-conv-card revue-conv-card-highlight"><div class="revue-conv-label">RDV → Signature</div><div class="revue-conv-value">${tauxConv}%</div></div>
    </div>
  `;

  container.innerHTML = html;
}

function exportToExcel() {
  if (typeof XLSX === 'undefined') { showToast('Librairie Excel non chargée', 'error'); return; }
  const wb = XLSX.utils.book_new();
  const dateStr = new Date().toISOString().split('T')[0];
  const prodLabel = state.produitActif?.code || 'MSI';

  // Helper : largeur automatique des colonnes
  function autoWidth(ws, data) {
    if (!data || data.length === 0) return;
    const keys = Object.keys(data[0]);
    ws['!cols'] = keys.map((k, i) => {
      let max = k.length;
      data.forEach(row => {
        const val = String(row[k] ?? '');
        if (val.length > max) max = val.length;
      });
      return { wch: Math.min(max + 2, 50) };
    });
  }

  // =============================================
  // Onglet 0 : SOMMAIRE
  // =============================================
  const sommaireData = [
    { 'N°': 1, 'Onglet': 'Tâches', 'Description': 'Toutes les tâches de prospection avec colonnes, statuts, montants' },
    { 'N°': 2, 'Onglet': 'Pipeline commercial', 'Description': 'Vue synthétique du pipeline (tâches en Avancement)' },
    { 'N°': 3, 'Onglet': 'Suivi hebdo', 'Description': 'Saisie hebdomadaire par commercial (appels, RDV, offres)' },
    { 'N°': 4, 'Onglet': 'Événements', 'Description': 'Calendrier événementiel (salons, JPO, webinaires...)' },
    { 'N°': 5, 'Onglet': 'Objectifs événements', 'Description': 'Objectifs par événement (contacts, RDV, offres cibles vs réalisé)' },
    { 'N°': 6, 'Onglet': 'Objectifs périodes', 'Description': 'CA cible et nombre de contrats par période MSI' },
    { 'N°': 7, 'Onglet': 'KPI cibles', 'Description': 'Objectifs des 6 KPI annuels' },
    { 'N°': 8, 'Onglet': 'Objectifs sources', 'Description': 'Cible de contacts par source et période' },
    { 'N°': 9, 'Onglet': 'Checklists', 'Description': 'Actions de préparation par source' },
    { 'N°': 10, 'Onglet': 'Jalons MSI', 'Description': 'Jalons MSI (revues, soutenances, livrables...)' }
  ];
  const wsSommaire = XLSX.utils.json_to_sheet(sommaireData);
  autoWidth(wsSommaire, sommaireData);
  XLSX.utils.book_append_sheet(wb, wsSommaire, 'Sommaire');

  // =============================================
  // Onglet 1 : TÂCHES (toutes colonnes)
  // =============================================
  const tachesData = state.cibles.map(c => {
    const resp = state.utilisateurs.find(u => u.id === c.responsable_id);
    const src = state.sources.find(s => s.id === c.source_id);
    const col = COLONNES_V8.find(co => co.numero === getColonneCible(c));
    const resultats = state.cibleResultats.filter(r => r.cible_id === c.id).map(r => r.resultat_libelle).join(' ; ');
    const produit = state.produits.find(p => p.id === c.produit_id);
    return {
      'Produit': produit?.code || '',
      'Colonne': col ? `${col.numero}. ${col.libelle}` : '',
      'Description': c.description_action || c.intitule || '',
      'Responsable': resp ? `${resp.prenom||''} ${resp.nom||''}`.trim() : '',
      'Source': src?.nom || '',
      'Nb contacts attendus': c.nombre_contacts_attendus || 0,
      'Nb appels à faire': c.nb_appels || 0,
      'Nb RDV à obtenir': c.nombre_rdv_attendus || 0,
      'Nb besoins identifiés': c.nb_besoins_id || '',
      'Nb besoins retenus': c.nb_besoins_ret || '',
      'Nb propositions réalisées': c.nb_prop_real || '',
      'Nb propositions retenues': c.nb_prop_ret || '',
      'Résultats attendus': resultats,
      'Statut avancement': c.statut_avancement || '',
      'Montant (€)': c.montant_estime || 0,
      'Date signature': c.date_signature || '',
      'Période MSI': c.periode_msi || '',
      'Échéance': c.date_echeance || '',
      'En retard ?': isTacheEnRetard(c) ? '⚠️ OUI' : '',
      'Terminée ?': c.est_terminee ? '✅ OUI' : '',
      'Date terminée': c.date_terminee ? c.date_terminee.split('T')[0] : '',
      'Notes': c.notes || ''
    };
  });
  const ws1 = XLSX.utils.json_to_sheet(tachesData);
  autoWidth(ws1, tachesData);
  XLSX.utils.book_append_sheet(wb, ws1, 'Tâches');

  // =============================================
  // Onglet 2 : PIPELINE COMMERCIAL (col 5 uniquement)
  // =============================================
  const pipelineData = state.cibles.filter(c => getColonneCible(c) === 5).map(c => {
    const resp = state.utilisateurs.find(u => u.id === c.responsable_id);
    const src = state.sources.find(s => s.id === c.source_id);
    return {
      'Description': c.description_action || c.intitule || '',
      'Statut': c.statut_avancement || 'Négociation',
      'Montant (€)': c.montant_estime || 0,
      'Responsable': resp ? `${resp.prenom||''} ${resp.nom||''}`.trim() : '',
      'Source': src?.nom || '',
      'Période MSI': c.periode_msi || '',
      'Date signature': c.date_signature || '',
      'Terminée ?': c.est_terminee ? '✅ OUI' : '',
      'Notes': c.notes || ''
    };
  });
  const ws2 = XLSX.utils.json_to_sheet(pipelineData);
  autoWidth(ws2, pipelineData);
  XLSX.utils.book_append_sheet(wb, ws2, 'Pipeline commercial');

  // =============================================
  // Onglet 3 : SUIVI HEBDO
  // =============================================
  const hebdoData = state.suivi.sort((a,b) => (a.annee - b.annee) || (a.semaine - b.semaine)).map(s => {
    const u = state.utilisateurs.find(x => x.id === s.utilisateur_id);
    return {
      'Année': s.annee, 'Semaine': `S${s.semaine}`,
      'Commercial': u ? `${u.prenom||''} ${u.nom||''}`.trim() : '',
      'Activité': s.type_activite, 'Nombre': s.nombre || 0
    };
  });
  const ws3 = XLSX.utils.json_to_sheet(hebdoData);
  autoWidth(ws3, hebdoData);
  XLSX.utils.book_append_sheet(wb, ws3, 'Suivi hebdo');

  // =============================================
  // Onglet 4 : ÉVÉNEMENTS
  // =============================================
  const eventsData = state.evenements.sort((a,b) => (a.date_evenement||'').localeCompare(b.date_evenement||'')).map(ev => {
    const src = state.sources.find(s => s.id === ev.source_id);
    const resp = state.utilisateurs.find(u => u.id === ev.responsable_id);
    return {
      'Date début': ev.date_evenement, 'Date fin': ev.date_fin || '',
      'Type': ev.type_evenement || 'Extérieur',
      'Intitulé': ev.quoi, 'Source': src?.nom || '',
      'Lieu': ev.lieu_libre || '', 'Ville': ev.lieu_ville || '',
      'Code postal': ev.lieu_code_postal || '', 'Adresse': ev.lieu_adresse || '',
      'Responsable': resp ? `${resp.prenom||''} ${resp.nom||''}`.trim() : '',
      'Préparation': ev.comment_preparation || '', 'Notes': ev.notes || ''
    };
  });
  const ws4 = XLSX.utils.json_to_sheet(eventsData);
  autoWidth(ws4, eventsData);
  XLSX.utils.book_append_sheet(wb, ws4, 'Événements');

  // =============================================
  // Onglet 5 : OBJECTIFS ÉVÉNEMENTS
  // =============================================
  const objEvtData = state.evtObjectifs.map(o => {
    const ev = state.evenements.find(e => e.id === o.evenement_id);
    return {
      'Événement': ev?.quoi || '', 'Date': ev?.date_evenement || '',
      'Type objectif': o.type_objectif, 'Description': o.description || '',
      'Cible': o.nombre_cible || 0, 'Réalisé': o.nombre_realise ?? '',
      'Atteinte %': (o.nombre_cible > 0 && o.nombre_realise != null) ? Math.round((o.nombre_realise / o.nombre_cible) * 100) + '%' : '',
      'Commentaire': o.commentaire || ''
    };
  });
  const ws5 = XLSX.utils.json_to_sheet(objEvtData);
  autoWidth(ws5, objEvtData);
  XLSX.utils.book_append_sheet(wb, ws5, 'Objectifs événements');

  // =============================================
  // Onglet 6 : OBJECTIFS PÉRIODES
  // =============================================
  const objAnnData = state.objectifsAnnuels.map(o => ({
    'Année': o.annee, 'Période': o.periode_msi,
    'CA cible (€)': o.ca_cible || 0, 'Nombre cible': o.msi_cible || 0,
    'Commentaire': o.commentaire || ''
  }));
  const ws6 = XLSX.utils.json_to_sheet(objAnnData);
  autoWidth(ws6, objAnnData);
  XLSX.utils.book_append_sheet(wb, ws6, 'Objectifs périodes');

  // =============================================
  // Onglet 7 : KPI CIBLES
  // =============================================
  const kpiData = state.kpiObjectifs.map(k => {
    const p = state.produits.find(x => x.id === k.produit_id);
    return {
      'Produit': p?.code || '', 'Période': k.periode_msi,
      'KPI': k.type_kpi, 'Valeur cible annuelle': k.valeur_cible || 0,
      'Commentaire': k.commentaire || ''
    };
  });
  const ws7 = XLSX.utils.json_to_sheet(kpiData);
  autoWidth(ws7, kpiData);
  XLSX.utils.book_append_sheet(wb, ws7, 'KPI cibles');

  // =============================================
  // Onglet 8 : OBJECTIFS SOURCES
  // =============================================
  const objSrcData = state.objectifs.map(o => {
    const s = state.sources.find(x => x.id === o.source_id);
    return {
      'Source': s?.nom || '', 'Période': o.periode,
      'Cible contacts': o.cible_contacts || 0
    };
  });
  const ws8 = XLSX.utils.json_to_sheet(objSrcData);
  autoWidth(ws8, objSrcData);
  XLSX.utils.book_append_sheet(wb, ws8, 'Objectifs sources');

  // =============================================
  // Onglet 9 : CHECKLISTS
  // =============================================
  const checklistData = state.checklist.map(c => {
    const s = state.sources.find(x => x.id === c.source_id);
    return {
      'Source': s?.nom || '', 'N° ordre': c.ordre || '',
      'Action': c.action,
      'Responsable': c.responsable_type || '', 'Délai': c.delai || '',
      'Outils': c.outils || ''
    };
  });
  const ws9 = XLSX.utils.json_to_sheet(checklistData);
  autoWidth(ws9, checklistData);
  XLSX.utils.book_append_sheet(wb, ws9, 'Checklists');

  // =============================================
  // Onglet 10 : JALONS MSI
  // =============================================
  const jalonsData = state.jalons.map(j => {
    const p = state.produits.find(x => x.id === j.produit_id);
    return {
      'Produit': p?.code || '', 'Titre': j.titre,
      'Type': j.type_jalon, 'Couleur': j.couleur || '',
      'Date début': j.date_debut,
      'Date fin': j.date_fin || '', 'Description': j.description || ''
    };
  });
  const ws10 = XLSX.utils.json_to_sheet(jalonsData);
  autoWidth(ws10, jalonsData);
  XLSX.utils.book_append_sheet(wb, ws10, 'Jalons MSI');

  const filename = `prospection_${prodLabel}_${dateStr}.xlsx`;
  XLSX.writeFile(wb, filename);
  showToast(`Export "${filename}" généré avec 11 onglets`, 'success');
}

init();
