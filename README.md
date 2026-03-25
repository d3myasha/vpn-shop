# VPN Shop

MVP магазин подписок VPN с оплатой через YooKassa, интеграцией Remnawave, промокодами и реферальной системой.

## Реализовано в этом каркасе

- Next.js 16 + TypeScript проект с App Router.
- Prisma schema под роли, подписки, платежи, промокоды, рефералку.
- Seed тарифов под три линейки подписок и 4 периода.
- Главная страница с тарифной сеткой.
- Реальный checkout с созданием платежа в YooKassa:
  - `POST /api/checkout`
  - поддержка `promoCode`, `referralCode`, `userId`
  - редирект на `confirmation_url`
- Webhook обработчик YooKassa:
  - `POST /api/webhooks/yookassa`
  - верификация статуса через запрос в YooKassa API
  - идемпотентное проведение `payment.succeeded` и `payment.canceled`
  - активация/продление подписки по `plan_code` из metadata
  - начисление реферальных бонус-дней
- Инфраструктура для VPS:
  - `Dockerfile`
  - `docker-compose.yml` (Postgres + Redis + App)

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

## Запуск через Docker

1. Создайте `.env` на основе `.env.example`.
2. Запустите:
   - `docker compose up -d --build`
3. Примените миграции и seed внутри контейнера приложения:
   - `docker compose exec app npm run prisma:deploy`
   - `docker compose exec app npm run prisma:seed`

## Что нужно доделать следующим шагом

- Интеграция с API Remnawave для автосоздания/обновления подписки.
- Авторизация и роли (`owner`, `admin`, `customer`).
- Замена временного demo-user fallback на auth-пользователя.
- Дополнительная защита webhook (валидные IP YooKassa + rate limit).
