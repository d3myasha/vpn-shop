import { getEnv } from "@/lib/env";

const YOOKASSA_API_BASE = "https://api.yookassa.ru/v3";

type YooAmount = {
  value: string;
  currency: "RUB";
};

type YooCreatePaymentRequest = {
  amount: YooAmount;
  capture: boolean;
  description: string;
  confirmation: {
    type: "redirect";
    return_url: string;
  };
  metadata?: Record<string, string>;
};

type YooPaymentStatus = "pending" | "waiting_for_capture" | "succeeded" | "canceled";

export type YooPayment = {
  id: string;
  status: YooPaymentStatus;
  amount: YooAmount;
  paid: boolean;
  confirmation?: {
    type: string;
    confirmation_url?: string;
  };
  metadata?: Record<string, string>;
};

function getBasicAuthHeader() {
  const env = getEnv();
  const encoded = Buffer.from(`${env.YOOKASSA_SHOP_ID}:${env.YOOKASSA_SECRET_KEY}`).toString("base64");
  return `Basic ${encoded}`;
}

async function yookassaRequest<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(`${YOOKASSA_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: getBasicAuthHeader(),
      "Content-Type": "application/json",
      ...(init.headers ?? {})
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`YooKassa API error ${response.status}: ${errorText}`);
  }

  return (await response.json()) as T;
}

export async function createYooKassaPayment(params: {
  amountRub: number;
  description: string;
  idempotenceKey: string;
  metadata?: Record<string, string>;
}) {
  const env = getEnv();
  const payload: YooCreatePaymentRequest = {
    amount: {
      value: params.amountRub.toFixed(2),
      currency: "RUB"
    },
    capture: true,
    description: params.description,
    confirmation: {
      type: "redirect",
      return_url: env.YOOKASSA_RETURN_URL
    },
    metadata: params.metadata
  };

  return yookassaRequest<YooPayment>("/payments", {
    method: "POST",
    headers: {
      "Idempotence-Key": params.idempotenceKey
    },
    body: JSON.stringify(payload)
  });
}

export async function getYooKassaPayment(paymentId: string) {
  return yookassaRequest<YooPayment>(`/payments/${paymentId}`, {
    method: "GET"
  });
}
