# VPN Shop

Сайт-магазин VPN как отдельный сервис поверх backend бота Remnashop.

## Режимы работы checkout

Проект поддерживает два сценария оплаты, и набор обязательных переменных окружения зависит от выбранного сценария:

### 1. Plugin checkout / Telegram deep-link
Основной сценарий для связки с ботом Remnashop:
- бот уже запущен отдельно;
- сайт поднимается как внешний storefront;
- покупка уводит пользователя в Telegram deep-link;
- для этого режима обязательно настроить доступ к БД бота и Telegram auth;
- переменные YooKassa и Remnawave нужны только если используется внутренний checkout сайта.

### 2. Internal checkout / YooKassa + Remnawave
Альтернативный сценарий:
- сайт сам создаёт платеж в YooKassa;
- webhook подтверждает оплату;
- подписка синхронизируется с Remnawave;
- для этого режима обязательны `YOOKASSA_*` и `REMNAWAVE_*`.

## Главный сценарий: VPS + бот + GHCR (без клонирования репо)

Этот сценарий основной:
- бот уже запущен на сервере,
- сайт поднимается отдельно,
- используется только `docker-compose.yml` и `.env`,
- образ берётся из `ghcr.io/d3myasha/vpn-shop:latest`,
- отдельный bot API для checkout **не нужен** (используется Telegram deep-link flow).

Публичный GHCR не требует `docker login`.

### 1) Подготовка директории

```bash
mkdir -p /opt/vpn-shop
cd /opt/vpn-shop
```

### 2) Создай `docker-compose.yml`

```yaml
services:
  postgres:
    image: postgres:18
    restart: always
    environment:
      POSTGRES_DB: vpn_shop
      POSTGRES_USER: vpn_user
      POSTGRES_PASSWORD: vpn_pass
    volumes:
      - postgres_data:/var/lib/postgresql
    networks:
      - shop_net

  redis:
    image: redis:8-alpine
    restart: always
    networks:
      - shop_net

  app:
    image: ghcr.io/d3myasha/vpn-shop:latest
    pull_policy: always
    restart: always
    env_file:
      - .env
    depends_on:
      - postgres
      - redis
    ports:
      - "3001:3000"
    networks:
      - shop_net
      - remna_shared_net

volumes:
  postgres_data:

networks:
  shop_net:
  remna_shared_net:
    external: true
```

### 3) Создай `.env`

```env
# БД сайта (локальный postgres из этого же docker-compose)
DATABASE_URL=postgresql://vpn_user:vpn_pass@postgres:5432/vpn_shop?schema=public

# Redis сайта (локальный redis из этого же docker-compose)
REDIS_URL=redis://redis:6379

# Секреты сессии
# Достаточно AUTH_SECRET. NEXTAUTH_SECRET можно оставить таким же значением для совместимости.
AUTH_SECRET=replace-with-random-secret
NEXTAUTH_SECRET=replace-with-random-secret

# Авто-назначение ролей (опционально, через запятую)
# Поддерживается повышение до OWNER/ADMIN по email и/или telegram id.
# Примеры:
# OWNER_EMAILS=owner@d3mshop.site
# OWNER_TELEGRAM_IDS=123456789
# ADMIN_EMAILS=admin1@d3mshop.site,admin2@d3mshop.site
# ADMIN_TELEGRAM_IDS=111111111,222222222
OWNER_EMAILS=
OWNER_TELEGRAM_IDS=
ADMIN_EMAILS=
ADMIN_TELEGRAM_IDS=

# Публичный домен сайта (тот, куда заходят пользователи)
NEXTAUTH_URL=https://d3mshop.site

# Включатель checkout сайта
# true  = включен внутренний checkout сайта
# false = внутренний checkout отключен, используется plugin / deep-link flow
CHECKOUT_ENABLED=false

# Telegram-бот для входа/привязки (username без @)
TELEGRAM_BOT_TOKEN=replace
NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=d3mvpn_bot
TELEGRAM_AUTH_MAX_AGE_SECONDS=300

# Read-only доступ к БД бота Remnashop
# ВАЖНО: remnashop-db — это имя контейнера postgres бота в общей сети remna_shared_net
REMNASHOP_DATABASE_URL=postgresql://shop_ro:SHOP_RO_PASSWORD@remnashop-db:5432/remnashop
REMNASHOP_DB_POOL_MAX=5
REMNASHOP_DB_IDLE_MS=10000
REMNASHOP_DB_CONNECT_TIMEOUT_MS=5000
REMNASHOP_DB_SSL=false
REMNASHOP_DB_SSL_REJECT_UNAUTHORIZED=true

# Email-коды входа/регистрации (Resend)
RESEND_API_KEY=re_xxxxxxxxx
RESEND_FROM=VPN Shop <no-reply@d3mshop.site>

# Разрешенные домены email для регистрации/входа
ALLOWED_EMAIL_DOMAINS=gmail.com,inbox.ru,mail.ru,yandex.ru,icloud.com,d3mvpn.local,vpn.local,localhost

# Эти переменные обязательны только для internal checkout через YooKassa
YOOKASSA_SHOP_ID=replace
YOOKASSA_SECRET_KEY=replace
YOOKASSA_RETURN_URL=https://d3mshop.site/account

# Эти переменные обязательны только для internal checkout с синхронизацией в Remnawave
REMNAWAVE_API_URL=https://your-remnawave-host
REMNAWAVE_API_KEY=replace
REMNAWAVE_API_HEADER_NAME=Authorization
REMNAWAVE_API_HEADER_PREFIX=Bearer
```

### 4) Общая сеть с ботом

```bash
docker network create remna_shared_net || true
docker network connect remna_shared_net remnashop-db || true
```

### 5) Запуск

```bash
cd /opt/vpn-shop
docker compose pull
docker compose up -d
docker compose exec app npm run prisma:deploy
docker compose exec app npm run prisma:seed
```

### 6) Проверка

```bash
docker compose ps
curl -I http://127.0.0.1:3001/api/health
```

Если есть внешний Caddy/Nginx, проксируй домен на `127.0.0.1:3001`.

### 7) Обновление

```bash
cd /opt/vpn-shop
docker compose pull app
docker compose up -d --force-recreate app
docker compose exec app npm run prisma:deploy
docker compose logs --tail=120 app
```

### 8) Быстрый smoke-check после обновления

```bash
curl -I http://127.0.0.1:3001/api/health
curl -s https://d3mshop.site/login | grep -E "Быстрый вход через Telegram|Введите email и пароль"
```

### 9) Фикс JWT-секрета (один раз, чтобы не ловить `no matching decryption secret`)

```bash
cd /opt/vpn-shop
bash scripts/fix-jwt-secret.sh
docker compose up -d --force-recreate app
```

### 10) Сбросить только БД сайта (бот не трогается)

```bash
cd /opt/vpn-shop
bash scripts/reset-site-db.sh
```

### 11) One-time cleanup legacy `telegram.local` email

Если раньше использовались synthetic email вида `tg-...@telegram.local`, переведи их в Telegram-only профиль:

```bash
cd /opt/vpn-shop
bash scripts/cleanup-legacy-telegram-local-emails.sh
```

## Что важно знать

- `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` указывать **без `@`**.
- В BotFather должен быть настроен `/setdomain` на домен сайта.
- `REMNASHOP_DATABASE_URL` используется только для read-only чтения данных бота.
- Synthetic email больше не создается: Telegram-first пользователь может существовать без email, а email привязывается позже из `/account`.
- Покупка из кабинета идёт через Telegram deep-link (`start=plan_<public_code>`), если `CHECKOUT_ENABLED=false`.
- Если `CHECKOUT_ENABLED=true`, приложение использует internal checkout через YooKassa и Remnawave.
- Для стабильных сессий достаточно держать постоянным `AUTH_SECRET`; `NEXTAUTH_SECRET` можно оставить тем же значением для обратной совместимости.
- Можно автоматически выдавать роль `OWNER`/`ADMIN` через `.env` переменные `OWNER_*` и `ADMIN_*` (email и/или telegram id).

## Частые проблемы

- `Username invalid`:
  - неверный `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`,
  - не настроен `/setdomain` в BotFather.
- `Тарифы временно недоступны`:
  - неверный `REMNASHOP_DATABASE_URL`,
  - нет прав read-only у пользователя БД.
- `password authentication failed for user "shop_ro"`:
  - в команде подставлен плейсхолдер вместо реального пароля,
  - проверь доступ: `docker run --rm --network remna_shared_net -e PGPASSWORD='<REAL_PASS>' postgres:18 psql -h remnashop-db -U shop_ro -d remnashop -c 'select 1;'`
- Ошибка checkout:
  - не привязан Telegram в профиле сайта,
  - план не найден в backend бота.
- `502` от прокси:
  - приложение не слушает `3001`,
  - прокси смотрит не на тот upstream.
- `JWTSessionError: no matching decryption secret`:
  - поменялся секрет сессии,
  - пересоздай app и очисти cookies домена (или открой инкогнито).
