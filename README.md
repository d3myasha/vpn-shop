# d3MVpn Shop (MVP)

MVP fullstack-магазин подписок VPN с интеграциями:
- Backend: Node.js + Express + TypeScript + Prisma + PostgreSQL
- Frontend: Next.js 14 + React + TypeScript + Tailwind
- Платежи: YooKassa (есть mock-режим, если ключи не заполнены)
- VPN-панель: Remnawave (на текущем этапе можно не подключать)
- Reverse proxy + HTTPS: Caddy

## Структура

- `backend/` API, бизнес-логика и Prisma
- `frontend-new/` клиентское приложение (основной фронтенд)
- `frontend/` legacy-фронтенд на Vite (оставлен как референс)
- `docker-compose.yml` запуск PostgreSQL + Redis + backend + frontend (из `frontend-new/`)
- `caddy/docker-compose.yml` отдельный запуск Caddy
- `caddy/Caddyfile` домен и HTTPS

## Быстрый старт

1. Скопировать переменные:
```bash
cp .env.example .env
```

2. Заполнить `.env`:
- `DOMAIN=ваш_домен`
- `APP_URL=https://ваш_домен`
- `CORS_ORIGIN=https://ваш_домен`
- `ADMIN_EMAIL/ADMIN_PASSWORD` для входа в админку

3. Проверить DNS:
- `A` запись домена должна указывать на IP сервера.
- Порты `80` и `443` должны быть открыты.

4. Создать внешнюю сеть (один раз):
```bash
docker network create vpn-shop-edge
```

5. Запустить приложение:
```bash
docker compose up --build -d
```

6. Запустить Caddy отдельно:
```bash
docker compose -f caddy/docker-compose.yml up -d
```

7. Инициализация БД выполняется автоматически при старте backend:
- `prisma generate`
- `prisma db push`
- `prisma seed`

8. Открыть:
- Сайт: `https://ваш_домен`
- Healthcheck API: `https://ваш_домен/health`

Примечание: Caddy проксирует `/api/*` в backend, а остальные запросы — во frontend.
Для текущей конфигурации frontend работает на порту `3000` внутри контейнера (Next.js).

## Реализовано в MVP

- Регистрация и логин с JWT (httpOnly cookies)
- Список публичных тарифов
- Создание pending-подписки и платежа
- Обработка `payment.succeeded` webhook от YooKassa
- Активация подписки и создание пользователя в Remnawave
- Выдача конфигурации подписки (если есть `shortUuid`)
- Защищённые admin-маршруты для управления планами

## API (основные маршруты)

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `GET /api/plans`
- `GET /api/plans/admin` (admin)
- `POST /api/plans/admin` (admin)
- `PATCH /api/plans/admin/:id` (admin)
- `DELETE /api/plans/admin/:id` (admin)
- `POST /api/subscriptions/create` (auth)
- `GET /api/subscriptions/me` (auth)
- `POST /api/webhooks/yookassa`
- `GET /api/admin/stats` (admin)
- `GET /api/admin/users` (admin)

## Что дальше

1. Подключить Remnawave API и выдачу реальных конфигов.
2. Добавить полноценную валидацию подписи webhook YooKassa.
3. Подключить очередь (BullMQ + Redis) для фонового создания подписок.
4. Добавить unit/integration/e2e тесты.
