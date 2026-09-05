(function () {
  const { createClient } = window.supabase;
  const config = window.LEADER_CONFIG;
  const db = createClient(config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY);
  const state = { vehicles: [], category: '' };

  const nums = config.WHATSAPP_NUMBERS;

  function waLink(number, message) {
    return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
  }
  function formatPhone(n) {
    return n.replace(/(\d{3})(\d{2})(\d{3})(\d{2})(\d{2})/, '$1 $2 $3 $4 $5');
  }
  function money(v, currency) {
    if (v === null || v === undefined || v === '') return 'Prix sur demande';
    return Number(v).toLocaleString('fr-FR') + ' ' + (currency || 'FCFA');
  }
  function categoryLabel(c) {
    return { occasion: 'Occasion', neuve: 'Neuve', arrivage: 'Arrivage' }[c] || c;
  }
  function escapeHTML(s = '') {
    const d = document.createElement('div');
    d.innerText = s;
    return d.innerHTML;
  }

  function renderContacts() {
    const footer = document.getElementById('footerContacts');
    const contact = document.getElementById('contactButtons');
    const html = nums.map(n => `<a class="btn btn-whatsapp" target="_blank" rel="noopener" href="${waLink(n, 'Bonjour Leader Automobile, j’ai une question.')}">Discuter sur WhatsApp · +${formatPhone(n)}</a>`).join('');
    if (footer) footer.innerHTML = nums.map(n => `<a href="${waLink(n, 'Bonjour Leader Automobile, j’ai une question.')}" target="_blank" rel="noopener">+${formatPhone(n)}</a>`).join('');
    if (contact) contact.innerHTML = html;
    const primary = nums[0];
    const link = waLink(primary, 'Bonjour Leader Automobile, je souhaite avoir plus d’informations.');
    const nav = document.getElementById('navWhatsapp');
    const floating = document.getElementById('floatingWhatsapp');
    if (nav) nav.href = link;
    if (floating) floating.href = link;
  }

  async function loadVehicles() {
    const { data, error } = await db
      .from('vehicles')
      .select(`
        id, reference, name, category, year, mileage, price, currency,
        fuel, transmission, description, status, created_at,
        vehicle_images (id, public_url, storage_path, position, is_main)
      `)
      .neq('status', 'masque')
      .order('created_at', { ascending: false });

    if (error) {
      console.error(error);
      showDbError();
      return;
    }

    state.vehicles = (data || []).map(v => ({
      ...v,
      images: (v.vehicle_images || [])
        .sort((a, b) => (a.position || 0) - (b.position || 0))
        .map(i => i.public_url)
        .filter(Boolean)
    }));
    renderHeroVehicles();
    renderVehicles();
    renderArrivals();
    fillVehicleSelect();
  }

  function showDbError() {
    const empty = document.getElementById('vehiclesEmpty');
    if (empty) {
      empty.hidden = false;
      empty.querySelector('h3').textContent = 'Impossible de charger les véhicules';
      empty.querySelector('p').textContent = 'Vérifie la configuration Supabase ou réessaie dans quelques instants.';
    }
  }

  function vehicleCardHTML(v) {
    const images = v.images || [];
    const galleryInner = images.length
      ? `<div class="gallery-track">${images.map((src, i) => `<img src="${escapeHTML(src)}" alt="${escapeHTML(v.name)}" loading="${i === 0 ? 'eager' : 'lazy'}">`).join('')}</div>
         ${images.length > 1 ? `
           <button class="gallery-nav prev" aria-label="Photo précédente">‹</button>
           <button class="gallery-nav next" aria-label="Photo suivante">›</button>
           <div class="gallery-dots">${images.map((_, i) => `<span class="${i === 0 ? 'active' : ''}"></span>`).join('')}</div>` : ''}`
      : `<div class="gallery-empty">Aucune photo</div>`;

    const waMsg = `Bonjour Leader Automobile, je suis intéressé par la ${v.name} (${v.reference}). Prix affiché : ${money(v.price, v.currency)}. Je souhaite avoir plus d'informations.`;
    const waButtons = nums.map(n => `<a class="btn btn-whatsapp btn-sm" target="_blank" rel="noopener" href="${waLink(n, waMsg)}">WhatsApp +${formatPhone(n).split(' ').slice(-2).join(' ')}</a>`).join('');

    return `
      <article class="vehicle-card" data-id="${escapeHTML(v.id)}">
        <div class="gallery" data-index="0">
          ${galleryInner}
          <span class="badge badge-${escapeHTML(v.category)}">${categoryLabel(v.category)}</span>
          ${v.status === 'vendu' ? '<span class="badge-vendu">Vendu</span>' : ''}
        </div>
        <div class="vehicle-body">
          <div class="vehicle-name">${escapeHTML(v.name)}</div>
          <div class="vehicle-ref">Réf. ${escapeHTML(v.reference)}${v.year ? ' · ' + escapeHTML(v.year) : ''}</div>
          <div class="vehicle-specs">
            ${v.mileage !== null && v.mileage !== undefined ? `<span class="spec-pill">${Number(v.mileage).toLocaleString('fr-FR')} km</span>` : ''}
            ${v.transmission ? `<span class="spec-pill">${escapeHTML(v.transmission)}</span>` : ''}
            ${v.fuel ? `<span class="spec-pill">${escapeHTML(v.fuel)}</span>` : ''}
          </div>
          <div class="vehicle-price">${money(v.price, v.currency)}</div>
          ${v.description ? `<p class="vehicle-desc">${escapeHTML(v.description)}</p>` : ''}
          <div class="contact-buttons">${waButtons}</div>
        </div>
      </article>`;
  }

  function renderHeroVehicles() {
    const hero = document.getElementById('heroVehicles');
    if (!hero) return;
    const urls = state.vehicles
      .flatMap(v => v.images || [])
      .filter(Boolean)
      .slice(0, 3);
    hero.innerHTML = urls.map((src, i) =>
      `<img class="hero-car hero-car-${i + 1}" src="${escapeHTML(src)}" alt="" loading="eager">`
    ).join('');
    hero.classList.toggle('has-cars', urls.length > 0);
  }

  function renderVehicles() {
    const grid = document.getElementById('vehiclesGrid');
    const empty = document.getElementById('vehiclesEmpty');
    const list = state.category ? state.vehicles.filter(v => v.category === state.category) : state.vehicles;
    grid.innerHTML = list.map(vehicleCardHTML).join('');
    empty.hidden = list.length > 0;
    grid.hidden = list.length === 0;
    initGalleries(grid);
    observeReveal(grid);
  }

  function renderArrivals() {
    const grid = document.getElementById('arrivalsGrid');
    const empty = document.getElementById('arrivalsEmpty');
    const list = state.vehicles.filter(v => v.category === 'arrivage');
    grid.innerHTML = list.map(vehicleCardHTML).join('');
    empty.hidden = list.length > 0;
    grid.hidden = list.length === 0;
    initGalleries(grid);
    observeReveal(grid);
  }

  function fillVehicleSelect() {
    const sel = document.getElementById('vehicleWanted');
    if (!sel) return;
    sel.innerHTML = '<option value="">Non défini / à discuter</option>' +
      state.vehicles.filter(v => v.status === 'disponible').map(v =>
        `<option value="${escapeHTML(v.id)}">${escapeHTML(v.name)} — ${escapeHTML(money(v.price, v.currency))}</option>`
      ).join('');
  }

  function initGalleries(root) {
    root.querySelectorAll('.gallery').forEach(gallery => {
      const track = gallery.querySelector('.gallery-track');
      const imgs = track ? gallery.querySelectorAll('.gallery-track img') : [];
      if (imgs.length <= 1) return;

      let index = 0;
      const dots = gallery.querySelectorAll('.gallery-dots span');
      function go(i) {
        index = (i + imgs.length) % imgs.length;
        track.style.transform = `translateX(-${index * 100}%)`;
        dots.forEach((d, di) => d.classList.toggle('active', di === index));
      }
      let timer = setInterval(() => go(index + 1), 3800);
      function resetTimer() {
        clearInterval(timer);
        timer = setInterval(() => go(index + 1), 3800);
      }
      gallery.querySelector('.prev')?.addEventListener('click', e => { e.stopPropagation(); go(index - 1); resetTimer(); });
      gallery.querySelector('.next')?.addEventListener('click', e => { e.stopPropagation(); go(index + 1); resetTimer(); });

      let startX = 0;
      gallery.addEventListener('touchstart', e => startX = e.touches[0].clientX, { passive: true });
      gallery.addEventListener('touchend', e => {
        const dx = e.changedTouches[0].clientX - startX;
        if (Math.abs(dx) > 40) {
          go(index + (dx < 0 ? 1 : -1));
          resetTimer();
        }
      }, { passive: true });
    });
  }

  document.getElementById('categoryTabs')?.addEventListener('click', e => {
    const btn = e.target.closest('.tab');
    if (!btn) return;
    document.querySelectorAll('#categoryTabs .tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    state.category = btn.dataset.category;
    renderVehicles();
  });

  document.getElementById('appointmentForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const form = e.target;
    const data = Object.fromEntries(new FormData(form).entries());
    const vehicle = state.vehicles.find(v => String(v.id) === String(data.vehicle_wanted));

    const payload = {
      full_name: data.full_name,
      phone: data.phone,
      vehicle_wanted: vehicle?.name || data.vehicle_wanted || null,
      vehicle_id: vehicle?.id || null,
      wanted_date: data.wanted_date || null,
      wanted_time: data.wanted_time || null,
      appointment_type: data.appointment_type || null,
      message: data.message || null,
      status: 'nouveau'
    };

    const { error } = await db.from('appointments').insert(payload);
    if (error) console.error('Rendez-vous non enregistré :', error);

    const msg = `Bonjour Leader Automobile, je souhaite prendre rendez-vous${vehicle ? ' pour essayer une ' + vehicle.name : ''}.

Nom : ${data.full_name}
Téléphone : ${data.phone}
Date : ${data.wanted_date || 'à définir'}
Heure : ${data.wanted_time || 'à définir'}
Type de rendez-vous : ${data.appointment_type || 'à définir'}
Message : ${data.message || '-'}`;

    window.open(waLink(nums[0], msg), '_blank', 'noopener');
    form.reset();
  });

  // Navbar
  const navbar = document.getElementById('navbar');
  window.addEventListener('scroll', () => navbar?.classList.toggle('scrolled', window.scrollY > 30));
  const hamburger = document.getElementById('hamburger');
  const navLinks = document.getElementById('navLinks');
  const navBackdrop = document.getElementById('navBackdrop');
  function closeMobileNav() {
    navLinks?.classList.remove('open');
    navBackdrop?.classList.remove('open');
    document.body.classList.remove('nav-sheet-open');
  }
  function toggleMobileNav() {
    const open = !navLinks?.classList.contains('open');
    navLinks?.classList.toggle('open', open);
    navBackdrop?.classList.toggle('open', open);
    document.body.classList.toggle('nav-sheet-open', open);
  }
  hamburger?.addEventListener('click', toggleMobileNav);
  navBackdrop?.addEventListener('click', closeMobileNav);
  navLinks?.querySelectorAll('a').forEach(a => a.addEventListener('click', closeMobileNav));

  // Scroll reveal
  const revealObserver = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('in-view'); });
  }, { threshold: 0.15 });
  function observeReveal(root = document) {
    root.querySelectorAll('.reveal, .vehicle-card').forEach(el => revealObserver.observe(el));
  }

  document.getElementById('year').textContent = new Date().getFullYear();
  renderContacts();
  observeReveal();
  loadVehicles();
})();