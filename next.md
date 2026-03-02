# next.md — @nan0web/sync

## ✅ Зроблено (v1.0.0 docs)

### ui-lit Web Components

- `ui-badge` — CSS Custom Properties, 5 варіантів
- `ui-table` — авто-колонки з data, hover, header theming
- `ui-code-block` — macOS terminal стиль, traffic-light dots
- Всі компоненти: **0 хардкоду кольорів**, все через `--ui-*` змінні
- Тести: **20/20** (`@nan0web/ui-lit/core`)

### Vite bundler

- `vite.config.js` — resolves `@nan0web/ui-lit` через alias
- `src/web/index.html` — Vite entry point
- `npm run dev` → Vite HMR на :3399
- `npm run build:docs` → build-docs.js + vite build
- Production bundle: **31.79 kB** JS (11.57 kB gzip)

### build-docs.js → db-fs

- `load()` / `save()` з `@nan0web/db-fs` замість `readFileSync` + `yaml.load` + `writeFileSync` + `JSON.stringify`
- `js-yaml` видалено з devDependencies
- `node:fs` залишено ТІЛЬКИ для: `rmSync`, `mkdirSync`, `cpSync`, `existsSync`, `watch`

### Light Theme

- `[data-theme="light"]` токени для `--ui-code-*`, `--ui-table-*`, `--ui-badge-*`
- Code blocks **завжди темні** (Terminal.app pattern)

### Рада Мудреців

- `THINKERS_REVIEW.md` — архітектурний аудит з 8 мислителями
- Оцінка: **7.5/10** — архітектура правильна (OLMUI), реалізація потребує рефакторинг

---

## ✅ Зроблено — Крок 3: app.js → Component Registry

**Проблема:** `app.js` = 458 рядків if/else монолітного рендера. Кожен `block.type` має свою гілку.

**Рішення (за Радою Мудреців):**

1. Створено `src/web/components/` — окремі файли для кожного типу блока, що наслідуються від \`LitElement\` (ui-lit парадигма):
   - `hero.js` — `<ui-hero>`
   - `feature-grid.js` — `<ui-feature-grid>`
   - `safety-layers.js` — `<ui-safety-layers>`
   - `code-section.js` — `<ui-code-section>` (використовує `<ui-code-block>`)
   - `api-grid.js` — `<ui-api-grid>` (використовує `<ui-table>`)
   - `adapter-grid.js` — `<ui-adapter-grid>`
   - `footer.js` — `<ui-footer>`

2. Реєстр компонентів (карта `type → Component`):

   ```js
   import { registry } from './components/index.js'
   ```

3. `app.js` → тепер використовує цикл з `$content` (як UILit).

4. Патерн `UILit` дотримано!

**Еталон:** `@nan0web/ui-lit/src/index.js` (UILit class)

---

## 🟡 TODO — Додаткове

- [ ] `node:path` → замінити де можливо на `@nan0web/db-fs` або відносні шляхи
- [ ] Видалити `src/web/ui-web.js` (вже видалено, перевірити git)
- [ ] `src/web/data` symlink → додати в `.gitignore`
- [ ] Перевірити `knip` після видалення `js-yaml`
- [ ] Production build: lang HTML shells мають посилатись на Vite-bundled assets

---

# NaN•Sync v2.0 Roadmap & Architecture Plan

Цей документ описує стратегічні плани щодо розвитку `@nan0web/sync` у наступній мажорній версії (`v2.0`).

## 1. Інтеграція з Hosting Panels & Cloud (Універсальний Додаток)

Зараз `nan0sync` використовує FTP і тимчасовий скрипт `unpack.php` для пришвидшення завантаження (Bulk Mode). Хоча це працює для класичного shared-хостингу, для сучасних інфраструктур це не є оптимальним шляхом з міркувань безпеки та швидкісних лімітів (PHP timeout, пам'ять).

У v2 ми змінимо підхід: замість закидання PHP-файлів, ми створимо **Універсальний Додаток/Плагін (Native Cloud Connector)**. Клієнт зможе встановити його в один клік у своїй панелі керування. Додаток відкриватиме захищений API-endpoint (REST або WebSocket), з яким напряму спілкуватиметься новий `RemoteAdapter` пакету `sync`.

### Платформи для інтеграції (1-Click Apps & Extensions):

- **Web Hosting Panels:** cPanel, Plesk, ISPmanager, DirectAdmin, CyberPanel, aaPanel.
- **Cloud Providers (Marketplaces):** DigitalOcean (Marketplace App), Hetzner Cloud, AWS (AMI/Marketplace), Google Cloud Platform (GCP), Microsoft Azure, Alibaba Cloud.

### Переваги нового підходу:

- **Швидкість:** Можливість стрімити прямі бенарні дані (HTTP2 / gRPC / WebSockets), обходячи повільний FTP-протокол.
- **Мова:** Додаток на сервері може бути написаний на Go, Rust або зібраним Node.js (щоб не залежати від лімітів і версій хостингового PHP).
- **Атомарність:** Можливість робити Zero-Downtime Deployment через `mv` (симлінки або швидку підміну каталогів на рівні OS), замість послідовного видалення старих файлів.

---

## 2. Відділення CLI від Ядра (`apps/sync.app`)

Зараз `bin/nan0sync.js` виконує надто багато роботи: він і оркеструє `SyncEngine`, і малює прогрес-бари в терміналі, і містить логіку паралельного пакування.

У v2 ми застосуємо принцип **чистої архітектури**:

- Пакунок `@nan0web/sync` стане виключно **ядром** (Engine, Config, Manifest, Adapters). Жодних `console.log`, `process.stdout` чи CLI-залежностей. Його можна буде викликати програмно навіть з інших Node.js сервісів.
- Вся CLI-магія, ETA, progress bars та обробка аргументів терміналу переїдуть у новий додаток **`apps/sync.app`** (можливо опублікований як `@nan0web/sync-cli`).

Це зламає зворотну сумісність (breaking change), тому це ідеальний кандидат для версії 2.0.

---

## 3. Data-Driven Документація (Markdown + Frontmatter)

Замість того, щоб жорстко верстати компоненти документації всередині `dist/web`, проект перейде на повноцінну Markdown-Driven модель.

- Весь контент писатиметься виключно у Markdown-файлах (як `README.md` або `docs/*.md`) із YAML Frontmatter для мета-даних (заголовок, іконки, адаптери).
- Платформа інтеграції UI (`@nan0web/ui-lit` або `ui-cli` двигун) самостійно парситиме ці файли і генеруватиме HTML-документацію під капотом (використовуючи патерн Data-Driven Model).
- Це дозволить зберегти принцип **"Свідомості" (Колективного інтелекту)**: `sync` лишається ядром і має текстовий маніфест (документацію), а відображається він там і так, як вирішить UI-шар екосистеми $\text{nan}\cdot\text{web}$.

---

## Next — Release Infrastructure

- [ ] **AGRP Release Protocol**: Створити `releases/` структуру, `task.spec.js` (наявні `release:spec`/`release:verify` зберегти)

> **Health check 2026-03-02**: 2/2 pass, 0 fail ✅

---

_Оновлено: 2026-03-02_
