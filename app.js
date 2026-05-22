const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const MOIS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
const MOIS_COURT = ['Janv','Févr','Mars','Avr','Mai','Juin','Juil','Août','Sept','Oct','Nov','Déc'];
const ACTIVITES = ['Appels / Contacts','RDV effectués','Propositions envoyées'];
const COULEURS_CHART = ['#1F3864','#5DCAA5','#7F77DD','#F0997B','#FAC775','#ED93B1','#B4B2A9','#85B7EB'];

const COLONNES_V7 = [
  { numero: 1, libelle: 'Recherche de leads', sublabel: 'Domaine 1', couleur: '#7F77DD', type: 'domaine' },
  { numero: 2, libelle: 'Phoning', sublabel: 'Domaine 2', couleur: '#5DCAA5', type: 'domaine' },
  { numero: 3, libelle: 'Expression de besoin', sublabel: 'Domaine 3', couleur: '#85B7EB', type: 'domaine' },
  { numero: 4, libelle: 'Suivi des propales', sublabel: 'Propositions', couleur: '#FAC775', type: 'propales' },
  { numero: 5, libelle: 'Avancement', sublabel: 'Com / Financ / Signé', couleur: '#1D9E75', type: 'avancement' }
];

const KPI_TYPES = [
  { code: 'contacts', label: 'Nombre de contacts' },
  { code: 'rdv_qualifies', label: 'RDV qualifiés' },
  { code: 'propales_redigees', label: 'Propales rédigées' },
  { code: 'en_cours', label: 'En cours (entre 3 et 4)' },
  { code: 'offres_signees', label: 'Offres signées' },
  { code: 'offres_perdues', label: 'Offres perdues' }
];

let state = {
  user: null,
  produits: [], produitActif: null,
  sources: [], utilisateurs: [], objectifs: [], evenements: [], suivi: [],
  objectifsAnnuels: [], cibles: [], domaines: [], resultatsAttendus: [],
  checklist: [], evtObjectifs: [], kpiObjectifs: [],
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
  charts: {},
  currentChecklistSourceId: null,
  currentEvtObjectifsEvtId: null
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
    sb.from('kpi_objectifs').select('*')
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
  if (cible.statut_avancement && ['Communication','Financement','Paiement','CRM','Signé','Perdu'].includes(cible.statut_avancement) && cible.etape >= 5) return 5;
  if (cible.etape === 4) return 4;
  if (cible.domaine_id) {
    const dom = state.domaines.find(d => d.id === cible.domaine_id);
    if (dom) return dom.numero;
  }
  if (cible.etape <= 3) return cible.etape;
  return 5;
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
  document.querySelectorAll('#produit-actif-label, #produit-tableau-label, #obj-produit-label').forEach(el => el.textContent = state.produitActif.code);
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
  document.getElementById('btn-add-source').addEventListener('click', () => openModalSource());
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
  document.getElementById('cible-domaine').addEventListener('change', e => updateResultatsSelect(parseInt(e.target.value)));

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
  document.getElementById('btn-delete-source').addEventListener('click', deleteSource);
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
// CIBLES
// ============================================================
function openModalCible(prefill = {}) {
  document.getElementById('cible-form').reset();
  document.getElementById('cible-id').value = prefill.id || '';
  document.getElementById('modal-cible-title').textContent = prefill.id ? 'Modifier la tâche' : 'Nouvelle tâche';
  document.getElementById('btn-delete-cible').classList.toggle('hidden', !prefill.id);

  const domSel = document.getElementById('cible-domaine');
  domSel.innerHTML = '<option value="">— Choisir —</option>';
  state.domaines.forEach(d => {
    const o = document.createElement('option');
    o.value = d.id; o.textContent = d.numero + '. ' + d.nom;
    if (prefill.domaine_id === d.id) o.selected = true;
    domSel.appendChild(o);
  });

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

  updateResultatsSelect(prefill.domaine_id);
  if (prefill.resultat_attendu) {
    const sel = document.getElementById('cible-resultat-select');
    let found = false;
    for (let opt of sel.options) { if (opt.value === prefill.resultat_attendu) { opt.selected = true; found = true; break; } }
    if (!found) document.getElementById('cible-resultat-libre').value = prefill.resultat_attendu;
  }

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
    document.getElementById('section-avancement').style.display = getColonneCible(prefill) === 5 ? 'flex' : 'none';
  } else {
    document.getElementById('cible-etape').value = 1;
    document.getElementById('section-avancement').style.display = 'none';
  }
  document.getElementById('modal-cible').classList.remove('hidden');
}

function updateResultatsSelect(domId) {
  const sel = document.getElementById('cible-resultat-select');
  sel.innerHTML = '<option value="">— Choisir dans la liste —</option>';
  state.resultatsAttendus.filter(r => r.domaine_id === domId).forEach(r => {
    const o = document.createElement('option');
    o.value = r.libelle; o.textContent = r.libelle;
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

  if (resultatLibre && domaineId) {
    await sb.from('resultats_attendus').upsert({ domaine_id: domaineId, libelle: resultatLibre, ordre_affichage: 999 }, { onConflict: 'domaine_id,libelle' });
  }

  let etape = parseInt(document.getElementById('cible-etape').value) || 1;
  if (domaineId) {
    const dom = state.domaines.find(d => d.id === domaineId);
    if (dom) etape = dom.numero;
  }

  const data = {
    description_action: document.getElementById('cible-description').value,
    intitule: document.getElementById('cible-description').value,
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

// ============================================================
// ÉVÉNEMENTS ENRICHIS
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
    document.getElementById('event-objectifs-list').innerHTML = '<p class="hint" style="margin:8px 0;">Enregistrez d\'abord l\'événement pour pouvoir ajouter des objectifs.</p>';
  }
  document.getElementById('modal').classList.remove('hidden');
}

function renderEventObjectifsList(evtId) {
  const container = document.getElementById('event-objectifs-list');
  container.innerHTML = '';
  const objs = state.evtObjectifs.filter(o => o.evenement_id === evtId);
  if (objs.length === 0) {
    container.innerHTML = '<p class="hint" style="margin:8px 0;">Aucun objectif défini. Cliquez sur "+ Ajouter un objectif".</p>';
    return;
  }
  objs.forEach(o => {
    const div = document.createElement('div');
    div.className = 'event-objectif-item';
    const realise = o.nombre_realise !== null ? o.nombre_realise : '—';
    div.innerHTML = `
      <div class="event-objectif-item-content">
        <div class="event-objectif-item-type">${o.type_objectif}</div>
        <div class="event-objectif-item-desc">${o.description || '(sans description)'}${o.commentaire ? ' · '+o.commentaire : ''}</div>
      </div>
      <div class="event-objectif-item-stats"><strong>${realise}</strong> / ${o.nombre_cible}</div>
    `;
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

// ============================================================
// OBJECTIFS PAR ÉVÉNEMENT
// ============================================================
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

  // Mettre à jour le compteur dans la toolbar
  const countEl = document.getElementById('checklist-count');
  if (countEl) countEl.innerHTML = `<strong>${items.length}</strong> action${items.length > 1 ? 's' : ''}`;

  if (items.length === 0) {
    container.innerHTML = '<p class="empty">Aucune action dans la checklist. Cliquez sur "+ Ajouter une action" pour commencer.</p>';
    return;
  }
  items.forEach((item, idx) => {
    const div = document.createElement('div');
    div.className = 'checklist-item';
    let detailsHTML = '';
    if (item.delai) detailsHTML += `<span class="checklist-detail-badge checklist-detail-delai">${item.delai}</span>`;
    if (item.responsable_type) detailsHTML += `<span class="checklist-detail-badge checklist-detail-responsable">${item.responsable_type}</span>`;
    if (item.outils) detailsHTML += `<span class="checklist-detail-badge checklist-detail-outils">${item.outils}</span>`;
    div.innerHTML = `
      <div class="checklist-item-number">${idx + 1}</div>
      <div class="checklist-item-content">
        <div class="checklist-item-action">${item.action}</div>
        ${detailsHTML ? `<div class="checklist-item-details">${detailsHTML}</div>` : ''}
      </div>
      <button class="checklist-item-edit" type="button">Modifier</button>
    `;
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
  else { showToast(id ? 'Action modifiée' : 'Action créée', 'success'); closeM('modal-checklist-item'); await loadData(); renderChecklistItems(sourceId); renderSourcesList(); }
}

async function deleteChecklistItem() {
  const id = document.getElementById('cl-item-id').value;
  const sourceId = parseInt(document.getElementById('cl-item-source-id').value);
  if (!id || !confirm('Supprimer cette action ?')) return;
  await sb.from('checklist_source').delete().eq('id', id);
  showToast('Action supprimée', 'success'); closeM('modal-checklist-item'); await loadData(); renderChecklistItems(sourceId);
}

// ============================================================
// SOURCES (création/édition)
// ============================================================
function openModalSource(prefill = {}) {
  document.getElementById('source-form').reset();
  document.getElementById('source-id').value = prefill.id || '';
  document.getElementById('modal-source-title').textContent = prefill.id ? 'Modifier source' : 'Nouvelle source';
  document.getElementById('btn-delete-source').classList.toggle('hidden', !prefill.id);

  const parentSel = document.getElementById('source-parent');
  parentSel.innerHTML = '<option value="">— Aucun parent</option>';
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
  else { showToast(id ? 'Source modifiée' : 'Source créée', 'success'); closeM('modal-source'); await loadData(); renderAll(); }
}

async function deleteSource() {
  const id = document.getElementById('source-id').value;
  if (!id || !confirm('Supprimer cette source ? Sa checklist sera aussi supprimée.')) return;
  await sb.from('sources').delete().eq('id', id);
  showToast('Source supprimée', 'success'); closeM('modal-source'); await loadData(); renderAll();
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
  renderEventsTable();
  renderSourcesList();
  renderObjectifsAnnuels();
  renderKpi6Table();
  renderObjectifsTable();
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
      if (getColonneCible(cible) === col.numero) return;
      const newData = { updated_at: new Date().toISOString() };
      if (col.numero <= 3) {
        const dom = state.domaines.find(d => d.numero === col.numero);
        if (dom) { newData.domaine_id = dom.id; newData.etape = col.numero; newData.statut_avancement = null; }
      } else if (col.numero === 4) {
        newData.etape = 4; newData.statut_avancement = null;
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
        if (c.resultat_attendu) cardHTML += `<div class="kanban-card-resultat"><strong>Attendu :</strong> ${c.resultat_attendu}${c.nombre_attendu ? ' ('+c.nombre_attendu+')' : ''}</div>`;
        if (src) cardHTML += `<div class="kanban-card-resultat" style="font-size:10px;">${src.nom}</div>`;
        cardHTML += `<div class="kanban-card-meta">`;
        cardHTML += `<span>${resp ? (resp.prenom||'').charAt(0)+'. '+(resp.nom||'') : '—'}</span>`;
        if (col.numero === 5 && c.statut_avancement) cardHTML += `<span class="kanban-card-statut">${c.statut_avancement}</span>`;
        else if (c.date_echeance) cardHTML += `<span class="kanban-card-echeance${isOverdue ? ' overdue' : ''}">${new Date(c.date_echeance).toLocaleDateString('fr-FR')}</span>`;
        if (col.numero === 5 && c.montant_estime > 0) cardHTML += `<span class="kanban-card-montant">${formatEuro(c.montant_estime)} €</span>`;
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

function renderSourcesList() {
  const container = document.getElementById('sources-list');
  if (!container) return;
  container.innerHTML = '';
  const sources = state.sources.filter(s => s.groupe !== 'OUTIL').sort((a,b) => (a.parent_id ? 1 : 0) - (b.parent_id ? 1 : 0));
  sources.forEach(src => {
    const checklistCount = state.checklist.filter(c => c.source_id === src.id).length;
    const evtCount = state.evenements.filter(e => e.source_id === src.id).length;
    const div = document.createElement('div');
    div.className = 'source-card';
    div.innerHTML = `
      <div class="source-card-header">
        <div class="source-card-nom">${src.parent_id ? '└ ' : ''}${src.nom}</div>
        <div class="source-card-groupe">${src.groupe || '—'}</div>
      </div>
      <div class="source-card-meta">
        <strong>${checklistCount}</strong> action(s) checklist · <strong>${evtCount}</strong> événement(s)
      </div>
      <div class="source-card-actions" style="margin-top:10px;">
        <button class="source-card-action-btn btn-checklist">📋 Checklist</button>
        <button class="source-card-action-btn btn-edit">✏️ Modifier</button>
      </div>
    `;
    div.querySelector('.btn-checklist').addEventListener('click', e => { e.stopPropagation(); openChecklistModal(src.id); });
    div.querySelector('.btn-edit').addEventListener('click', e => { e.stopPropagation(); openModalSource(src); });
    container.appendChild(div);
  });
}

function renderDashboard() {
  const objAnnuelGlobal = state.objectifsAnnuels.find(o => o.annee === state.annee && o.periode_msi === 'ANNUEL');
  const caObjectif = objAnnuelGlobal?.ca_cible || 0;
  const msiObjectif = objAnnuelGlobal?.msi_cible || 0;
  const cibles = getCiblesProduitActif();
  const ciblesActives = cibles.filter(c => getColonneCible(c) < 5 || (c.statut_avancement && !['Signé','Perdu'].includes(c.statut_avancement)));
  const ciblesSignees = cibles.filter(c => c.statut_avancement === 'Signé');
  const ciblesPerdues = cibles.filter(c => c.statut_avancement === 'Perdu');
  const ciblesEnCours = cibles.filter(c => getColonneCible(c) === 4);
  const caSigne = ciblesSignees.reduce((s,c) => s + (c.montant_estime || 0), 0);
  const caEnCours = ciblesActives.reduce((s,c) => s + ((c.montant_estime || 0) * (c.niveau_confiance || 0)), 0);
  const atteinteCA = caObjectif > 0 ? Math.round((caSigne / caObjectif) * 100) : 0;
  const rdvSem = state.suivi.filter(s => s.type_activite === 'RDV effectués' && s.annee === state.annee && s.semaine === state.hebdo_semaine).reduce((sum,s) => sum + (s.nombre||0), 0);
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

  document.getElementById('kpi-contrats').textContent = ciblesSignees.length;
  document.getElementById('kpi-contrats-obj').textContent = 'Objectif ' + msiObjectif + ' annuel';
  const cardContrats = document.getElementById('kpi-card-contrats');
  const contratsOk = msiObjectif > 0 && ciblesSignees.length >= msiObjectif;
  cardContrats.className = 'kpi-card-big ' + (contratsOk ? 'kpi-card-ok' : '');
  document.getElementById('kpi-contrats').className = 'kpi-card-big-value ' + (contratsOk ? 'kpi-ok' : '');
  const statusContrats = document.getElementById('kpi-contrats-status');
  if (msiObjectif > 0) { statusContrats.className = 'kpi-card-big-status ' + (contratsOk ? 'ok' : 'alert'); statusContrats.textContent = contratsOk ? 'Atteint' : Math.round((ciblesSignees.length/msiObjectif)*100) + ' %'; }
  else statusContrats.textContent = '';

  // 6 KPI
  const kpiCibles = {};
  if (state.produitActif) {
    state.kpiObjectifs.filter(k => k.produit_id === state.produitActif.id && k.periode_msi === 'ANNUEL').forEach(k => kpiCibles[k.type_kpi] = k.valeur_cible);
  }
  const rdvAnnee = state.suivi.filter(s => s.annee === state.annee && s.type_activite === 'RDV effectués').reduce((sum,s) => sum + (s.nombre||0), 0);
  const contactsAnnee = state.suivi.filter(s => s.annee === state.annee && s.type_activite === 'Appels / Contacts').reduce((sum,s) => sum + (s.nombre||0), 0);
  const propAnnee = state.suivi.filter(s => s.annee === state.annee && s.type_activite === 'Propositions envoyées').reduce((sum,s) => sum + (s.nombre||0), 0);

  document.getElementById('kpi6-contacts').textContent = contactsAnnee;
  document.getElementById('kpi6-contacts-obj').textContent = kpiCibles.contacts ? 'Cible ' + kpiCibles.contacts : '';
  document.getElementById('kpi6-rdv').textContent = rdvAnnee;
  document.getElementById('kpi6-rdv-obj').textContent = kpiCibles.rdv_qualifies ? 'Cible ' + kpiCibles.rdv_qualifies : '';
  document.getElementById('kpi6-propales').textContent = propAnnee;
  document.getElementById('kpi6-propales-obj').textContent = kpiCibles.propales_redigees ? 'Cible ' + kpiCibles.propales_redigees : '';
  document.getElementById('kpi6-encours').textContent = ciblesEnCours.length;
  document.getElementById('kpi6-signees').textContent = ciblesSignees.length;
  document.getElementById('kpi6-signees-obj').textContent = kpiCibles.offres_signees ? 'Cible ' + kpiCibles.offres_signees : '';
  document.getElementById('kpi6-perdues').textContent = ciblesPerdues.length;
  document.getElementById('kpi6-perdues-obj').textContent = kpiCibles.offres_perdues ? 'Cible max ' + kpiCibles.offres_perdues : '';

  document.getElementById('kpi-ca-signe').textContent = formatEuro(caSigne);
  document.getElementById('kpi-ca-cours').textContent = formatEuro(caEnCours);
  document.getElementById('kpi-ca-objectif').textContent = formatEuro(caObjectif);
  document.getElementById('kpi-atteinte-ca').textContent = atteinteCA + ' %';
  document.getElementById('kpi-cibles-act').textContent = ciblesActives.length;

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

  const tbodyCol = document.querySelector('#colonnes-table tbody');
  tbodyCol.innerHTML = '';
  COLONNES_V7.forEach(col => {
    const cs = cibles.filter(c => getColonneCible(c) === col.numero);
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><strong>${col.numero}. ${col.libelle}</strong> <span style="color:#888780;font-size:11px;">(${col.sublabel})</span></td><td>${cs.length}</td>`;
    tbodyCol.appendChild(tr);
  });

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

function renderKpi6Table() {
  const tbody = document.querySelector('#kpi6-table tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  if (!state.produitActif) return;
  KPI_TYPES.forEach(kpi => {
    const existing = state.kpiObjectifs.find(k => k.produit_id === state.produitActif.id && k.periode_msi === 'ANNUEL' && k.type_kpi === kpi.code);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${kpi.label}</strong></td>
      <td><input type="number" class="kpi-input" data-kpi="${kpi.code}" data-id="${existing?.id || ''}" value="${existing?.valeur_cible || 0}" min="0"></td>
      <td><input type="text" class="kpi-input" data-kpi="${kpi.code}" data-field="commentaire" data-id="${existing?.id || ''}" value="${existing?.commentaire || ''}" style="max-width:300px;"></td>
    `;
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
      valeurs.push(state.suivi.filter(s => s.annee === state.annee && s.semaine === w && s.type_activite === 'RDV effectués').reduce((sum,s) => sum + (s.nombre||0), 0));
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
    const enCours = periodes.map(p => cibles.filter(c => c.periode_msi === p.periode_msi && !['Signé','Perdu'].includes(c.statut_avancement)).reduce((s,c) => s + ((c.montant_estime||0)*(c.niveau_confiance||0)), 0));
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
      const n = cibles.filter(c => c.responsable_id === u.id && !['Signé','Perdu'].includes(c.statut_avancement)).length;
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
    rdvData.push(state.suivi.filter(s => s.annee === state.hebdo_annee && s.semaine === w && s.type_activite === 'RDV effectués').reduce((sum,s) => sum + (s.nombre||0), 0));
    propData.push(state.suivi.filter(s => s.annee === state.hebdo_annee && s.semaine === w && s.type_activite === 'Propositions envoyées').reduce((sum,s) => sum + (s.nombre||0), 0));
  }
  if (state.charts.evolRdv) { state.charts.evolRdv.destroy(); delete state.charts.evolRdv; }
  const ctx1 = document.getElementById('chart-evol-rdv');
  if (ctx1) state.charts.evolRdv = new Chart(ctx1, {
    type: 'line',
    data: { labels: semaines, datasets: [
      { label: 'RDV effectués', data: rdvData, borderColor: '#1F3864', backgroundColor: 'rgba(31,56,100,0.1)', tension: 0.3, fill: true },
      { label: 'Objectif', data: semaines.map(() => state.kpi_rdv_cible), borderColor: '#A32D2D', borderDash: [5,5], pointRadius: 0, fill: false }
    ]},
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
  });
  if (state.charts.evolProp) { state.charts.evolProp.destroy(); delete state.charts.evolProp; }
  const ctx2 = document.getElementById('chart-evol-prop');
  if (ctx2) state.charts.evolProp = new Chart(ctx2, {
    type: 'line',
    data: { labels: semaines, datasets: [{ label: 'Propales envoyées', data: propData, borderColor: '#5DCAA5', backgroundColor: 'rgba(93,202,165,0.15)', tension: 0.3, fill: true }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
  });
  if (state.charts.comparComm) { state.charts.comparComm.destroy(); delete state.charts.comparComm; }
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
    orderedSources.push({ ...p, isParent: hasChildren });
    if (hasChildren && state.expandedParents.has(p.id)) {
      sources.filter(s => s.parent_id === p.id).forEach(c => orderedSources.push({ ...c, isChild: true }));
    }
  });

  const header = document.createElement('div');
  header.className = 'cal-row cal-header';
  header.innerHTML = '<div class="cal-cell cal-source-header">Source</div>' +
    MOIS_COURT.map(m => `<div class="cal-cell cal-month-header">${m}</div>`).join('');
  container.appendChild(header);
  const evAnnee = state.evenements.filter(e => new Date(e.date_evenement).getFullYear() === state.cal_annee);

  orderedSources.forEach(src => {
    const row = document.createElement('div');
    row.className = 'cal-row';
    let labelClass = 'cal-source-label';
    let labelContent;
    if (src.isParent) {
      labelClass += ' cal-source-parent';
      if (state.expandedParents.has(src.id)) labelClass += ' expanded';
      labelContent = `<span style="display:flex;align-items:center;flex:1;cursor:pointer;" data-parent-toggle="${src.id}"><span class="chevron">▶</span><span class="cal-source-text">${src.nom}</span></span><span class="cal-source-checklist" data-checklist-source="${src.id}" title="Voir la checklist">📋</span>`;
    } else {
      if (src.isChild) labelClass += ' cal-source-child';
      labelContent = `<span class="cal-source-text">${src.nom}</span><span class="cal-source-checklist" data-checklist-source="${src.id}" title="Voir la checklist">📋</span>`;
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
    const objs = state.evtObjectifs.filter(o => o.evenement_id === ev.id);
    let statut = 'À venir';
    let cls = 'badge-info';
    if (objs.length > 0) {
      const allDone = objs.every(o => o.nombre_realise !== null);
      if (allDone) {
        const allOk = objs.every(o => (o.nombre_realise || 0) >= o.nombre_cible);
        statut = allOk ? 'Tous objectifs atteints' : 'Objectifs partiels';
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

init();
