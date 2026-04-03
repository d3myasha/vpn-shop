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
  - `POST /api/plugin/checkout` (возвращает/делает redirect на Telegram deep-link)
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
- Разрешены только популярные почтовые домены (настраивается через `ALLOWED_EMAIL_DOMAINS`).

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

Telegram login:

- `TELEGRAM_BOT_TOKEN`
- `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`
- `TELEGRAM_AUTH_MAX_AGE_SECONDS`

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

Пример `REMNASHOP_DATABASE_URL`:
- если БД бота доступна по IP/домену:  
  `postgresql://shop_ro:***@<bot-db-host>:5432/remnashop`
- если оба стека в одной docker-сети:  
  `postgresql://shop_ro:***@<postgres-service-name-in-bot-stack>:5432/remnashop`

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
