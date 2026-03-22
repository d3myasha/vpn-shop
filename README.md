# d3MVpn Shop (MVP)

MVP fullstack-магазин подписок VPN с интеграциями:
- Backend: Node.js + Express + TypeScript + Prisma + PostgreSQL
- Frontend: React + Vite + TypeScript
- Платежи: YooKassa (есть mock-режим, если ключи не заполнены)
- VPN-панель: Remnawave (подключается через API ключ)

## Структура

- `backend/` API, бизнес-логика и Prisma
- `frontend/` клиентское приложение
- `docker-compose.yml` локальный запуск PostgreSQL + Redis + backend + frontend

## Быстрый старт

1. Скопировать переменные:
```bash
cp .env.example .env
```

2. Запустить сервисы:
```bash
docker compose up --build
```

3. Инициализация БД выполняется автоматически при старте backend:
- `prisma generate`
- `prisma db push`
- `prisma seed`

4. Открыть:
- Frontend: `http://localhost:5173`
- Backend healthcheck: `http://localhost:3000/health`

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

1. Добавить полноценную валидацию подписи webhook YooKassa.
2. Подключить очередь (BullMQ + Redis) для фонового создания подписок в Remnawave.
3. Расширить frontend до отдельных страниц (`Dashboard`, `Payment`, `Admin`).
4. Добавить unit/integration/e2e тесты.
