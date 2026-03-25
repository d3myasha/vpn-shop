# VPN Shop

MVP магазин подписок VPN с оплатой через YooKassa, интеграцией Remnawave, промокодами и реферальной системой.

## Реализовано в этом каркасе

- Next.js 16 + TypeScript проект с App Router.
- Auth.js v5 (Credentials + JWT + роли в сессии).
- Prisma schema под роли, подписки, платежи, промокоды, рефералку.
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
  - `GET /login`
  - `GET /register`
  - `GET /account` (требуется вход, содержит статус подписок и историю платежей)
  - `GET /admin` (только OWNER/ADMIN)
  - `POST /api/admin/bootstrap-owner` (одноразовое назначение первого OWNER по токену)
- Тесты:
  - `npm test` (Vitest unit-тесты ключевых сценариев)
  - `npm run test:smoke` (Playwright smoke)
- Инфраструктура для VPS:
  - `Dockerfile`
  - `docker-compose.yml` (Postgres + Redis + App + Caddy reverse proxy)
  - `Caddyfile` (TLS + проксирование на Next.js)

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

Примечание по `REMNAWAVE_API_URL`:
- указывайте базовый host (например, `https://panel.example.com`), без обязательного суффикса `/api`.
- клиент умеет работать и если вы случайно указали URL с `/api`.

## Запуск через Docker

1. Создайте `.env` на основе `.env.example`.
2. Запустите:
   - `docker compose up -d --build`
3. Примените миграции и seed внутри контейнера приложения:
   - `docker compose exec app npm run prisma:deploy`
   - `docker compose exec app npm run prisma:seed`

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
3. Поднимите стек `docker compose up -d --build`.

Caddy автоматически получит и продлит TLS-сертификат и будет проксировать трафик на `app:3000`.

## Защита webhook YooKassa

1. Задайте в `.env` список доверенных IP/CIDR:
   - `YOOKASSA_WEBHOOK_ALLOWED_IPS="1.2.3.4,5.6.7.0/24"`
2. Задайте лимит запросов:
   - `YOOKASSA_WEBHOOK_RATE_LIMIT_RPM="60"`
3. Для distributed rate-limit укажите Redis:
   - `REDIS_URL="redis://redis:6379"`

По актуальной документации YooKassa, базовая аутентификация webhook строится на:
1. проверке источника (IP allowlist),
2. сверке статуса объекта через API.

Явная подпись webhook в текущем baseline-сценарии не используется.

## Smoke и health-check

- Health endpoint: `GET /api/health`
- Smoke тесты:
  - `npm run test:smoke`
  - используют Playwright + `baseURL`/`webServer` в `playwright.config.ts`
