#!/usr/bin/env bash
set -euo pipefail

# Patch remnashop container in-place (no git repo required).
# Adds storefront checkout API:
#   POST /api/v1/payments/create
#
# Usage:
#   chmod +x scripts/patch-remnashop-storefront.sh
#   STOREFRONT_TOKEN='your-long-token' ./scripts/patch-remnashop-storefront.sh
#
# Notes:
# - This patch is applied inside running containers and can be lost after bot image rebuild.
# - Re-run the script after bot upgrades/recreate.

MAIN_CONTAINER="${MAIN_CONTAINER:-remnashop}"
BOT_ENV_FILE="${BOT_ENV_FILE:-/opt/remnashop/.env}"
STOREFRONT_TOKEN="${STOREFRONT_TOKEN:-}"

echo "==> Patching remnashop storefront checkout API in container: ${MAIN_CONTAINER}"

if ! docker ps --format '{{.Names}}' | grep -qx "${MAIN_CONTAINER}"; then
  echo "ERROR: container '${MAIN_CONTAINER}' is not running."
  exit 1
fi

if [ -n "${STOREFRONT_TOKEN}" ]; then
  echo "==> Updating APP_STOREFRONT_API_TOKEN in ${BOT_ENV_FILE}"
  if [ -f "${BOT_ENV_FILE}" ]; then
    if grep -q '^APP_STOREFRONT_API_TOKEN=' "${BOT_ENV_FILE}"; then
      sed -i "s|^APP_STOREFRONT_API_TOKEN=.*|APP_STOREFRONT_API_TOKEN=${STOREFRONT_TOKEN}|" "${BOT_ENV_FILE}"
    else
      printf '\nAPP_STOREFRONT_API_TOKEN=%s\n' "${STOREFRONT_TOKEN}" >> "${BOT_ENV_FILE}"
    fi
  else
    echo "WARN: ${BOT_ENV_FILE} not found, token was not persisted to env file."
  fi
else
  echo "WARN: STOREFRONT_TOKEN is empty. Token in bot env was not changed."
fi

echo "==> Applying Python patch inside ${MAIN_CONTAINER}"
docker exec -i "${MAIN_CONTAINER}" python3 - <<'PYEOF'
from pathlib import Path

ROOT = Path("/opt/remnashop/src")

user_dao_protocol = ROOT / "application/common/dao/user.py"
user_dao_impl = ROOT / "infrastructure/database/dao/user.py"
app_config = ROOT / "core/config/app.py"
payments_endpoint = ROOT / "web/endpoints/payments.py"

for p in [user_dao_protocol, user_dao_impl, app_config, payments_endpoint]:
    if not p.exists():
        raise SystemExit(f"Required file not found: {p}")

# 1) UserDao protocol: add get_by_id
content = user_dao_protocol.read_text()
if "async def get_by_id(self, user_id: int)" not in content:
    needle = "    async def create(self, user: UserDto) -> UserDto: ...\n\n"
    insert = needle + "    async def get_by_id(self, user_id: int) -> Optional[UserDto]: ...\n\n"
    if needle not in content:
        raise SystemExit("Unexpected UserDao protocol format; cannot patch safely.")
    content = content.replace(needle, insert, 1)
    user_dao_protocol.write_text(content)

# 2) UserDaoImpl: add get_by_id implementation
content = user_dao_impl.read_text()
if "async def get_by_id(self, user_id: int)" not in content:
    marker = "    # @provide_cache(ttl=TTL_1H, key_builder=UserCacheKey)\n"
    block = (
        "    async def get_by_id(self, user_id: int) -> Optional[UserDto]:\n"
        "        stmt = select(User).where(User.id == user_id)\n"
        "        db_user = await self.session.scalar(stmt)\n\n"
        "        if db_user:\n"
        "            logger.debug(f\"User with id '{user_id}' found in database\")\n"
        "            return self._convert_to_dto(db_user)\n\n"
        "        logger.debug(f\"User with id '{user_id}' not found\")\n"
        "        return None\n\n"
    )
    if marker not in content:
        raise SystemExit("Unexpected UserDaoImpl format; cannot patch safely.")
    content = content.replace(marker, block + marker, 1)
    user_dao_impl.write_text(content)

# 3) AppConfig: add storefront_api_token
content = app_config.read_text()
if "storefront_api_token" not in content:
    needle = "    crypt_key: SecretStr\n"
    insert = "    crypt_key: SecretStr\n    storefront_api_token: SecretStr | None = None\n"
    if needle not in content:
        raise SystemExit("Unexpected AppConfig format; cannot patch safely.")
    content = content.replace(needle, insert, 1)
    app_config.write_text(content)

# 4) payments endpoint: replace with patched v0.7.4-compatible implementation
content = payments_endpoint.read_text()
if "async def create_storefront_payment(" not in content:
    patched = '''import secrets
from typing import Annotated

from dishka import FromDishka
from dishka.integrations.fastapi import inject
from fastapi import APIRouter, Header, HTTPException, Request, Response, status
from loguru import logger
from pydantic import BaseModel, ConfigDict, Field

from src.application.common import EventPublisher
from src.application.common.dao import PaymentGatewayDao, UserDao
from src.application.dto import PlanSnapshotDto
from src.application.events import ErrorEvent
from src.application.services import PricingService
from src.application.use_cases.gateways.commands.payment import CreatePayment, CreatePaymentDto
from src.application.use_cases.gateways.queries.providers import GetPaymentGatewayInstance
from src.application.use_cases.user.queries.plans import GetAvailablePlanByCode
from src.core.config import AppConfig
from src.core.constants import API_V1, PAYMENTS_WEBHOOK_PATH
from src.core.enums import PaymentGatewayType, PurchaseType
from src.infrastructure.taskiq.tasks.payments import handle_payment_transaction_task

router = APIRouter(prefix=API_V1 + PAYMENTS_WEBHOOK_PATH)


class CreateStorefrontPaymentRequest(BaseModel):
    bot_user_id: int = Field(alias="botUserId", gt=0)
    plan_code: str = Field(alias="planCode", min_length=1)
    duration_days: int | None = Field(alias="durationDays", default=None, gt=0)
    promo_code: str | None = Field(alias="promoCode", default=None)
    referral_code: str | None = Field(alias="referralCode", default=None)
    source: str = Field(default="vpn-shop-web")
    return_url: str = Field(alias="returnUrl", min_length=1)

    model_config = ConfigDict(populate_by_name=True)


class CreateStorefrontPaymentResponse(BaseModel):
    checkout_url: str = Field(alias="checkoutUrl")
    payment_id: str = Field(alias="paymentId")


def _read_bearer_token(authorization: str | None) -> str | None:
    if not authorization:
        return None

    parts = authorization.strip().split(" ", maxsplit=1)
    if len(parts) != 2:
        return None

    schema, token = parts
    if schema.lower() != "bearer":
        return None

    token = token.strip()
    return token or None


@router.post("/create")
@inject
async def create_storefront_payment(
    payload: CreateStorefrontPaymentRequest,
    config: FromDishka[AppConfig],
    user_dao: FromDishka[UserDao],
    payment_gateway_dao: FromDishka[PaymentGatewayDao],
    get_available_plan_by_code: FromDishka[GetAvailablePlanByCode],
    pricing_service: FromDishka[PricingService],
    create_payment: FromDishka[CreatePayment],
    authorization: Annotated[str | None, Header()] = None,
) -> CreateStorefrontPaymentResponse:
    configured_token = config.storefront_api_token.get_secret_value() if config.storefront_api_token else ""
    if not configured_token:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Storefront API is disabled")

    incoming_token = _read_bearer_token(authorization)
    if incoming_token is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")

    if not secrets.compare_digest(incoming_token, configured_token):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    user = await user_dao.get_by_id(payload.bot_user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bot user not found")

    plan_code = payload.plan_code.strip()
    plan = await get_available_plan_by_code(user, plan_code)
    if plan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found")

    gateway = await payment_gateway_dao.get_by_type(PaymentGatewayType.YOOKASSA)
    if gateway is None or not gateway.is_active:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="YooKassa gateway is disabled",
        )

    if gateway.settings is None or not gateway.settings.is_configured:  # type: ignore[union-attr]
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="YooKassa gateway is not configured",
        )

    available_durations = sorted(plan.durations, key=lambda duration: (duration.order_index, duration.days))
    if not available_durations:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Plan has no durations")

    selected_duration = available_durations[0]
    if payload.duration_days is not None:
        selected_duration = next(
            (duration for duration in available_durations if duration.days == payload.duration_days),
            None,
        )
        if selected_duration is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Requested duration is unavailable",
            )

    try:
        duration_price = selected_duration.get_price(gateway.currency)
    except StopIteration as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Plan does not support required currency",
        ) from error

    pricing = pricing_service.calculate(user, duration_price, gateway.currency)
    has_any_subscription = await user_dao.has_any_subscription(user.telegram_id, include_trial=False)
    purchase_type = PurchaseType.RENEW if has_any_subscription else PurchaseType.NEW

    payment_result = await create_payment(
        user,
        CreatePaymentDto(
            plan_snapshot=PlanSnapshotDto.from_plan(plan, selected_duration.days),
            pricing=pricing,
            purchase_type=purchase_type,
            gateway_type=gateway.type,
        ),
    )

    if not payment_result.url:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Unable to build checkout URL for selected plan",
        )

    return CreateStorefrontPaymentResponse(
        checkoutUrl=payment_result.url,
        paymentId=str(payment_result.id),
    )


@router.post("/{gateway_type}")
@inject
async def payments_webhook(
    gateway_type: str,
    request: Request,
    config: FromDishka[AppConfig],
    event_publisher: FromDishka[EventPublisher],
    get_payment_gateway_instance: FromDishka[GetPaymentGatewayInstance],
) -> Response:
    try:
        gateway_enum = PaymentGatewayType(gateway_type.upper())
    except ValueError:
        logger.exception(f"Invalid gateway type received: '{gateway_type}'")
        return Response(status_code=status.HTTP_404_NOT_FOUND)

    gateway = None
    try:
        gateway = await get_payment_gateway_instance.system(gateway_enum)

        if not gateway.data.is_active:
            logger.warning(f"Webhook received for disabled payment gateway '{gateway_enum}'")
            return Response(status_code=status.HTTP_404_NOT_FOUND)

        if not gateway.data.settings.is_configured:  # type: ignore[union-attr]
            logger.warning(f"Webhook received for unconfigured payment gateway '{gateway_enum}'")
            return Response(status_code=status.HTTP_404_NOT_FOUND)

        payment_id, payment_status = await gateway.handle_webhook(request)
        await handle_payment_transaction_task.kiq(payment_id, payment_status)  # type: ignore[call-overload]
        return Response(status_code=status.HTTP_200_OK)

    except Exception as e:
        logger.exception(f"Error processing webhook for '{gateway_type}': {e}")
        error_event = ErrorEvent(**config.build.data, exception=e)
        await event_publisher.publish(error_event)

    finally:
        if gateway is not None:
            return await gateway.build_webhook_response(request)
        return Response(status_code=status.HTTP_200_OK)
'''
    payments_endpoint.write_text(patched)

print("Patch applied successfully inside container.")
PYEOF

echo "==> Restarting remnashop containers (if present)"
for c in remnashop-taskiq-scheduler remnashop-taskiq-worker "${MAIN_CONTAINER}"; do
  if docker ps -a --format '{{.Names}}' | grep -qx "$c"; then
    docker restart "$c" >/dev/null
    echo "  restarted: $c"
  fi
done

echo "==> Done."
echo "Now set in /opt/vpn-shop/.env:"
echo "  REMNASHOP_API_BASE_URL=https://bot.demyasha.ru"
echo "  REMNASHOP_API_TOKEN=<same token as APP_STOREFRONT_API_TOKEN>"
echo "  REMNASHOP_API_TIMEOUT_MS=10000"
