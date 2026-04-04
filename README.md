# VPN Shop

MVP магазин подписок VPN с оплатой через YooKassa, интеграцией Remnawave, промокодами и реферальной системой.

## Реализовано в этом каркасе

- Next.js 16 + TypeScript проект с App Router.
- Auth.js v5 (Credentials + JWT + роли в сессии).
- Prisma schema под роли, подписки, платежи, промокоды, рефералку.
- Ограничение: у пользователя может быть только одна подписка (смена плана или продление обновляет ее же).
- Seed тарифов под три линейки подписок и 4 периода.
- Главная страница с тарифной сеткой.
- Реальный checkout с созданием платежа в YooKassa:
  - `POST /api/checkout`
  - поддержка `promoCode`, `referralCode`
  - только для авторизованных пользователей
  - редирект на `confirmation_url`
- Webhook обработчик YooKassa:
  - `POST /api/webhooks/yookassa`
  - allowlist по IP (`YOOKASSA_WEBHOOK_ALLOWED_IPS`, в формате `ip`/`cidr` через запятую)
  - поддержка IPv4/IPv6 CIDR
  - при пустом allowlist используется официальный пул IP YooKassa
  - rate limit по IP (`YOOKASSA_WEBHOOK_RATE_LIMIT_RPM`)
  - верификация статуса через запрос в YooKassa API
  - идемпотентное проведение `payment.succeeded` и `payment.canceled`
  - активация/продление подписки по `plan_code` из metadata
  - начисление реферальных бонус-дней
- Интеграция Remnawave:
  - автосоздание/обновление пользователя после `payment.succeeded`
  - синхронизация `expireAt` и лимита устройств
  - сохранение `remnawaveProfileId` и subscription URL в БД
- Регистрация и вход:
  - `POST /api/register`
  - `POST /api/register/request-code` (отправка кода подтверждения email)
  - `GET /login`
  - `GET /register`
- Plugin storefront интеграция с Remnashop backend (через прямое чтение БД бота):
  - `POST /api/plugin/auth/telegram/callback`
  - `GET /api/plugin/me`
  - `GET /api/plugin/subscription`
  - `POST /api/plugin/checkout` (возвращает/делает redirect на web checkout URL из backend бота)
- Telegram login в `/login` (Telegram Widget + NextAuth provider `telegram`).
- `GET /account` (требуется вход, содержит статус подписок и историю платежей)
- `GET /admin` (только OWNER/ADMIN)
- В `GET /admin` добавлен редактор тарифов:
  - создание/редактирование/включение/отключение планов
  - поля: `code`, `title`, `description`, тип лимита (`DEVICES`/`TRAFFIC`), устройства, трафик, длительность, цена
  - привязка `internalSquadUuid`/`externalSquadUuid` с подгрузкой сквадов из Remnawave API
- `POST /api/admin/bootstrap-owner` (одноразовое назначение первого OWNER по токену)
- Тесты:
  - `npm test` (Vitest unit-тесты ключевых сценариев)
  - `npm run test:smoke` (Playwright smoke)
- Инфраструктура для VPS:
  - `Dockerfile`
  - `docker-compose.yml` (Postgres + Redis + App)
  - `caddy/docker-compose.yml` (отдельный reverse proxy)
  - `caddy/Caddyfile` (TLS + проксирование на Next.js)

## Быстрый старт локально

1. Скопируйте `.env.example` в `.env` и заполните секреты.
2. Установите зависимости:
   - `npm install`
3. Сгенерируйте Prisma Client:
   - `npm run prisma:generate`
4. Примените миграции:
   - `npm run prisma:migrate -- --name init`
5. Заполните тарифы:
   - `npm run prisma:seed`
6. Запуск:
   - `npm run dev`

### Подтверждение email при регистрации

- При новом email на `/login` сначала отправляется код подтверждения на почту.
- Создание пользователя выполняется только после ввода корректного кода.
- Для уже существующего email используется обычный вход по паролю.
- Разрешены только домены из allowlist (`ALLOWED_EMAIL_DOMAINS`).
- Для локальной админки можно добавить домены вида `d3mvpn.local`/`vpn.local` в `ALLOWED_EMAIL_DOMAINS`.

Необходимые переменные окружения для отправки писем (Resend):

- `RESEND_API_KEY`
- `RESEND_FROM`

Переменные окружения для plugin storefront (бот как backend, DB read-only):

- `REMNASHOP_DATABASE_URL`
- `REMNASHOP_DB_POOL_MAX`
- `REMNASHOP_DB_IDLE_MS`
- `REMNASHOP_DB_CONNECT_TIMEOUT_MS`
- `REMNASHOP_DB_SSL`
- `REMNASHOP_DB_SSL_REJECT_UNAUTHORIZED`

Переменные окружения для bot HTTP API (создание web checkout):

- `REMNASHOP_API_BASE_URL`
- `REMNASHOP_API_TOKEN`
- `REMNASHOP_API_TIMEOUT_MS`

Telegram login:

- `TELEGRAM_BOT_TOKEN`
- `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`
- `TELEGRAM_AUTH_MAX_AGE_SECONDS`
- `NEXTAUTH_URL` (должен совпадать с публичным доменом, например `https://d3mshop.site`)

Правила для Telegram-входа:

- `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` указывайте **без** `@` (например `d3mvpn_bot`).
- В BotFather должен быть настроен домен через `/setdomain` на ваш сайт.
- На `/login` Telegram-панель показывается первой, email-вход всегда доступен ниже как fallback.
- Если пользователь уже вошел по email, Telegram на `/login` работает в режиме привязки к текущему аккаунту (email сохраняется в БД сайта).
- Если Telegram-виджет не загрузился (ошибка/таймаут), UI покажет сообщение: `Telegram-вход временно недоступен. Используйте вход по email.`
- После runtime-фикса для смены username/token достаточно обновить `.env` и перезапустить только `app` (`docker compose up -d --force-recreate app`), пересборка фронта не требуется.

Примечание по `REMNAWAVE_API_URL`:
- указывайте базовый host (например, `https://panel.example.com`), без обязательного суффикса `/api`.
- клиент умеет работать и если вы случайно указали URL с `/api`.

## Запуск через Docker

1. Создайте `.env` на основе `.env.example`.
2. Поднимите приложение (создаст сеть `vpn_shop_net`):
   - `docker compose up -d --build`
3. Поднимите Caddy отдельно:
   - `docker compose -f caddy/docker-compose.yml up -d`
4. Примените миграции и seed внутри контейнера приложения:
   - `docker compose exec app npm run prisma:deploy`
   - `docker compose exec app npm run prisma:seed`

### Режим Addon (бот и сайт в разных compose)

- Бот запускается своим стеком (в репозитории `remnashop`).
- Сайт запускается этим репозиторием как отдельный стек.
- Сайт работает как внешняя оболочка бота через `REMNASHOP_DATABASE_URL` (read-only доступ к БД бота).
- Оплата на сайте выполняется в браузере, но checkout создается backend бота через `POST /api/storefront/checkout`.

Пример `REMNASHOP_DATABASE_URL`:
- если БД бота доступна по IP/домену:  
  `postgresql://shop_ro:***@<bot-db-host>:5432/remnashop`
- если оба стека в одной docker-сети:  
  `postgresql://shop_ro:***@<postgres-service-name-in-bot-stack>:5432/remnashop`

### Простой запуск через GHCR на VPS с ботом

Ниже самый простой путь, если бот уже работает на сервере, а сайт поднимаем как отдельный стек из `ghcr.io`.

1. Подготовьте папку и заберите репозиторий:
   - `mkdir -p /opt/vpn-shop && cd /opt/vpn-shop`
   - `git clone https://github.com/d3myasha/vpn-shop.git .`
2. Создайте `.env`:
   - `cp .env.example .env`
   - заполните минимум:
   - `DATABASE_URL`
   - `AUTH_SECRET`
   - `NEXTAUTH_SECRET`
   - `NEXTAUTH_URL` (например `https://d3mshop.site`)
   - `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` (без `@`)
   - `TELEGRAM_BOT_TOKEN`
   - `REMNASHOP_DATABASE_URL` (read-only доступ к БД бота)
   - `REMNASHOP_API_BASE_URL`
   - `REMNASHOP_API_TOKEN`
   - `RESEND_API_KEY`
   - `RESEND_FROM`
3. Создайте override для запуска `app` из GHCR и проброса порта для внешнего Caddy:

```yaml
# /opt/vpn-shop/docker-compose.override.yml
services:
  app:
    image: ghcr.io/d3myasha/vpn-shop:latest
    build: null
    ports:
      - "3001:3000"
```

4. Войдите в GHCR (если репозиторий приватный):
   - `docker login ghcr.io -u d3myasha`
5. Поднимите стек:
   - `docker compose pull`
   - `docker compose up -d`
6. Примените миграции и seed:
   - `docker compose exec app npm run prisma:deploy`
   - `docker compose exec app npm run prisma:seed`
7. Проверьте:
   - `docker compose ps`
   - `curl -I http://127.0.0.1:3001/api/health`
   - `curl -I https://<your-shop-domain>`

Обновление сайта до новой версии:
- `cd /opt/vpn-shop`
- `git fetch --all && git reset --hard origin/main`
- `docker compose pull app`
- `docker compose up -d --force-recreate app`
- `docker compose logs --tail=120 app`

Если используете отдельный Caddy в другом compose:
- проксируйте `https://<your-shop-domain>` на `http://172.17.0.1:3001` или на IP хоста:3001,
- после правки Caddy перезапустите только Caddy-контейнер.

Частые проблемы:
- `Username invalid` в Telegram: неверный `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` (нужен без `@`) или не настроен `/setdomain` в BotFather.
- `Тарифы временно недоступны`: неверный `REMNASHOP_DATABASE_URL` или нет read-only прав.
- Ошибка checkout: не настроены `REMNASHOP_API_BASE_URL`/`REMNASHOP_API_TOKEN` или bot endpoint `/api/storefront/checkout`.
- 502 от Caddy: `app` не проброшен на `3001` или Caddy смотрит не на тот upstream.

### Чистая установка на VPS (бот уже запущен)

Ниже минимальный рабочий сценарий для отдельного стека сайта поверх бота.

1. На сервере создайте папку сайта:
   - `mkdir -p /opt/vpn-shop && cd /opt/vpn-shop`
2. Создайте общую сеть между стеками:
   - `docker network create remna_shared_net || true`
3. Подключите Postgres контейнер бота к этой сети:
   - `docker network connect remna_shared_net remnashop-db || true`
4. Убедитесь, что сайт и БД бота в одной сети:
   - `docker inspect remnashop-db --format '{{json .NetworkSettings.Networks}}'`
   - `docker inspect vpn-shop-app-1 --format '{{json .NetworkSettings.Networks}}'`
5. Создайте read-only пользователя в БД бота (важно: без `-it`, иначе heredoc может падать с `the input device is not a TTY`):

```bash
docker exec remnashop-db sh -lc 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '\''shop_ro'\'') THEN
    CREATE ROLE shop_ro LOGIN PASSWORD '\''CHANGE_ME_STRONG_PASSWORD'\'';
  ELSE
    ALTER ROLE shop_ro WITH LOGIN PASSWORD '\''CHANGE_ME_STRONG_PASSWORD'\'';
  END IF;
END
\$\$;

GRANT CONNECT ON DATABASE "'"$POSTGRES_DB"'" TO shop_ro;
GRANT USAGE ON SCHEMA public TO shop_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO shop_ro;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO shop_ro;
SQL'
```

6. Проверьте доступ `shop_ro`:

```bash
docker run --rm --network remna_shared_net -e PGPASSWORD='CHANGE_ME_STRONG_PASSWORD' postgres:18 \
  psql -h remnashop-db -U shop_ro -d remnashop -c 'select now();'
```

7. В `.env` сайта укажите:
   - `REMNASHOP_DATABASE_URL=postgresql://shop_ro:CHANGE_ME_STRONG_PASSWORD@remnashop-db:5432/remnashop`
8. Поднимите сайт:
   - `docker login ghcr.io -u d3myasha`
   - `docker compose pull`
   - `docker compose up -d`
   - `docker compose exec app npm run prisma:deploy`
   - `docker compose exec app npm run prisma:seed`
9. Проверьте:
   - `curl -I https://<your-shop-domain>`
   - `curl https://<your-shop-domain>/api/health`

Если в UI видно `Тарифы временно недоступны: нет соединения с backend бота`, почти всегда проблема в:
- неверном `REMNASHOP_DATABASE_URL`,
- отсутствии прав `SELECT` у `shop_ro`,
- отсутствии общей docker-сети между app сайта и Postgres бота.

## Что нужно доделать следующим шагом

- Запустить `npm run test:smoke` на VPS/локальной машине с доступом к порту 3000 и браузерными бинарями.

## Bootstrap первого OWNER

1. Зарегистрируйте пользователя через `/register`.
2. Укажите в `.env` переменную `OWNER_BOOTSTRAP_TOKEN`.
3. Выполните запрос:

```bash
curl -X POST "http://localhost:3000/api/admin/bootstrap-owner" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "you@example.com",
    "token": "ваш_OWNER_BOOTSTRAP_TOKEN"
  }'
```

После этого вы сможете менять роли пользователей через `/admin` (под аккаунтом OWNER).

## Caddy reverse proxy

1. Заполните в `.env`:
   - `APP_DOMAIN` (домен, который смотрит на VPS)
   - `ACME_EMAIL` (email для Let's Encrypt)
2. Убедитесь, что порты `80` и `443` открыты на сервере.
3. Поднимите приложение:
   - `docker compose up -d --build`
4. Поднимите Caddy:
   - `docker compose -f caddy/docker-compose.yml up -d`

Caddy автоматически получит и продлит TLS-сертификат и будет проксировать трафик на `app:3000`.

Важно: Caddy вынесен в отдельный compose, поэтому перезапуск/обновление приложения не перезапускает Caddy и не дергает ACME без необходимости.

## Защита webhook YooKassa

1. Задайте в `.env` список доверенных IP/CIDR:
   - `YOOKASSA_WEBHOOK_ALLOWED_IPS="1.2.3.4,5.6.7.0/24"`
2. Задайте лимит запросов:
   - `YOOKASSA_WEBHOOK_RATE_LIMIT_RPM="60"`
3. Для distributed rate-limit укажите Redis:
   - `REDIS_URL="redis://redis:6379"`
4. Если нужно временно отключить проверку trusted IP:
   - `YOOKASSA_WEBHOOK_IP_ALLOWLIST_ENABLED="false"`

По актуальной документации YooKassa, базовая аутентификация webhook строится на:
1. проверке источника (IP allowlist),
2. сверке статуса объекта через API.

Явная подпись webhook в текущем baseline-сценарии не используется.

## Smoke и health-check

- Health endpoint: `GET /api/health`
- Smoke тесты:
  - `npm run test:smoke`
  - используют Playwright + `baseURL`/`webServer` в `playwright.config.ts`
