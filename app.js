const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const MOIS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
const MOIS_COURT = ['Janv','Févr','Mars','Avr','Mai','Juin','Juil','Août','Sept','Oct','Nov','Déc'];
const ACTIVITES = ['Appels / Contacts','RDV effectués','Propositions envoyées'];

let state = {
  user: null,
  sources: [], utilisateurs: [], objectifs: [], evenements: [], affaires: [], suivi: [],
  objectifsAnnuels: [], entreprises: [], contacts: [], cibles: [], actions: [], etapes: [],
  annee: new Date().getFullYear(),
  hebdo_annee: new Date().getFullYear(),
  hebdo_semaine: getCurrentWeek(),
  cal_annee: new Date().getFullYear(),
  obj_annee: new Date().getFullYear(),
  plan_periode: '',
  plan_responsable: '',
  ent_filter: '',
  cal_filter_groupe: '',
  kpi_rdv_cible: 4,
  kpi_prop_cible: 8
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
  
  // Charger les cibles KPI depuis localStorage (pour pérennité)
  state.kpi_rdv_cible = parseInt(localStorage.getItem('kpi_rdv_cible') || '4');
  state.kpi_prop_cible = parseInt(localStorage.getItem('kpi_prop_cible') || '8');
  
  await loadData();
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
    sb.from('sources').select('*').order('groupe', { ascending: true }).order('nom', { ascending: true }),
    sb.from('utilisateurs').select('*').order('prenom'),
    sb.from('objectifs').select('*'),
    sb.from('evenements').select('*').order('date_evenement', { ascending: false }),
    sb.from('affaires').select('*').order('updated_at', { ascending: false }),
    sb.from('suivi_hebdo').select('*'),
    sb.from('objectifs_annuels').select('*').order('annee', { ascending: false }),
    sb.from('entreprises').select('*').order('priorite').order('nom'),
    sb.from('contacts_v2').select('*'),
    sb.from('cibles_msi').select('*').order('updated_at', { ascending: false }),
    sb.from('actions_cible').select('*'),
    sb.from('etapes_msi').select('*').order('numero')
  ]);
  state.sources = results[0].data || [];
  state.utilisateurs = results[1].data || [];
  state.objectifs = results[2].data || [];
  state.evenements = results[3].data || [];
  state.affaires = results[4].data || [];
  state.suivi = results[5].data || [];
  state.objectifsAnnuels = results[6].data || [];
  state.entreprises = results[7].data || [];
  state.contacts = results[8].data || [];
  state.cibles = results[9].data || [];
  state.actions = results[10].data || [];
  state.etapes = results[11].data || [];
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
    const opt = document.createElement('option');
    opt.value = u.id; opt.textContent = (u.prenom||'')+' '+(u.nom||'');
    planResp.appendChild(opt);
  });
  planResp.addEventListener('change', e => { state.plan_responsable = e.target.value; renderKanban(); });

  document.getElementById('ent-filter-priorite').addEventListener('change', e => { state.ent_filter = e.target.value; renderEntreprises(); });
  document.getElementById('cal-filter-groupe').addEventListener('change', e => { state.cal_filter_groupe = e.target.value; renderCalendar(); });
}

function setupKpiCibles() {
  const rdvInput = document.getElementById('kpi-rdv-cible');
  const propInput = document.getElementById('kpi-prop-cible');
  rdvInput.value = state.kpi_rdv_cible;
  propInput.value = state.kpi_prop_cible;
  rdvInput.addEventListener('change', e => {
    state.kpi_rdv_cible = parseInt(e.target.value) || 4;
    localStorage.setItem('kpi_rdv_cible', state.kpi_rdv_cible);
    renderDashboard();
    showToast('Objectif RDV mis à jour', 'success');
  });
  propInput.addEventListener('change', e => {
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
    });
  });
  document.getElementById('btn-logout').addEventListener('click', async () => {
    await sb.auth.signOut(); window.location.href = 'index.html';
  });
  document.getElementById('btn-add-event').addEventListener('click', () => openModal());
  document.getElementById('btn-add-from-cal').addEventListener('click', () => openModal());
  document.getElementById('btn-add-affaire').addEventListener('click', () => openModalAffaire());
  document.getElementById('btn-add-periode').addEventListener('click', () => openModalPeriode());
  document.getElementById('btn-add-cible').addEventListener('click', () => openModalCible());
  document.getElementById('btn-add-entreprise').addEventListener('click', () => openModalEntreprise());
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

function setupAllModals() {
  // Événement
  document.getElementById('modal-close').addEventListener('click', () => closeM('modal'));
  document.getElementById('modal').addEventListener('click', e => { if (e.target.id === 'modal') closeM('modal'); });
  document.getElementById('event-form').addEventListener('submit', saveEvent);
  document.getElementById('btn-delete').addEventListener('click', deleteEvent);

  // Affaire
  document.getElementById('modal-affaire-close').addEventListener('click', () => closeM('modal-affaire'));
  document.getElementById('modal-affaire').addEventListener('click', e => { if (e.target.id === 'modal-affaire') closeM('modal-affaire'); });
  document.getElementById('affaire-form').addEventListener('submit', saveAffaire);
  document.getElementById('btn-delete-affaire').addEventListener('click', deleteAffaire);

  // Période
  document.getElementById('modal-periode-close').addEventListener('click', () => closeM('modal-periode'));
  document.getElementById('modal-periode').addEventListener('click', e => { if (e.target.id === 'modal-periode') closeM('modal-periode'); });
  document.getElementById('periode-form').addEventListener('submit', savePeriode);

  // Cible MSI
  document.getElementById('modal-cible-close').addEventListener('click', () => closeM('modal-cible'));
  document.getElementById('modal-cible').addEventListener('click', e => { if (e.target.id === 'modal-cible') closeM('modal-cible'); });
  document.getElementById('cible-form').addEventListener('submit', saveCible);
  document.getElementById('btn-delete-cible').addEventListener('click', deleteCible);
  document.getElementById('btn-add-action').addEventListener('click', () => openModalAction());

  // Entreprise
  document.getElementById('modal-entreprise-close').addEventListener('click', () => closeM('modal-entreprise'));
  document.getElementById('modal-entreprise').addEventListener('click', e => { if (e.target.id === 'modal-entreprise') closeM('modal-entreprise'); });
  document.getElementById('entreprise-form').addEventListener('submit', saveEntreprise);
  document.getElementById('btn-delete-entreprise').addEventListener('click', deleteEntreprise);
  document.getElementById('btn-add-contact').addEventListener('click', () => openModalContact());

  // Contact
  document.getElementById('modal-contact-close').addEventListener('click', () => closeM('modal-contact'));
  document.getElementById('modal-contact').addEventListener('click', e => { if (e.target.id === 'modal-contact') closeM('modal-contact'); });
  document.getElementById('contact-form').addEventListener('submit', saveContact);
  document.getElementById('btn-delete-contact').addEventListener('click', deleteContact);

  // Action
  document.getElementById('modal-action-close').addEventListener('click', () => closeM('modal-action'));
  document.getElementById('modal-action').addEventListener('click', e => { if (e.target.id === 'modal-action') closeM('modal-action'); });
  document.getElementById('action-form').addEventListener('submit', saveAction);
  document.getElementById('btn-delete-action').addEventListener('click', deleteAction);
}

function closeM(id) { document.getElementById(id).classList.add('hidden'); }

function showToast(msg, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = 'toast toast-' + type;
  setTimeout(() => toast.classList.add('hidden'), 3000);
}

// ============================================================
// CIBLES MSI
// ============================================================
function openModalCible(prefill = {}) {
  document.getElementById('cible-form').reset();
  document.getElementById('cible-id').value = prefill.id || '';
  document.getElementById('modal-cible-title').textContent = prefill.id ? 'Modifier la cible MSI' : 'Nouvelle cible MSI';
  document.getElementById('btn-delete-cible').classList.toggle('hidden', !prefill.id);
  document.getElementById('actions-section').classList.toggle('hidden', !prefill.id);

  const entSel = document.getElementById('cible-entreprise');
  entSel.innerHTML = '<option value="">— Choisir —</option>';
  state.entreprises.forEach(e => {
    const opt = document.createElement('option');
    opt.value = e.id; opt.textContent = e.nom + ' [' + e.priorite + ']';
    if (prefill.entreprise_id === e.id) opt.selected = true;
    entSel.appendChild(opt);
  });
  entSel.addEventListener('change', () => updateContactsList());
  updateContactsList(prefill.contact_principal_id);

  const respSel = document.getElementById('cible-responsable');
  respSel.innerHTML = '<option value="">—</option>';
  state.utilisateurs.forEach(u => {
    const opt = document.createElement('option');
    opt.value = u.id; opt.textContent = (u.prenom||'')+' '+(u.nom||'');
    if (prefill.responsable_id === u.id || (!prefill.id && u.id === state.user.id)) opt.selected = true;
    respSel.appendChild(opt);
  });

  const srcSel = document.getElementById('cible-source');
  srcSel.innerHTML = '<option value="">—</option>';
  state.sources.filter(s => s.groupe !== 'OUTIL').forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.id; opt.textContent = (s.groupe ? '['+s.groupe+'] ' : '') + s.nom;
    if (prefill.source_id === s.id) opt.selected = true;
    srcSel.appendChild(opt);
  });

  const etapeSel = document.getElementById('cible-etape');
  etapeSel.innerHTML = '';
  state.etapes.forEach(et => {
    const opt = document.createElement('option');
    opt.value = et.numero; opt.textContent = et.numero + '. ' + et.libelle;
    if (prefill.etape === et.numero) opt.selected = true;
    etapeSel.appendChild(opt);
  });

  const evSel = document.getElementById('cible-evenement');
  evSel.innerHTML = '<option value="">— Aucun —</option>';
  state.evenements.forEach(ev => {
    const opt = document.createElement('option');
    opt.value = ev.id;
    opt.textContent = ev.quoi + ' (' + new Date(ev.date_evenement).toLocaleDateString('fr-FR') + ')';
    if (prefill.evenement_id === ev.id) opt.selected = true;
    evSel.appendChild(opt);
  });

  if (prefill.id) {
    document.getElementById('cible-intitule').value = prefill.intitule || '';
    document.getElementById('cible-periode').value = prefill.periode_msi || '';
    document.getElementById('cible-montant').value = prefill.montant_estime || 0;
    document.getElementById('cible-confiance').value = prefill.niveau_confiance ?? 0.5;
    document.getElementById('cible-notes').value = prefill.notes || '';
    renderActionsList(prefill.id);
  }

  document.getElementById('modal-cible').classList.remove('hidden');
}

function updateContactsList(selectedId = null) {
  const entId = parseInt(document.getElementById('cible-entreprise').value);
  const ctSel = document.getElementById('cible-contact');
  ctSel.innerHTML = '<option value="">— Aucun —</option>';
  state.contacts.filter(c => c.entreprise_id === entId).forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = (c.prenom||'')+' '+(c.nom||'')+(c.fonction ? ' ('+c.fonction+')' : '');
    if (selectedId === c.id) opt.selected = true;
    ctSel.appendChild(opt);
  });
}

function renderActionsList(cibleId) {
  const container = document.getElementById('actions-list');
  container.innerHTML = '';
  const actions = state.actions.filter(a => a.cible_id === cibleId).sort((a,b) => a.etape - b.etape);
  if (actions.length === 0) {
    container.innerHTML = '<p class="hint" style="margin:8px 0;">Aucune action. Cliquez sur "+ Ajouter une action" pour commencer.</p>';
    return;
  }
  actions.forEach(a => {
    const resp = state.utilisateurs.find(u => u.id === a.responsable_id);
    const etape = state.etapes.find(e => e.numero === a.etape);
    const div = document.createElement('div');
    div.className = 'action-item' + (a.est_terminee ? ' terminee' : '');
    div.innerHTML = `
      <input type="checkbox" ${a.est_terminee ? 'checked' : ''} data-toggle-action="${a.id}">
      <div class="action-item-content" data-edit-action="${a.id}" style="cursor:pointer;">
        <div class="action-item-title">${a.intitule}</div>
        <div class="action-item-meta">Étape ${a.etape} · ${etape?.libelle || ''} · ${resp ? (resp.prenom||'')+' '+(resp.nom||'') : 'Pas de responsable'} ${a.date_echeance ? '· Échéance '+new Date(a.date_echeance).toLocaleDateString('fr-FR') : ''}</div>
      </div>
    `;
    container.appendChild(div);
  });
  container.querySelectorAll('[data-toggle-action]').forEach(cb => {
    cb.addEventListener('change', async () => {
      const id = parseInt(cb.dataset.toggleAction);
      const action = state.actions.find(a => a.id === id);
      await sb.from('actions_cible').update({
        est_terminee: cb.checked,
        date_realisation: cb.checked ? new Date().toISOString().split('T')[0] : null
      }).eq('id', id);
      await loadData();
      renderActionsList(action.cible_id);
      renderKanban();
      showToast(cb.checked ? 'Action terminée' : 'Action remise en cours', 'success');
    });
  });
  container.querySelectorAll('[data-edit-action]').forEach(div => {
    div.addEventListener('click', () => {
      const action = state.actions.find(a => a.id === parseInt(div.dataset.editAction));
      openModalAction(action);
    });
  });
}

async function saveCible(e) {
  e.preventDefault();
  const id = document.getElementById('cible-id').value;
  const data = {
    intitule: document.getElementById('cible-intitule').value,
    entreprise_id: parseInt(document.getElementById('cible-entreprise').value) || null,
    contact_principal_id: parseInt(document.getElementById('cible-contact').value) || null,
    responsable_id: document.getElementById('cible-responsable').value || null,
    source_id: parseInt(document.getElementById('cible-source').value) || null,
    etape: parseInt(document.getElementById('cible-etape').value) || 1,
    evenement_id: parseInt(document.getElementById('cible-evenement').value) || null,
    periode_msi: document.getElementById('cible-periode').value || null,
    montant_estime: parseFloat(document.getElementById('cible-montant').value) || 0,
    niveau_confiance: parseFloat(document.getElementById('cible-confiance').value) || 0.5,
    notes: document.getElementById('cible-notes').value || null,
    updated_at: new Date().toISOString()
  };
  if (data.etape === 8) data.date_signature = new Date().toISOString().split('T')[0];
  const { error } = id
    ? await sb.from('cibles_msi').update(data).eq('id', id)
    : await sb.from('cibles_msi').insert([data]);
  if (error) showToast('Erreur : ' + error.message, 'error');
  else {
    showToast(id ? 'Cible modifiée' : 'Cible créée', 'success');
    closeM('modal-cible');
    await loadData();
    renderAll();
  }
}

async function deleteCible() {
  const id = document.getElementById('cible-id').value;
  if (!id || !confirm('Supprimer cette cible MSI et toutes ses actions ?')) return;
  await sb.from('cibles_msi').delete().eq('id', id);
  showToast('Cible supprimée', 'success');
  closeM('modal-cible');
  await loadData();
  renderAll();
}

// ============================================================
// ENTREPRISES
// ============================================================
function openModalEntreprise(prefill = {}) {
  document.getElementById('entreprise-form').reset();
  document.getElementById('ent-id').value = prefill.id || '';
  document.getElementById('modal-entreprise-title').textContent = prefill.id ? 'Modifier entreprise' : 'Nouvelle entreprise';
  document.getElementById('btn-delete-entreprise').classList.toggle('hidden', !prefill.id);
  document.getElementById('contacts-section').classList.toggle('hidden', !prefill.id);
  if (prefill.id) {
    document.getElementById('ent-nom').value = prefill.nom || '';
    document.getElementById('ent-priorite').value = prefill.priorite || 'C';
    document.getElementById('ent-secteur').value = prefill.secteur || '';
    document.getElementById('ent-ville').value = prefill.ville || '';
    document.getElementById('ent-site').value = prefill.site_web || '';
    document.getElementById('ent-notes').value = prefill.notes || '';
    renderContactsList(prefill.id);
  }
  document.getElementById('modal-entreprise').classList.remove('hidden');
}

function renderContactsList(entrepriseId) {
  const container = document.getElementById('contacts-list');
  container.innerHTML = '';
  const contacts = state.contacts.filter(c => c.entreprise_id === entrepriseId);
  if (contacts.length === 0) {
    container.innerHTML = '<p class="hint" style="margin:8px 0;">Aucun contact. Cliquez sur "+ Ajouter un contact".</p>';
    return;
  }
  contacts.forEach(c => {
    const div = document.createElement('div');
    div.className = 'contact-item';
    div.innerHTML = `
      <div class="contact-item-content" data-edit-contact="${c.id}" style="cursor:pointer;">
        <div class="contact-item-title">${(c.prenom||'')+' '+(c.nom||'')} ${c.est_decideur ? '<span class="badge badge-info" style="margin-left:6px;">Décideur</span>' : ''}</div>
        <div class="contact-item-meta">${c.fonction || ''} ${c.email ? '· '+c.email : ''} ${c.telephone ? '· '+c.telephone : ''}</div>
      </div>
    `;
    container.appendChild(div);
  });
  container.querySelectorAll('[data-edit-contact]').forEach(div => {
    div.addEventListener('click', () => {
      const c = state.contacts.find(x => x.id === parseInt(div.dataset.editContact));
      openModalContact(c);
    });
  });
}

async function saveEntreprise(e) {
  e.preventDefault();
  const id = document.getElementById('ent-id').value;
  const data = {
    nom: document.getElementById('ent-nom').value,
    priorite: document.getElementById('ent-priorite').value,
    secteur: document.getElementById('ent-secteur').value || null,
    ville: document.getElementById('ent-ville').value || null,
    site_web: document.getElementById('ent-site').value || null,
    notes: document.getElementById('ent-notes').value || null,
    updated_at: new Date().toISOString()
  };
  const { data: result, error } = id
    ? await sb.from('entreprises').update(data).eq('id', id).select()
    : await sb.from('entreprises').insert([data]).select();
  if (error) showToast('Erreur : ' + error.message, 'error');
  else {
    showToast(id ? 'Entreprise modifiée' : 'Entreprise créée', 'success');
    if (!id && result && result[0]) {
      document.getElementById('ent-id').value = result[0].id;
      document.getElementById('contacts-section').classList.remove('hidden');
      document.getElementById('btn-delete-entreprise').classList.remove('hidden');
    }
    await loadData();
    renderEntreprises();
    if (id) closeM('modal-entreprise');
  }
}

async function deleteEntreprise() {
  const id = document.getElementById('ent-id').value;
  if (!id || !confirm('Supprimer cette entreprise et tous ses contacts ?')) return;
  await sb.from('entreprises').delete().eq('id', id);
  showToast('Entreprise supprimée', 'success');
  closeM('modal-entreprise');
  await loadData();
  renderEntreprises();
}

// ============================================================
// CONTACTS
// ============================================================
function openModalContact(prefill = {}) {
  document.getElementById('contact-form').reset();
  document.getElementById('ct-id').value = prefill.id || '';
  document.getElementById('ct-entreprise-id').value = prefill.entreprise_id || document.getElementById('ent-id').value;
  document.getElementById('modal-contact-title').textContent = prefill.id ? 'Modifier contact' : 'Nouveau contact';
  document.getElementById('btn-delete-contact').classList.toggle('hidden', !prefill.id);
  if (prefill.id) {
    document.getElementById('ct-prenom').value = prefill.prenom || '';
    document.getElementById('ct-nom').value = prefill.nom || '';
    document.getElementById('ct-fonction').value = prefill.fonction || '';
    document.getElementById('ct-email').value = prefill.email || '';
    document.getElementById('ct-tel').value = prefill.telephone || '';
    document.getElementById('ct-decideur').checked = prefill.est_decideur || false;
  }
  document.getElementById('modal-contact').classList.remove('hidden');
}

async function saveContact(e) {
  e.preventDefault();
  const id = document.getElementById('ct-id').value;
  const entId = parseInt(document.getElementById('ct-entreprise-id').value);
  const data = {
    entreprise_id: entId,
    prenom: document.getElementById('ct-prenom').value || null,
    nom: document.getElementById('ct-nom').value,
    fonction: document.getElementById('ct-fonction').value || null,
    email: document.getElementById('ct-email').value || null,
    telephone: document.getElementById('ct-tel').value || null,
    est_decideur: document.getElementById('ct-decideur').checked
  };
  const { error } = id
    ? await sb.from('contacts_v2').update(data).eq('id', id)
    : await sb.from('contacts_v2').insert([data]);
  if (error) showToast('Erreur : ' + error.message, 'error');
  else {
    showToast(id ? 'Contact modifié' : 'Contact créé', 'success');
    closeM('modal-contact');
    await loadData();
    renderContactsList(entId);
  }
}

async function deleteContact() {
  const id = document.getElementById('ct-id').value;
  const entId = parseInt(document.getElementById('ct-entreprise-id').value);
  if (!id || !confirm('Supprimer ce contact ?')) return;
  await sb.from('contacts_v2').delete().eq('id', id);
  showToast('Contact supprimé', 'success');
  closeM('modal-contact');
  await loadData();
  renderContactsList(entId);
}

// ============================================================
// ACTIONS
// ============================================================
function openModalAction(prefill = {}) {
  document.getElementById('action-form').reset();
  document.getElementById('act-id').value = prefill.id || '';
  document.getElementById('act-cible-id').value = prefill.cible_id || document.getElementById('cible-id').value;
  document.getElementById('modal-action-title').textContent = prefill.id ? 'Modifier action' : 'Nouvelle action';
  document.getElementById('btn-delete-action').classList.toggle('hidden', !prefill.id);

  const etapeSel = document.getElementById('act-etape');
  etapeSel.innerHTML = '';
  state.etapes.forEach(et => {
    const opt = document.createElement('option');
    opt.value = et.numero; opt.textContent = et.numero + '. ' + et.libelle;
    if (prefill.etape === et.numero) opt.selected = true;
    etapeSel.appendChild(opt);
  });

  const respSel = document.getElementById('act-responsable');
  respSel.innerHTML = '<option value="">—</option>';
  state.utilisateurs.forEach(u => {
    const opt = document.createElement('option');
    opt.value = u.id; opt.textContent = (u.prenom||'')+' '+(u.nom||'');
    if (prefill.responsable_id === u.id) opt.selected = true;
    respSel.appendChild(opt);
  });

  if (prefill.id) {
    document.getElementById('act-intitule').value = prefill.intitule || '';
    document.getElementById('act-echeance').value = prefill.date_echeance || '';
    document.getElementById('act-notes').value = prefill.notes || '';
  }
  document.getElementById('modal-action').classList.remove('hidden');
}

async function saveAction(e) {
  e.preventDefault();
  const id = document.getElementById('act-id').value;
  const cibleId = parseInt(document.getElementById('act-cible-id').value);
  const data = {
    cible_id: cibleId,
    etape: parseInt(document.getElementById('act-etape').value),
    intitule: document.getElementById('act-intitule').value,
    responsable_id: document.getElementById('act-responsable').value || null,
    date_echeance: document.getElementById('act-echeance').value || null,
    notes: document.getElementById('act-notes').value || null
  };
  const { error } = id
    ? await sb.from('actions_cible').update(data).eq('id', id)
    : await sb.from('actions_cible').insert([data]);
  if (error) showToast('Erreur : ' + error.message, 'error');
  else {
    showToast(id ? 'Action modifiée' : 'Action créée', 'success');
    closeM('modal-action');
    await loadData();
    renderActionsList(cibleId);
    renderKanban();
  }
}

async function deleteAction() {
  const id = document.getElementById('act-id').value;
  const cibleId = parseInt(document.getElementById('act-cible-id').value);
  if (!id || !confirm('Supprimer cette action ?')) return;
  await sb.from('actions_cible').delete().eq('id', id);
  showToast('Action supprimée', 'success');
  closeM('modal-action');
  await loadData();
  renderActionsList(cibleId);
}

// ============================================================
// ÉVÉNEMENTS, AFFAIRES, PÉRIODES (conservés du v3)
// ============================================================
function openModal(prefill = {}) {
  const form = document.getElementById('event-form');
  form.reset();
  document.getElementById('event-id').value = prefill.id || '';
  document.getElementById('modal-title').textContent = prefill.id ? 'Modifier événement' : 'Nouvel événement';
  document.getElementById('btn-delete').classList.toggle('hidden', !prefill.id);
  const srcSelect = document.getElementById('event-source');
  srcSelect.innerHTML = '<option value="">Choisir...</option>';
  state.sources.filter(s => s.groupe !== 'OUTIL').forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.id; opt.textContent = (s.groupe ? '['+s.groupe+'] ' : '') + s.nom;
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

function openModalAffaire(prefill = {}) {
  document.getElementById('affaire-form').reset();
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
  else { showToast(id ? 'Affaire modifiée' : 'Affaire créée', 'success'); closeM('modal-affaire'); await loadData(); renderAll(); }
}

async function deleteAffaire() {
  const id = document.getElementById('affaire-id').value;
  if (!id || !confirm('Supprimer cette affaire ?')) return;
  await sb.from('affaires').delete().eq('id', id);
  showToast('Affaire supprimée', 'success'); closeM('modal-affaire'); await loadData(); renderAll();
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
  showToast('Période ajoutée', 'success');
  closeM('modal-periode');
  await loadData();
  renderObjectifsAnnuels();
  renderDashboard();
}

// ============================================================
// RENDUS
// ============================================================
function renderAll() {
  renderDashboard();
  renderKanban();
  renderHebdo();
  renderEntreprises();
  renderAffaires();
  renderCalendar();
  renderEventsTable();
  renderObjectifsAnnuels();
  renderObjectifsTable();
}

function renderKanban() {
  const board = document.getElementById('kanban-board');
  board.innerHTML = '';
  let ciblesFiltrees = state.cibles;
  if (state.plan_periode) ciblesFiltrees = ciblesFiltrees.filter(c => c.periode_msi === state.plan_periode);
  if (state.plan_responsable) ciblesFiltrees = ciblesFiltrees.filter(c => c.responsable_id === state.plan_responsable);

  state.etapes.forEach(etape => {
    const col = document.createElement('div');
    col.className = 'kanban-column';
    const cibles = ciblesFiltrees.filter(c => c.etape === etape.numero);
    col.innerHTML = `
      <div class="kanban-col-header" style="border-bottom-color:${etape.couleur};">
        <div class="kanban-col-title">${etape.numero}. ${etape.libelle}</div>
        <div class="kanban-col-count">${cibles.length}</div>
      </div>
      <div class="kanban-col-body" data-etape="${etape.numero}"></div>
    `;
    board.appendChild(col);
    const body = col.querySelector('.kanban-col-body');
    if (cibles.length === 0) {
      body.innerHTML = '<div class="kanban-empty">Aucune cible</div>';
    } else {
      cibles.forEach(c => {
        const ent = state.entreprises.find(e => e.id === c.entreprise_id);
        const resp = state.utilisateurs.find(u => u.id === c.responsable_id);
        const nbActions = state.actions.filter(a => a.cible_id === c.id).length;
        const nbActionsOk = state.actions.filter(a => a.cible_id === c.id && a.est_terminee).length;
        const card = document.createElement('div');
        card.className = 'kanban-card';
        card.style.borderLeftColor = etape.couleur;
        card.innerHTML = `
          <div class="kanban-card-title">${c.intitule}</div>
          <div class="kanban-card-entreprise">${ent?.nom || '—'} ${ent?.priorite ? '<span class="badge badge-priorite-'+ent.priorite+'">'+ent.priorite+'</span>' : ''}</div>
          <div class="kanban-card-meta">
            <span>${resp ? (resp.prenom||'').charAt(0)+'. '+(resp.nom||'') : '—'} ${nbActions > 0 ? '· '+nbActionsOk+'/'+nbActions+' actions' : ''}</span>
            <span class="kanban-card-montant">${formatEuro(c.montant_estime)} €</span>
          </div>
        `;
        card.addEventListener('click', () => openModalCible(c));
        body.appendChild(card);
      });
    }
  });
}

function renderEntreprises() {
  const container = document.getElementById('entreprises-list');
  container.innerHTML = '';
  let entreprises = state.entreprises;
  if (state.ent_filter) entreprises = entreprises.filter(e => e.priorite === state.ent_filter);

  if (entreprises.length === 0) {
    container.innerHTML = '<div class="empty" style="grid-column:1/-1;">Aucune entreprise. Cliquez sur "+ Nouvelle entreprise" pour commencer.</div>';
    return;
  }
  entreprises.forEach(ent => {
    const nbContacts = state.contacts.filter(c => c.entreprise_id === ent.id).length;
    const nbCibles = state.cibles.filter(c => c.entreprise_id === ent.id).length;
    const nbCiblesActives = state.cibles.filter(c => c.entreprise_id === ent.id && c.etape < 8).length;
    const div = document.createElement('div');
    div.className = 'entreprise-card';
    div.innerHTML = `
      <div class="entreprise-card-header">
        <div class="entreprise-card-nom">${ent.nom}</div>
        <span class="badge badge-priorite-${ent.priorite}">${ent.priorite}</span>
      </div>
      <div class="entreprise-card-secteur">${ent.secteur || '—'}${ent.ville ? ' · '+ent.ville : ''}</div>
      <div class="entreprise-card-stats">
        <div class="entreprise-card-stat"><strong>${nbContacts}</strong> contact${nbContacts>1?'s':''}</div>
        <div class="entreprise-card-stat"><strong>${nbCiblesActives}</strong>/${nbCibles} cible${nbCibles>1?'s':''}</div>
      </div>
    `;
    div.addEventListener('click', () => openModalEntreprise(ent));
    container.appendChild(div);
  });
}

function renderDashboard() {
  const objAnnuelGlobal = state.objectifsAnnuels.find(o => o.annee === state.annee && o.periode_msi === 'ANNUEL');
  const caObjectif = objAnnuelGlobal?.ca_cible || 0;
  const msiObjectif = objAnnuelGlobal?.msi_cible || 0;

  const ciblesActives = state.cibles.filter(c => c.etape < 8);
  const ciblesSignees = state.cibles.filter(c => c.etape === 8);
  const caSigne = ciblesSignees.reduce((s,c) => s + (c.montant_estime || 0), 0);
  const caEnCours = ciblesActives.reduce((s,c) => s + ((c.montant_estime || 0) * (c.niveau_confiance || 0)), 0);
  const atteinteCA = caObjectif > 0 ? Math.round((caSigne / caObjectif) * 100) : 0;

  // RDV qualifiés cette semaine
  const rdvSem = state.suivi.filter(s => s.type_activite === 'RDV effectués' && s.annee === state.annee && s.semaine === state.hebdo_semaine).reduce((sum,s) => sum + (s.nombre||0), 0);
  // Propales ce mois (estimation : 4 dernières semaines)
  const propMois = state.suivi.filter(s => s.type_activite === 'Propositions envoyées' && s.annee === state.annee && s.semaine >= state.hebdo_semaine-3 && s.semaine <= state.hebdo_semaine).reduce((sum,s) => sum + (s.nombre||0), 0);

  document.getElementById('kpi-rdv-sem').textContent = rdvSem;
  const elRdv = document.getElementById('kpi-rdv-sem');
  elRdv.className = 'kpi-value' + (rdvSem >= state.kpi_rdv_cible ? ' kpi-ok' : ' kpi-alert');
  document.getElementById('kpi-rdv-sem-obj').textContent = 'Objectif ' + state.kpi_rdv_cible;

  document.getElementById('kpi-prop-mois').textContent = propMois;
  const elProp = document.getElementById('kpi-prop-mois');
  elProp.className = 'kpi-value' + (propMois >= state.kpi_prop_cible ? ' kpi-ok' : ' kpi-alert');
  document.getElementById('kpi-prop-mois-obj').textContent = 'Objectif ' + state.kpi_prop_cible;

  document.getElementById('kpi-contrats').textContent = ciblesSignees.length;
  document.getElementById('kpi-contrats-obj').textContent = 'Objectif ' + msiObjectif;
  document.getElementById('kpi-ca-signe').textContent = formatEuro(caSigne);
  document.getElementById('kpi-ca-cours').textContent = formatEuro(caEnCours);
  document.getElementById('kpi-ca-objectif').textContent = formatEuro(caObjectif);
  document.getElementById('kpi-atteinte-ca').textContent = atteinteCA + ' %';
  document.getElementById('kpi-cibles-act').textContent = ciblesActives.length;

  // Performance par période
  const periodes = state.objectifsAnnuels.filter(o => o.annee === state.annee && o.periode_msi !== 'ANNUEL');
  const tbodyPer = document.querySelector('#periodes-table tbody');
  tbodyPer.innerHTML = '';
  if (periodes.length === 0) {
    tbodyPer.innerHTML = '<tr><td colspan="7" class="empty">Aucune période définie pour ' + state.annee + '.</td></tr>';
  } else {
    periodes.forEach(p => {
      const cs = state.cibles.filter(c => c.periode_msi === p.periode_msi);
      const caSP = cs.filter(c => c.etape === 8).reduce((s,c) => s + (c.montant_estime||0), 0);
      const caCP = cs.filter(c => c.etape < 8).reduce((s,c) => s + ((c.montant_estime||0)*(c.niveau_confiance||0)), 0);
      const msiSP = cs.filter(c => c.etape === 8).length;
      const att = p.ca_cible > 0 ? Math.round((caSP / p.ca_cible)*100) : 0;
      const cls = att >= 100 ? 'badge-success' : (att >= 50 ? 'badge-warning' : 'badge-info');
      const tr = document.createElement('tr');
      tr.innerHTML = `<td><strong>${p.periode_msi}</strong></td><td>${formatEuro(p.ca_cible)} €</td><td>${formatEuro(caSP)} €</td><td>${formatEuro(caCP)} €</td><td><span class="badge ${cls}">${att} %</span></td><td>${p.msi_cible}</td><td>${msiSP}</td>`;
      tbodyPer.appendChild(tr);
    });
  }

  // Cibles par étape
  const tbodyEt = document.querySelector('#etapes-table tbody');
  tbodyEt.innerHTML = '';
  state.etapes.forEach(et => {
    const cs = state.cibles.filter(c => c.etape === et.numero);
    const total = cs.reduce((s,c) => s+(c.montant_estime||0), 0);
    const pondere = cs.reduce((s,c) => s+((c.montant_estime||0)*(c.niveau_confiance||0)), 0);
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><strong>${et.numero}. ${et.libelle}</strong></td><td>${cs.length}</td><td>${formatEuro(total)} €</td><td>${formatEuro(pondere)} €</td>`;
    tbodyEt.appendChild(tr);
  });

  // Performance par commercial
  const tbodyC = document.querySelector('#commerciaux-table tbody');
  tbodyC.innerHTML = '';
  if (state.utilisateurs.length === 0) {
    tbodyC.innerHTML = '<tr><td colspan="6" class="empty">Aucun commercial.</td></tr>';
  } else {
    state.utilisateurs.forEach(u => {
      const cs = state.cibles.filter(c => c.responsable_id === u.id);
      const csA = cs.filter(c => c.etape < 8);
      const csS = cs.filter(c => c.etape === 8);
      const rdv = state.suivi.filter(s => s.utilisateur_id === u.id && s.type_activite === 'RDV effectués').reduce((sum,s) => sum + (s.nombre||0), 0);
      const prop = state.suivi.filter(s => s.utilisateur_id === u.id && s.type_activite === 'Propositions envoyées').reduce((sum,s) => sum + (s.nombre||0), 0);
      const cours = csA.reduce((s,c) => s+((c.montant_estime||0)*(c.niveau_confiance||0)), 0);
      const signe = csS.reduce((s,c) => s+(c.montant_estime||0), 0);
      const tr = document.createElement('tr');
      tr.innerHTML = `<td><strong>${u.prenom||''} ${u.nom||''}</strong></td><td>${csA.length}</td><td>${rdv}</td><td>${prop}</td><td>${formatEuro(cours)} €</td><td>${formatEuro(signe)} €</td>`;
      tbodyC.appendChild(tr);
    });
  }
}

function renderHebdo() {
  const tbody = document.querySelector('#hebdo-table tbody');
  tbody.innerHTML = '';
  if (state.utilisateurs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty">Aucun utilisateur.</td></tr>';
    return;
  }
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
}

function renderAffaires() {
  const tbody = document.querySelector('#affaires-table tbody');
  tbody.innerHTML = '';
  if (state.affaires.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty">Aucune affaire (utilisez plutôt le Plan d\'action).</td></tr>';
    return;
  }
  state.affaires.forEach(a => {
    const resp = state.utilisateurs.find(u => u.id === a.responsable_id);
    const pondere = (a.montant || 0) * (a.niveau_confiance || 0);
    const cls = a.etat === 'Contrat validé' ? 'badge-success' : (a.etat === 'Contrat refusé' ? 'badge-danger' : 'badge-info');
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><strong>${a.client}</strong></td><td>${a.intitule}</td><td>${resp ? (resp.prenom||'')+' '+(resp.nom||'') : '—'}</td><td><span class="badge ${cls}">${a.etat}</span></td><td>${formatEuro(a.montant)} €</td><td>${Math.round((a.niveau_confiance||0)*100)} %</td><td>${formatEuro(pondere)} €</td><td>${a.periode_msi || '—'}</td><td><button class="btn-link" data-id="${a.id}">Modifier</button></td>`;
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
  let sources = state.sources;
  if (state.cal_filter_groupe) sources = sources.filter(s => s.groupe === state.cal_filter_groupe);
  sources = sources.filter(s => s.groupe !== 'OUTIL');

  const header = document.createElement('div');
  header.className = 'cal-row cal-header';
  header.innerHTML = '<div class="cal-cell cal-source-header">Source</div>' +
    MOIS_COURT.map((m, i) => `<div class="cal-cell cal-month-header${(i===6||i===7)?' cal-vacation':''}">${m}</div>`).join('');
  container.appendChild(header);
  const evAnnee = state.evenements.filter(e => new Date(e.date_evenement).getFullYear() === state.cal_annee);

  sources.forEach(src => {
    const row = document.createElement('div');
    row.className = 'cal-row';
    let html = '<div class="cal-cell cal-source-label" title="'+src.nom+'">' + src.nom.substring(0,18) + '</div>';
    for (let m = 0; m < 12; m++) {
      const isVac = m === 6 || m === 7;
      const evs = evAnnee.filter(e => e.source_id === src.id && new Date(e.date_evenement).getMonth() === m);
      if (isVac) html += '<div class="cal-cell cal-vacation"></div>';
      else if (evs.length > 0) html += '<div class="cal-cell cal-filled" data-evs=\'' + JSON.stringify(evs.map(e=>e.id)) + '\'>' + evs.length + '</div>';
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
      if (ids.length === 1) { openModal(state.evenements.find(e => e.id === ids[0])); }
      else document.querySelector('.tab[data-tab="events"]').click();
    });
  });
}

function renderEventsTable() {
  const tbody = document.querySelector('#events-table tbody');
  tbody.innerHTML = '';
  if (state.evenements.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty">Aucun événement.</td></tr>';
    return;
  }
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
  state.sources.filter(s => s.groupe !== 'OUTIL').forEach(src => {
    const p1 = state.objectifs.find(o => o.source_id === src.id && o.periode === 'P1');
    const p2 = state.objectifs.find(o => o.source_id === src.id && o.periode === 'P2');
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><strong>${src.nom}</strong></td><td><input type="number" class="obj-input" data-source="${src.id}" data-periode="P1" value="${p1?.cible_contacts||0}" min="0"></td><td><input type="number" class="obj-input" data-source="${src.id}" data-periode="P2" value="${p2?.cible_contacts||0}" min="0"></td><td><strong>${(p1?.cible_contacts||0)+(p2?.cible_contacts||0)}</strong></td>`;
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
