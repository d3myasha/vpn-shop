# VPN Shop

Сайт-магазин VPN как отдельный сервис поверх backend бота Remnashop.

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
DATABASE_URL=postgresql://vpn_user:vpn_pass@postgres:5432/vpn_shop?schema=public
REDIS_URL=redis://redis:6379

AUTH_SECRET=replace-with-random-secret
NEXTAUTH_SECRET=replace-with-random-secret
NEXTAUTH_URL=https://d3mshop.site

CHECKOUT_ENABLED=true

TELEGRAM_BOT_TOKEN=replace
NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=d3mvpn_bot
TELEGRAM_AUTH_MAX_AGE_SECONDS=300

REMNASHOP_DATABASE_URL=postgresql://shop_ro:SHOP_RO_PASSWORD@remnashop-db:5432/remnashop
REMNASHOP_DB_POOL_MAX=5
REMNASHOP_DB_IDLE_MS=10000
REMNASHOP_DB_CONNECT_TIMEOUT_MS=5000
REMNASHOP_DB_SSL=false
REMNASHOP_DB_SSL_REJECT_UNAUTHORIZED=true

RESEND_API_KEY=re_xxxxxxxxx
RESEND_FROM=VPN Shop <no-reply@d3mshop.site>
ALLOWED_EMAIL_DOMAINS=gmail.com,inbox.ru,mail.ru,yandex.ru,icloud.com,d3mvpn.local,vpn.local,localhost
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

## Что важно знать

- `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` указывать **без `@`**.
- В BotFather должен быть настроен `/setdomain` на домен сайта.
- `REMNASHOP_DATABASE_URL` используется только для read-only чтения данных бота.
- Покупка из кабинета идёт через Telegram deep-link (`start=plan_<public_code>`).
- Для стабильных сессий держи одинаковые `AUTH_SECRET` и `NEXTAUTH_SECRET` (или оставь только `AUTH_SECRET` и не меняй его).

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
