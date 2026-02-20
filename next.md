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
