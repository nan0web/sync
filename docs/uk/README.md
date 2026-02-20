> 🌍 **[English Documentation](../../README.md)**

# @nan0web/sync

Високопродуктивний рушій синхронізації сайтів з віддаленими маніфестами та атомарним блокуванням.

<!-- %PACKAGE_STATUS% -->

## Опис

Пакет `@nan0web/sync` забезпечує фундамент для диференціального розгортання,
розраховуючи різницю між локальними та віддаленими файлами за допомогою MD5-хешування, атомарного блокування
та віддалених маніфестів для зменшення навантаження під час безперервних розгортань (CD).

Ключові можливості:

- **Диференціальна синхронізація** — завантажуються лише змінені файли, а видалені — видаляються.
- **Віддалений маніфест** — зберігає стан директорії на сервері, щоб уникнути повного сканування FTP.
- **Атомарне блокування** — запобігає паралельним розгортанням.
- **Git валідація** — контролює порядок розгортань (перевірка історії).

## Інсталяція

Як встановити за допомогою npm?

```bash
npm install -g @nan0web/sync
```

Як встановити за допомогою pnpm?

```bash
pnpm add -g @nan0web/sync
```

## Використання CLI

Команда `nan0sync` є основним способом взаємодії з рушієм.

Як використовувати nan0sync через CLI?

```bash
# Перевірити статус без зміни віддаленого сервера (dry-run mode)
nan0sync status --env production

# Запустити живу синхронізацію
nan0sync push --env production

# Примусово зняти блокування, якщо воно зависло
nan0sync push --force
```

## Конфігурація (SyncConfig)

Sync підтримує ієрархічне завантаження конфігурацій (`sync.config.js`). Воно зчитує default, env та local конфігурації.

Як створити sync.config.js?

```javascript
export default {
  adapter: 'ftp',
  source: 'dist/web',
  env: 'stage',
  host: 'nan0web.yaro.page',
  deleteRemoved: true,
  remoteManifest: true,
  lock: true,
  lockTTL: 600,
  gitCheck: true,
}
```

## API

### SyncEngine

Рушій виконує стейт-машину синхронізації через функцію-генератор `run()`.

Як використовувати SyncEngine програмно?

```js
import { SyncEngine, SyncConfig } from '@nan0web/sync'
const config = new SyncConfig({
  adapter: 'ftp',
  source: 'dist/web',
  host: 'example.com',
  user: 'user',
  password: 'pwd',
  dryRun: true,
})
const engine = new SyncEngine(config)
engine.adapter.connect = async () => {} // mock to prevent test from hanging

try {
  for await (const state of engine.run()) {
    console.info(state.phase)
  }
} catch (e) {
  // Expected to fail on 'connect' since host is a mock
}
```

## Внесок

Як зробити внесок? - [читайте тут]($pkgURL/blob/main/CONTRIBUTING.md)

## Ліцензія

Як ліцензується пакет? - [ISC LICENSE]($pkgURL/blob/main/LICENSE) файл.
