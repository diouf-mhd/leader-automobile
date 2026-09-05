# Leader Automobile

Site vitrine automobile PWA avec administration, Supabase et WhatsApp.

## Stack

- Frontend : HTML, CSS et JavaScript
- Base de données : Supabase PostgreSQL
- Authentification admin : Supabase Auth
- Images : Supabase Storage
- Hébergement : Vercel
- PWA : manifest + service worker + bouton d'installation
- Contact : WhatsApp

Le site démarre vide. Aucun véhicule fictif n'est inclus.

## Configuration Supabase

Le fichier `js/config.js` contient l'URL Supabase et la clé publishable fournies pour le projet.

La clé `sb_publishable_...` est destinée au frontend. La sécurité repose sur les règles RLS Supabase. Ne mets jamais une clé `service_role` dans le frontend.

## Première configuration

1. Ouvre ton projet Supabase.
2. Va dans SQL Editor.
3. Exécute `SUPABASE_SETUP.sql`.
4. Dans Authentication > Users, crée un utilisateur administrateur.
5. Utilise comme email initial `admin@leaderautomobile.com`.
6. Donne-lui le mot de passe `LeaderAutomobile`.
7. Après la création, exécute dans SQL Editor :

```sql
insert into public.admin_users (id, email)
select id, email
from auth.users
where email = 'admin@leaderautomobile.com'
on conflict (id) do nothing;
```

8. Connecte-toi sur `/admin`.

Le mot de passe se change ensuite depuis Paramètres dans l'administration.

## PWA

Le site est installable comme application sur les navigateurs compatibles.

- `manifest.webmanifest`
- `sw.js`
- icônes 192x192 et 512x512
- bouton « Installer l’app » lorsque le navigateur expose l'installation
- cache du shell de l'application
- fonctionnement avec Vercel en HTTPS

Pour Android/Chrome, le bouton d'installation apparaît après les critères PWA du navigateur.

Sur iPhone, l'installation passe par le menu de partage du navigateur lorsque le site est servi en HTTPS.

## Vercel

Déploie le dossier `leader-automobile` comme projet Vercel.

Aucun serveur Node n'est nécessaire.

Le fichier `vercel.json` configure `/admin` vers `/admin/index.html`.

## WhatsApp

Les deux numéros sont centralisés dans `js/config.js` :

- +221 78 168 91 28
- +221 78 680 60 48

Les messages WhatsApp sont générés automatiquement pour les véhicules et les rendez-vous.

## Structure

```text
leader-automobile/
├── index.html
├── css/
├── js/
│   ├── config.js
│   ├── main.js
│   └── pwa.js
├── img/
│   ├── logo.svg
│   ├── icon-192.png
│   └── icon-512.png
├── sw.js
├── manifest.webmanifest
├── vercel.json
├── SUPABASE_SETUP.sql
└── admin/
    ├── index.html
    ├── css/
    └── js/
```


## Accès administration

La page `/admin/` affiche un seul formulaire de code. Le code demandé est `2027`.

Pour conserver la protection Supabase et les règles RLS, le compte Auth `admin@leaderautomobile.com` doit utiliser `2027` comme mot de passe et être présent dans la table `admin_users`.

Le visiteur ne voit pas de formulaire email ou mot de passe. Après validation du code, l’application vérifie automatiquement le compte administrateur Supabase.
