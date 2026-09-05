(function () {
  const { createClient } = window.supabase;
  const config = window.LEADER_CONFIG;
  const db = createClient(config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY);
  const BUCKET = config.STORAGE_BUCKET;
  let vehiclesCache = [];
  let existingImagesCache = [];

  const appView = document.getElementById('appView');
  const accessGate = document.getElementById('accessGate');
  const accessCodeForm = document.getElementById('accessCodeForm');

  // Code d'accès demandé avant toute interface d'administration.
  // La protection réelle des données reste assurée par Supabase Auth + RLS.
  const ACCESS_CODE = '2027';

  function hasAccessCode() {
    return sessionStorage.getItem('leader_admin_access') === '1';
  }

  function showAccessGate() {
    accessGate.hidden = false;
    appView.hidden = true;
  }

  function unlockAdmin() {
    sessionStorage.setItem('leader_admin_access', '1');
    accessGate.hidden = true;
  }

  async function unlockWithCode() {
    const input = document.getElementById('accessCode');
    const error = document.getElementById('accessCodeError');
    error.hidden = true;
    if (input.value.trim() !== ACCESS_CODE) {
      error.textContent = 'Code incorrect.';
      error.hidden = false;
      input.value = '';
      input.focus();
      return;
    }
    // Le code est aussi utilisé comme mot de passe du compte admin Supabase.
    // Le compte admin doit être configuré avec cet email et ce mot de passe dans Supabase Auth.
    const { error: authError } = await db.auth.signInWithPassword({
      email: 'admin@leaderautomobile.com',
      password: ACCESS_CODE
    });
    if (authError) {
      error.textContent = 'Code accepté, mais le compte administrateur n’est pas configuré.';
      error.hidden = false;
      return;
    }
    try {
      await requireAdmin();
      unlockAdmin();
      showApp();
      await Promise.all([loadDashboard(), loadVehicles(), loadAppointments()]);
    } catch (err) {
      await db.auth.signOut();
      error.textContent = err.message || 'Accès administrateur refusé.';
      error.hidden = false;
    }
  }

  accessCodeForm?.addEventListener('submit', async e => {
    e.preventDefault();
    const button = e.submitter;
    if (button) button.disabled = true;
    try { await unlockWithCode(); } finally { if (button) button.disabled = false; }
  });

  async function requireAdmin() {
    const { data: { user } } = await db.auth.getUser();
    if (!user) throw new Error('Session expirée');
    const { data, error } = await db.from('admin_users').select('id').eq('id', user.id).maybeSingle();
    if (error || !data) {
      await db.auth.signOut();
      throw new Error('Ce compte n’a pas accès à l’administration.');
    }
    return user;
  }

  function showLogin() { appView.hidden = true; showAccessGate(); }
  function showApp() { accessGate.hidden = true; appView.hidden = false; }

  async function boot() {
    try {
      await requireAdmin();
      showApp();
      await Promise.all([loadDashboard(), loadVehicles(), loadAppointments()]);
    } catch {
      await db.auth.signOut();
      sessionStorage.removeItem('leader_admin_access');
      showAccessGate();
    }
  }

  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await db.auth.signOut();
    sessionStorage.removeItem('leader_admin_access');
    showAccessGate();
  });

  // Navigation
  function setView(name) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-' + name).classList.add('active');
    document.querySelectorAll('.nav-item[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === name));
    if (name === 'add-vehicle') resetVehicleForm();
  }
  document.querySelectorAll('[data-view]').forEach(btn => btn.addEventListener('click', () => setView(btn.dataset.view)));
  document.getElementById('cancelVehicleForm').addEventListener('click', () => setView('vehicles'));

  // Dashboard
  async function loadDashboard() {
    const [{ count: total }, { count: disponible }, { count: vendu }, { count: arrivage }, { count: appointments }] = await Promise.all([
      db.from('vehicles').select('*', { count: 'exact', head: true }),
      db.from('vehicles').select('*', { count: 'exact', head: true }).eq('status', 'disponible'),
      db.from('vehicles').select('*', { count: 'exact', head: true }).eq('status', 'vendu'),
      db.from('vehicles').select('*', { count: 'exact', head: true }).eq('category', 'arrivage'),
      db.from('appointments').select('*', { count: 'exact', head: true })
    ]);
    const grid = document.getElementById('statsGrid');
    grid.innerHTML = [
      ['Véhicules', total || 0],
      ['Disponibles', disponible || 0],
      ['Vendus', vendu || 0],
      ['Arrivages', arrivage || 0],
      ['Rendez-vous', appointments || 0]
    ].map(([label, val]) => `<div class="stat-card"><div class="stat-value">${val}</div><div class="stat-label">${label}</div></div>`).join('');
  }

  // Vehicles
  async function loadVehicles() {
    const { data, error } = await db.from('vehicles')
      .select('*, vehicle_images(id, public_url, storage_path, position, is_main)')
      .order('created_at', { ascending: false });
    if (error) throw error;
    vehiclesCache = (data || []).map(v => ({
      ...v,
      images: (v.vehicle_images || []).sort((a,b) => (a.position || 0) - (b.position || 0))
    }));

    const tbody = document.querySelector('#vehiclesTable tbody');
    tbody.innerHTML = vehiclesCache.map(v => `
      <tr>
        <td>${v.images[0] ? `<img class="thumb" src="${esc(v.images[0].public_url)}">` : '—'}</td>
        <td>${esc(v.name)}</td>
        <td>${esc(v.reference)}</td>
        <td>${esc(v.category)}</td>
        <td>${v.price !== null && v.price !== undefined ? Number(v.price).toLocaleString('fr-FR') + ' ' + esc(v.currency) : '—'}</td>
        <td><span class="status-pill status-${esc(v.status)}">${esc(v.status)}</span></td>
        <td class="row-actions">
          <button data-act="edit" data-id="${esc(v.id)}">Modifier</button>
          ${v.status !== 'disponible' ? `<button data-act="publish" data-id="${esc(v.id)}">Publier</button>` : `<button data-act="hide" data-id="${esc(v.id)}">Dépublier</button>`}
          ${v.status !== 'vendu' ? `<button data-act="sold" data-id="${esc(v.id)}">Marquer vendu</button>` : ''}
          <button data-act="delete" data-id="${esc(v.id)}" class="danger">Supprimer</button>
        </td>
      </tr>`).join('');
  }

  document.querySelector('#vehiclesTable tbody').addEventListener('click', async e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const id = btn.dataset.id;
    try {
      if (btn.dataset.act === 'edit') return editVehicle(id);
      if (btn.dataset.act === 'delete') {
        if (!confirm('Supprimer définitivement ce véhicule et ses photos ?')) return;
        const v = vehiclesCache.find(x => String(x.id) === String(id));
        if (v) await deleteStorageImages(v.images);
        const { error } = await db.from('vehicles').delete().eq('id', id);
        if (error) throw error;
      }
      if (btn.dataset.act === 'publish') await updateStatus(id, 'disponible');
      if (btn.dataset.act === 'hide') await updateStatus(id, 'masque');
      if (btn.dataset.act === 'sold') await updateStatus(id, 'vendu');
      await loadVehicles();
      await loadDashboard();
    } catch (err) { alert(err.message); }
  });

  async function updateStatus(id, status) {
    const { error } = await db.from('vehicles').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
  }

  function resetVehicleForm() {
    document.getElementById('vehicleFormTitle').textContent = 'Ajouter un véhicule';
    document.getElementById('vehicleForm').reset();
    document.getElementById('vehicleId').value = '';
    document.getElementById('vCurrency').value = 'FCFA';
    existingImagesCache = [];
    renderExistingImages();
  }

  function editVehicle(id) {
    const v = vehiclesCache.find(x => String(x.id) === String(id));
    if (!v) return;
    document.querySelectorAll('.view').forEach(x => x.classList.remove('active'));
    document.getElementById('view-add-vehicle').classList.add('active');
    document.querySelectorAll('.nav-item[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === 'add-vehicle'));

    document.getElementById('vehicleFormTitle').textContent = 'Modifier le véhicule';
    document.getElementById('vehicleId').value = v.id;
    document.getElementById('vName').value = v.name;
    document.getElementById('vReference').value = v.reference;
    document.getElementById('vCategory').value = v.category;
    document.getElementById('vStatus').value = v.status;
    document.getElementById('vYear').value = v.year || '';
    document.getElementById('vMileage').value = v.mileage ?? '';
    document.getElementById('vPrice').value = v.price ?? '';
    document.getElementById('vCurrency').value = v.currency || 'FCFA';
    document.getElementById('vFuel').value = v.fuel || '';
    document.getElementById('vTransmission').value = v.transmission || '';
    document.getElementById('vDescription').value = v.description || '';
    existingImagesCache = [...(v.images || [])];
    renderExistingImages();
  }

  function renderExistingImages() {
    const box = document.getElementById('existingImages');
    box.innerHTML = existingImagesCache.map((img, i) => `
      <div class="img-item">
        <img src="${esc(img.public_url)}" alt="">
        <button type="button" class="remove-image" data-image-id="${esc(img.id)}">Supprimer</button>
        ${i === 0 ? '<small>Image principale</small>' : ''}
      </div>`).join('');
  }

  document.getElementById('existingImages').addEventListener('click', async e => {
    const btn = e.target.closest('.remove-image');
    if (!btn) return;
    const img = existingImagesCache.find(x => String(x.id) === String(btn.dataset.imageId));
    if (!img) return;
    if (!confirm('Supprimer cette photo ?')) return;
    try {
      await deleteStorageImages([img]);
      const { error } = await db.from('vehicle_images').delete().eq('id', img.id);
      if (error) throw error;
      existingImagesCache = existingImagesCache.filter(x => String(x.id) !== String(img.id));
      await normalizeImagePositions(document.getElementById('vehicleId').value);
      renderExistingImages();
    } catch (err) { alert(err.message); }
  });

  document.getElementById('vehicleForm').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = e.submitter;
    if (btn) btn.disabled = true;

    try {
      const id = document.getElementById('vehicleId').value;
      const payload = {
        name: document.getElementById('vName').value.trim(),
        reference: document.getElementById('vReference').value.trim(),
        category: document.getElementById('vCategory').value,
        status: document.getElementById('vStatus').value,
        year: numberOrNull('vYear'),
        mileage: numberOrNull('vMileage'),
        price: numberOrNull('vPrice'),
        currency: document.getElementById('vCurrency').value.trim() || 'FCFA',
        fuel: document.getElementById('vFuel').value.trim() || null,
        transmission: document.getElementById('vTransmission').value.trim() || null,
        description: document.getElementById('vDescription').value.trim() || null,
        updated_at: new Date().toISOString()
      };

      let vehicleId = id;
      if (id) {
        const { error } = await db.from('vehicles').update(payload).eq('id', id);
        if (error) throw error;
      } else {
        const { data, error } = await db.from('vehicles').insert(payload).select('id').single();
        if (error) throw error;
        vehicleId = data.id;
      }

      const files = [...document.getElementById('vImages').files];
      await uploadImages(vehicleId, files);
      await normalizeImagePositions(vehicleId);

      e.target.reset();
      document.getElementById('vImages').value = '';
      setView('vehicles');
      await loadVehicles();
      await loadDashboard();
    } catch (err) {
      alert(err.message);
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  async function uploadImages(vehicleId, files) {
    if (!files.length) return;
    const { data: { user } } = await db.auth.getUser();
    if (!user) throw new Error('Session expirée.');

    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      if (file.size > 8 * 1024 * 1024) throw new Error('Chaque image doit faire moins de 8 Mo.');

      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const path = `${user.id}/${vehicleId}/${crypto.randomUUID()}.${ext}`;

      const { error: uploadError } = await db.storage.from(BUCKET).upload(path, file, {
        cacheControl: '31536000',
        upsert: false,
        contentType: file.type
      });
      if (uploadError) throw uploadError;

      const { data: urlData } = db.storage.from(BUCKET).getPublicUrl(path);
      const { error: imageError } = await db.from('vehicle_images').insert({
        vehicle_id: vehicleId,
        storage_path: path,
        public_url: urlData.publicUrl,
        position: 999,
        is_main: false
      });
      if (imageError) {
        await db.storage.from(BUCKET).remove([path]);
        throw imageError;
      }
    }
  }

  async function deleteStorageImages(images) {
    const paths = images.map(i => i.storage_path).filter(Boolean);
    if (!paths.length) return;
    const { error } = await db.storage.from(BUCKET).remove(paths);
    if (error) console.warn('Suppression storage :', error.message);
  }

  async function normalizeImagePositions(vehicleId) {
    if (!vehicleId) return;
    const { data, error } = await db.from('vehicle_images').select('id').eq('vehicle_id', vehicleId).order('position', { ascending: true }).order('created_at', { ascending: true });
    if (error) throw error;
    for (let i = 0; i < (data || []).length; i++) {
      const { error: e } = await db.from('vehicle_images').update({ position: i, is_main: i === 0 }).eq('id', data[i].id);
      if (e) throw e;
    }
  }

  // Appointments
  async function loadAppointments() {
    const status = document.getElementById('apptStatusFilter').value;
    let query = db.from('appointments').select('*').order('created_at', { ascending: false });
    if (status) query = query.eq('status', status);
    const { data: rows, error } = await query;
    if (error) throw error;

    const tbody = document.querySelector('#appointmentsTable tbody');
    tbody.innerHTML = (rows || []).map(r => {
      const waMsg = `Bonjour ${r.full_name}, ceci est Leader Automobile concernant votre rendez-vous.`;
      const waHref = `https://wa.me/${config.WHATSAPP_NUMBERS[0]}?text=${encodeURIComponent(waMsg)}`;
      return `<tr>
        <td>${esc(r.full_name)}</td>
        <td>${esc(r.phone)}</td>
        <td>${esc(r.vehicle_wanted || '—')}</td>
        <td>${esc(r.wanted_date || '—')}</td>
        <td>${esc(r.wanted_time || '—')}</td>
        <td>${esc(r.appointment_type || '—')}</td>
        <td><select data-id="${esc(r.id)}" class="status-select">
          ${['nouveau','contacte','confirme','termine','annule'].map(s => `<option value="${s}" ${s === r.status ? 'selected' : ''}>${s}</option>`).join('')}
        </select></td>
        <td class="row-actions">
          <a href="${waHref}" target="_blank" rel="noopener"><button type="button">WhatsApp</button></a>
          <button data-act="delete-appt" data-id="${esc(r.id)}" class="danger">Supprimer</button>
        </td>
      </tr>`;
    }).join('');
  }

  document.getElementById('apptStatusFilter').addEventListener('change', () => loadAppointments().catch(e => alert(e.message)));

  document.querySelector('#appointmentsTable tbody').addEventListener('change', async e => {
    if (!e.target.classList.contains('status-select')) return;
    const { error } = await db.from('appointments').update({ status: e.target.value }).eq('id', e.target.dataset.id);
    if (error) alert(error.message);
    else loadDashboard();
  });

  document.querySelector('#appointmentsTable tbody').addEventListener('click', async e => {
    const btn = e.target.closest('button[data-act="delete-appt"]');
    if (!btn) return;
    if (!confirm('Supprimer ce rendez-vous ?')) return;
    const { error } = await db.from('appointments').delete().eq('id', btn.dataset.id);
    if (error) return alert(error.message);
    await loadAppointments();
    await loadDashboard();
  });

  // Password
  document.getElementById('passwordForm').addEventListener('submit', async e => {
    e.preventDefault();
    const msg = document.getElementById('passwordMsg');
    msg.hidden = true;
    const current = document.getElementById('currentPassword').value;
    const next = document.getElementById('newPassword').value;
    if (!current || !next) return;
    // Supabase verifies the current password by signing in again.
    const { data: { user } } = await db.auth.getUser();
    if (!user?.email) return;
    const { error: verifyError } = await db.auth.signInWithPassword({ email: user.email, password: current });
    if (verifyError) {
      msg.textContent = 'Mot de passe actuel incorrect.';
      msg.hidden = false;
      return;
    }
    const { error } = await db.auth.updateUser({ password: next });
    if (error) {
      msg.textContent = error.message;
      msg.hidden = false;
      return;
    }
    msg.textContent = 'Mot de passe mis à jour.';
    msg.hidden = false;
    e.target.reset();
  });

  function numberOrNull(id) {
    const v = document.getElementById(id).value;
    return v === '' ? null : Number(v);
  }
  function esc(v = '') {
    return String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  }

  if (hasAccessCode()) {
    unlockAdmin();
    boot();
  } else {
    showAccessGate();
  }
})();