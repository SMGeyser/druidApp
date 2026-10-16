# Moonwild

A responsive character companion for a **D&D 5.5e / 2024 Circle of the Moon druid**, built with native JavaScript, CSS, and local artwork. No packages required.

## Run

Requires Node.js 20 or later.

```powershell
cd druidApp
npm start
```

Open http://127.0.0.1:4173. Set `PORT` to choose another port. The included server listens only on localhost.

For deployment, run `npm run build` and publish `dist/` with any static web host. The GitHub Pages workflow checks the code, runs the tests, builds the static files, and deploys after pushes to `main`. It publishes only the website's runtime files, images, and rules data.

GitHub repository: https://github.com/SMGeyser/druidApp

Character saves are local to each browser and website address. To move a character from localhost to the hosted site, export it locally and use **Restore backup** on the hosted site.

```powershell
npm run check
npm test
```

## Features

- Dedicated Wild Shape page: 85 individual SRD 5.2 Beast forms, full stat blocks, search, CR and movement filters, favorites, grid/list views, known forms, and transformation tracking.
- Moon progression through levels 1–20: subclass unlock at 3, CR scaling, AC, temporary HP, flight at 8, known forms and resource limits.
- Character editing, HP/healing/damage, nonstacking temporary HP, ability rolls, retained mental scores, active-form duration, and concentration reminders.
- Short/Long Rest recovery, optional one-form Long Rest replacement, Wild Resurgence, and Moonlight Step tracking.
- SRD 5.2 druid spell reference, prepared spell selection, slot consumption/upcasting, concentration, and Wild Shape casting restrictions.
- Campaign notes, equipment and trait notes, dated journal entries, activity history, browser-local persistence, and JSON backup export/restore.
- An individual realistic animal image for every form, locally served in WebP format with lazy loading. Responsive layouts, labeled dialogs, and keyboard navigation for collection tabs.

The included level-6 character is a starting example. Use **Manage character** and **Manage forms** to configure your own. Form management and spell preparation controls are sheet setup/level-up/Long Rest tools; they do not simulate time passing. Short Rest healing from Hit Dice, combat turns, attacks, saves, spell effects, conditions, and feats are resolved at the table. Learn your cantrips during setup/level-up; the limit accounts for the Magician Primal Order. HP maximum, normal AC, and ability scores are entered manually. This companion assumes a single-class druid. Apply bonuses from feats, magic items, and additional proficiencies at the table; the displayed Moon CON save uses the Beast's save plus the Moon Wisdom bonus.

Your save is stored under `moonwild.character.v1` in localStorage for the current browser and origin. Export backups before clearing browser storage or changing ports. The first load needs a local web server; after that, rules data and images are served locally with no API requests. The interface uses system fonts, with no remote font requests.

## Design

The interface applies [Dieter Rams’s principles](https://www.vitsoe.com/us/about/good-design) through practical choices:

- **Useful:** current resources and the form collection appear first. Cards compare AC, movement, attack bonus, and traits instead of repeating the same transformation HP on every card.
- **Understandable:** actions have text labels, unavailable transformations explain why, and detailed rules are available on demand. Collection tabs support arrow keys, Home, and End.
- **Aesthetic:** consistent photographic framing, a restrained green palette, comfortable type sizes, and a simple spacing system.
- **Unobtrusive:** no decorative hero banner, no remote fonts, no card hover motion, and no repeating inspirational copy. Character and form data remain the focus.
- **Honest and resource-conscious:** the app distinguishes generated artwork from licensed photographs and life reconstructions; game statistics come from the SRD. Each image is stored locally, compressed to WebP, and loaded only when needed.

There are **44 images created with the built-in image generation tool** and **41 freely licensed reference photographs or prehistoric life reconstructions from Wikimedia Commons**. Generation reached the account limit, so licensed references complete the collection. The prompt set, original source links, authors, licenses, and conversion notes are recorded in `data/artwork.json`; final assets are under `assets/forms/`. Credits are accessible from a form’s stat block and from Rules & sources. Each photograph retains its stated license; the image collection has no single blanket license.

The common generation prompt requests a single anatomically credible animal, complete in frame, natural textures, soft daylight, and an uncluttered habitat. Photographs for giant forms are references for the animal species; the stat block determines fantasy size. Prehistoric forms use life reconstructions, not fossil photographs. Images total about 12 MB, load lazily, and require no external requests. Image generation is not required to run the app.

## Rules and attribution

Creature and spell data retrieved October 16, 2026 from [Open5e API v2](https://open5e.com/api-docs), filtered to `document__key=srd-2024`. Original unmodified records are in `data/`. Swarms are excluded from the UI. Data can be refreshed using the API endpoints:

- `https://api.open5e.com/v2/creatures/?document__key=srd-2024&type=beast&limit=100`
- `https://api.open5e.com/v2/spells/?document__key=srd-2024&limit=500` (filter to the druid class plus circle spells)

This work includes material taken from the System Reference Document 5.2 (“SRD 5.2”) by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2 is licensed under the Creative Commons Attribution 4.0 International License available at https://creativecommons.org/licenses/by/4.0/legalcode. Changes include presentation, filtering, and derived character statistics.

Class progression checked against the [2024 Druid rules](https://www.dndbeyond.com/sources/dnd/br-2024/character-classes#Druid). Subclass features summarized from the [official Circle of the Moon overview](https://www.dndbeyond.com/posts/1755-the-2024-circle-of-the-moon-druid-and-changes-to); consult the 2024 Player’s Handbook for full text. **Fount of Moonlight** is outside the SRD: its text is not reproduced. Use the slot tracker and your handbook for it.

Independent fan companion; unaffiliated with Wizards of the Coast.
