(function () {
  const { createClient } = window.supabase;
  const config = window.LEADER_CONFIG;

  const db = createClient(
    config.SUPABASE_URL,
    config.SUPABASE_PUBLISHABLE_KEY
  );

  const BUCKET = config.STORAGE_BUCKET;

  let vehiclesCache = [];
  let existingImagesCache = [];

  const accessGate = document.getElementById('accessGate');
  const accessCodeForm =
    document.getElementById('accessCodeForm');

  const loginView =
    document.getElementById('loginView');

  const appView =
    document.getElementById('appView');

  const ACCESS_CODE = '2027';

  function esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /*
   * =========================================================
   * ACCÈS ADMIN
   * =========================================================
   */

  function hasAccessCode() {
    return (
      sessionStorage.getItem(
        'leader_admin_access'
      ) === '1'
    );
  }

  function showAccessGate() {
    if (accessGate) {
      accessGate.hidden = false;
    }

    if (loginView) {
      loginView.hidden = true;
    }

    if (appView) {
      appView.hidden = true;
    }
  }

  function showApp() {
    if (accessGate) {
      accessGate.hidden = true;
    }

    if (loginView) {
      loginView.hidden = true;
    }

    if (appView) {
      appView.hidden = false;
    }
  }

  /*
   * Après le code 2027, on ouvre directement
   * l'interface d'administration.
   */

  async function unlockAdmin() {
    const email = 'admin@leaderautomobile.com';
    const password = ACCESS_CODE;

    const { error } =
      await db.auth.signInWithPassword({
        email,
        password
      });

    if (error) {
      throw new Error(
        'Connexion administrateur impossible : ' +
        error.message
      );
    }

    const {
      data: {
        user
      }
    } = await db.auth.getUser();

    if (!user) {
      throw new Error(
        'Session administrateur introuvable.'
      );
    }

    const {
      data: admin,
      error: adminError
    } = await db
      .from('admin_users')
      .select('id, email')
      .eq('id', user.id)
      .maybeSingle();

    if (adminError) {
      throw adminError;
    }

    if (!admin) {
      await db.auth.signOut();

      throw new Error(
        "Ce compte n'est pas enregistre comme administrateur."
      );
    }

    sessionStorage.setItem(
      'leader_admin_access',
      '1'
    );

    showApp();
  }

 accessCodeForm?.addEventListener(
  'submit',
  async e => {

    e.preventDefault();

    const input =
      document.getElementById(
        'accessCode'
      );

    const error =
      document.getElementById(
        'accessCodeError'
      );

    const button =
      accessCodeForm.querySelector(
        'button[type="submit"]'
      );

    const code =
      input.value.trim();

    error.hidden = true;

    if (code !== ACCESS_CODE) {

      error.textContent =
        'Code incorrect.';

      error.hidden = false;

      input.value = '';
      input.focus();

      return;
    }

    button.disabled = true;
    button.textContent =
      'Connexion...';

    try {

      await unlockAdmin();

      await Promise.all([
        loadDashboard(),
        loadVehicles()
      ]);

    } catch (err) {

      console.error(
        'Erreur admin :',
        err
      );

      error.textContent =
        err.message ||
        "Impossible d'acceder a l'administration.";

      error.hidden = false;

      await db.auth.signOut();

      sessionStorage.removeItem(
        'leader_admin_access'
      );

      accessGate.hidden = false;
      loginView.hidden = true;
      appView.hidden = true;

    } finally {

        button.disabled = false;
        button.textContent =
          'Continuer';

    }
  }
);

  /*
   * =========================================================
   * SÉCURITÉ SESSION
   * =========================================================
   */

  function checkAdminAccess() {
    if (!hasAccessCode()) {
      showAccessGate();
      return false;
    }

    showApp();
    return true;
  }

  /*
   * =========================================================
   * DÉCONNEXION
   * =========================================================
   */

  document
    .getElementById('logoutBtn')
    ?.addEventListener(
      'click',
      async function () {

        sessionStorage.removeItem(
          'leader_admin_access'
        );

        await db.auth.signOut();

        showAccessGate();
      }
    );

  /*
   * =========================================================
   * NAVIGATION ADMIN
   * =========================================================
   */

  function setView(name) {

    document
      .querySelectorAll('.view')
      .forEach(view => {
        view.classList.remove(
          'active'
        );
      });

    const target =
      document.getElementById(
        'view-' + name
      );

    if (target) {
      target.classList.add(
        'active'
      );
    }

    document
      .querySelectorAll(
        '.nav-item[data-view]'
      )
      .forEach(button => {
        button.classList.toggle(
          'active',
          button.dataset.view === name
        );
      });

    if (
      name ===
      'add-vehicle'
    ) {
      resetVehicleForm();
    }
  }

  document
    .querySelectorAll(
      '[data-view]'
    )
    .forEach(button => {

      button.addEventListener(
        'click',
        function () {

          if (
            !hasAccessCode()
          ) {
            showAccessGate();
            return;
          }

          setView(
            button.dataset.view
          );
        }
      );

    });

  document
    .getElementById(
      'cancelVehicleForm'
    )
    ?.addEventListener(
      'click',
      function () {
        setView('vehicles');
      }
    );

  /*
   * =========================================================
   * DASHBOARD
   * =========================================================
   */

  async function loadDashboard() {

    const [
      totalResult,
      disponibleResult,
      venduResult,
      arrivageResult,
      appointmentsResult
    ] = await Promise.all([

      db
        .from('vehicles')
        .select('*', {
          count: 'exact',
          head: true
        }),

      db
        .from('vehicles')
        .select('*', {
          count: 'exact',
          head: true
        })
        .eq(
          'status',
          'disponible'
        ),

      db
        .from('vehicles')
        .select('*', {
          count: 'exact',
          head: true
        })
        .eq(
          'status',
          'vendu'
        ),

      db
        .from('vehicles')
        .select('*', {
          count: 'exact',
          head: true
        })
        .eq(
          'category',
          'arrivage'
        ),

      db
        .from('appointments')
        .select('*', {
          count: 'exact',
          head: true
        })

    ]);

    const grid =
      document.getElementById(
        'statsGrid'
      );

    if (!grid) {
      return;
    }

    grid.innerHTML = [

      [
        'Véhicules',
        totalResult.count || 0
      ],

      [
        'Disponibles',
        disponibleResult.count || 0
      ],

      [
        'Vendus',
        venduResult.count || 0
      ],

      [
        'Arrivages',
        arrivageResult.count || 0
      ],

      [
        'Rendez-vous',
        appointmentsResult.count || 0
      ]

    ]
      .map(
        ([label, value]) => `
          <div class="stat-card">
            <div class="stat-value">
              ${value}
            </div>

            <div class="stat-label">
              ${label}
            </div>
          </div>
        `
      )
      .join('');
  }

  /*
   * =========================================================
   * VÉHICULES
   * =========================================================
   */

  async function loadVehicles() {

    const {
      data,
      error
    } = await db
      .from('vehicles')
      .select(`
        *,
        vehicle_images(
          id,
          public_url,
          storage_path,
          position,
          is_main
        )
      `)
      .order(
        'created_at',
        {
          ascending: false
        }
      );

    if (error) {
      throw error;
    }

    vehiclesCache =
      (data || []).map(vehicle => ({

        ...vehicle,

        images:
          (
            vehicle.vehicle_images ||
            []
          ).sort(
            (a, b) =>
              (a.position || 0) -
              (b.position || 0)
          )

      }));

    const tbody =
      document.querySelector(
        '#vehiclesTable tbody'
      );

    if (!tbody) {
      return;
    }

    tbody.innerHTML =
      vehiclesCache
        .map(vehicle => `

          <tr>

            <td>
              ${
                vehicle.images[0]
                  ? `
                    <img
                      class="thumb"
                      src="${esc(
                        vehicle.images[0]
                          .public_url
                      )}"
                      alt="${esc(
                        vehicle.name
                      )}"
                    >
                  `
                  : '—'
              }
            </td>

            <td>
              ${esc(vehicle.name)}
            </td>

            <td>
              ${esc(
                vehicle.reference
              )}
            </td>

            <td>
              ${esc(
                vehicle.category
              )}
            </td>

            <td>
              ${
                vehicle.price !== null &&
                vehicle.price !== undefined
                  ? Number(
                      vehicle.price
                    ).toLocaleString(
                      'fr-FR'
                    ) +
                    ' ' +
                    esc(
                      vehicle.currency
                    )
                  : '—'
              }
            </td>

            <td>
              <span
                class="status-pill status-${esc(
                  vehicle.status
                )}"
              >
                ${esc(
                  vehicle.status
                )}
              </span>
            </td>

            <td class="row-actions">

              <button
                data-act="edit"
                data-id="${esc(
                  vehicle.id
                )}"
              >
                Modifier
              </button>

              ${
                vehicle.status !==
                'disponible'
                  ? `
                    <button
                      data-act="publish"
                      data-id="${esc(
                        vehicle.id
                      )}"
                    >
                      Publier
                    </button>
                  `
                  : `
                    <button
                      data-act="hide"
                      data-id="${esc(
                        vehicle.id
                      )}"
                    >
                      Dépublier
                    </button>
                  `
              }

              ${
                vehicle.status !==
                'vendu'
                  ? `
                    <button
                      data-act="sold"
                      data-id="${esc(
                        vehicle.id
                      )}"
                    >
                      Marquer vendu
                    </button>
                  `
                  : ''
              }

              <button
                data-act="delete"
                data-id="${esc(
                  vehicle.id
                )}"
                class="danger"
              >
                Supprimer
              </button>

            </td>

          </tr>

        `)
        .join('');
  }

  document
    .querySelector(
      '#vehiclesTable tbody'
    )
    ?.addEventListener(
      'click',
      async function (e) {

        const button =
          e.target.closest(
            'button'
          );

        if (!button) {
          return;
        }

        const id =
          button.dataset.id;

        try {

          if (
            button.dataset.act ===
            'edit'
          ) {
            return editVehicle(id);
          }

          if (
            button.dataset.act ===
            'delete'
          ) {

            if (
              !confirm(
                'Supprimer définitivement ce véhicule et ses photos ?'
              )
            ) {
              return;
            }

            const vehicle =
              vehiclesCache.find(
                item =>
                  String(
                    item.id
                  ) ===
                  String(id)
              );

            if (vehicle) {
              await deleteStorageImages(
                vehicle.images
              );
            }

            const {
              error
            } = await db
              .from('vehicles')
              .delete()
              .eq(
                'id',
                id
              );

            if (error) {
              throw error;
            }
          }

          if (
            button.dataset.act ===
            'publish'
          ) {
            await updateStatus(
              id,
              'disponible'
            );
          }

          if (
            button.dataset.act ===
            'hide'
          ) {
            await updateStatus(
              id,
              'masque'
            );
          }

          if (
            button.dataset.act ===
            'sold'
          ) {
            await updateStatus(
              id,
              'vendu'
            );
          }

          await loadVehicles();
          await loadDashboard();

        } catch (err) {

          console.error(err);

          alert(
            err.message ||
            'Une erreur est survenue.'
          );
        }
      }
    );

  async function updateStatus(
    id,
    status
  ) {

    const {
      error
    } = await db
      .from('vehicles')
      .update({
        status,
        updated_at:
          new Date().toISOString()
      })
      .eq(
        'id',
        id
      );

    if (error) {
      throw error;
    }
  }

  /*
   * =========================================================
   * FORMULAIRE VÉHICULE
   * =========================================================
   */

  function resetVehicleForm() {

    const title =
      document.getElementById(
        'vehicleFormTitle'
      );

    const form =
      document.getElementById(
        'vehicleForm'
      );

    if (title) {
      title.textContent =
        'Ajouter un véhicule';
    }

    form?.reset();

    const id =
      document.getElementById(
        'vehicleId'
      );

    if (id) {
      id.value = '';
    }

    const currency =
      document.getElementById(
        'vCurrency'
      );

    if (currency) {
      currency.value =
        'FCFA';
    }

    existingImagesCache = [];

    renderExistingImages();
  }

  function editVehicle(id) {

    const vehicle =
      vehiclesCache.find(
        item =>
          String(item.id) ===
          String(id)
      );

    if (!vehicle) {
      return;
    }

    document
      .querySelectorAll(
        '.view'
      )
      .forEach(view =>
        view.classList.remove(
          'active'
        )
      );

    document
      .getElementById(
        'view-add-vehicle'
      )
      ?.classList.add(
        'active'
      );

    document
      .querySelectorAll(
        '.nav-item[data-view]'
      )
      .forEach(button =>
        button.classList.toggle(
          'active',
          button.dataset.view ===
          'add-vehicle'
        )
      );

    document.getElementById(
      'vehicleFormTitle'
    ).textContent =
      'Modifier le véhicule';

    document.getElementById(
      'vehicleId'
    ).value =
      vehicle.id;

    document.getElementById(
      'vName'
    ).value =
      vehicle.name || '';

    document.getElementById(
      'vReference'
    ).value =
      vehicle.reference || '';

    document.getElementById(
      'vCategory'
    ).value =
      vehicle.category || '';

    document.getElementById(
      'vStatus'
    ).value =
      vehicle.status || '';

    document.getElementById(
      'vYear'
    ).value =
      vehicle.year || '';

    document.getElementById(
      'vMileage'
    ).value =
      vehicle.mileage ?? '';

    document.getElementById(
      'vPrice'
    ).value =
      vehicle.price ?? '';

    document.getElementById(
      'vCurrency'
    ).value =
      vehicle.currency ||
      'FCFA';

    document.getElementById(
      'vFuel'
    ).value =
      vehicle.fuel || '';

    document.getElementById(
      'vTransmission'
    ).value =
      vehicle.transmission ||
      '';

    document.getElementById(
      'vDescription'
    ).value =
      vehicle.description ||
      '';

    existingImagesCache =
      [
        ...(vehicle.images || [])
      ];

    renderExistingImages();
  }

  function renderExistingImages() {

    const box =
      document.getElementById(
        'existingImages'
      );

    if (!box) {
      return;
    }

    box.innerHTML =
      existingImagesCache
        .map(
          (image, index) => `

            <div class="img-item">

              <img
                src="${esc(
                  image.public_url
                )}"
                alt=""
              >

              <button
                type="button"
                class="remove-image"
                data-image-id="${esc(
                  image.id
                )}"
              >
                Supprimer
              </button>

              ${
                index === 0
                  ? `
                    <small>
                      Image principale
                    </small>
                  `
                  : ''
              }

            </div>

          `
        )
        .join('');
  }

  document
    .getElementById(
      'existingImages'
    )
    ?.addEventListener(
      'click',
      async function (e) {

        const button =
          e.target.closest(
            '.remove-image'
          );

        if (!button) {
          return;
        }

        const image =
          existingImagesCache.find(
            item =>
              String(
                item.id
              ) ===
              String(
                button.dataset
                  .imageId
              )
          );

        if (!image) {
          return;
        }

        if (
          !confirm(
            'Supprimer cette photo ?'
          )
        ) {
          return;
        }

        try {

          await deleteStorageImages(
            [image]
          );

          const {
            error
          } = await db
            .from(
              'vehicle_images'
            )
            .delete()
            .eq(
              'id',
              image.id
            );

          if (error) {
            throw error;
          }

          existingImagesCache =
            existingImagesCache.filter(
              item =>
                String(
                  item.id
                ) !==
                String(
                  image.id
                )
            );

          await normalizeImagePositions(
            document.getElementById(
              'vehicleId'
            ).value
          );

          renderExistingImages();

        } catch (err) {

          alert(
            err.message
          );
        }
      }
    );

  document
    .getElementById(
      'vehicleForm'
    )
    ?.addEventListener(
      'submit',
      async function (e) {

        e.preventDefault();

        const button =
          e.submitter;

        if (button) {
          button.disabled =
            true;
        }

        try {

          const id =
            document.getElementById(
              'vehicleId'
            ).value;

          const payload = {

            name:
              document.getElementById(
                'vName'
              ).value.trim(),

            reference:
              document.getElementById(
                'vReference'
              ).value.trim(),

            category:
              document.getElementById(
                'vCategory'
              ).value,

            status:
              document.getElementById(
                'vStatus'
              ).value,

            year:
              numberOrNull(
                'vYear'
              )
          };

          if (id) {
            const { error } = await db
              .from('vehicles')
              .update({
                ...payload,
                updated_at: new Date().toISOString()
              })
              .eq('id', id);

            if (error) {
              throw error;
            }
          } else {
            const { error } = await db
              .from('vehicles')
              .insert(payload);

            if (error) {
              throw error;
            }
          }

          await loadVehicles();
          await loadDashboard();
          setView('vehicles');

        } catch (err) {
          alert(
            err.message ||
            "Impossible d'enregistrer le vehicule."
          );
        } finally {
          if (button) {
            button.disabled = false;
          }
        }
      }
    );

  /*
   * =========================================================
   * INITIALISATION
   * =========================================================
   */

  if (hasAccessCode()) {
    showApp();

    Promise.all([
      loadDashboard(),
      loadVehicles()
    ]).catch(err => {
      console.error('Erreur de chargement admin :', err);
      sessionStorage.removeItem('leader_admin_access');
      db.auth.signOut();
      showAccessGate();
    });
  } else {
    showAccessGate();
  }

  function numberOrNull(id) {
    const value = document.getElementById(id)?.value.trim();
    return value === '' ? null : Number(value);
  }

})();