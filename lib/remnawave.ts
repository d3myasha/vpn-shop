import { getEnv } from "@/lib/env";

type RemnawaveUser = {
  uuid: string;
  username: string;
  email: string;
  expireAt: string;
  hwidDeviceLimit: number | null;
  subscriptionUrl?: string;
};

export type RemnawaveSquadOption = {
  uuid: string;
  name: string;
};

export type RemnawaveDevice = {
  hwid: string;
  userUuid: string;
  platform: string | null;
  osVersion: string | null;
  deviceModel: string | null;
  userAgent: string | null;
  createdAt: string;
  updatedAt: string;
};

type RemnawaveSubscriptionResponse = {
  response?: {
    user?: {
      subscriptionUrl?: string;
    };
    subscriptionUrl?: string;
  };
};

type RemnawaveUsersByEmailResponse = {
  response?: RemnawaveUser[];
};

type RemnawaveUserResponse = {
  response?: RemnawaveUser;
};

type RemnawaveUserHwidDevicesResponse = {
  response?: {
    total?: number;
    devices?: RemnawaveDevice[];
  };
};

type RemnawaveInternalSquadsResponse = {
  response?: {
    internalSquads?: Array<{ uuid: string; name: string }>;
  } | Array<{ uuid: string; name: string }>;
};

type RemnawaveExternalSquadsResponse = {
  response?: {
    externalSquads?: Array<{ uuid: string; name: string }>;
  } | Array<{ uuid: string; name: string }>;
};

function buildAuthHeader() {
  const env = getEnv();
  const headerName = env.REMNAWAVE_API_HEADER_NAME;
  const value = env.REMNAWAVE_API_HEADER_PREFIX
    ? `${env.REMNAWAVE_API_HEADER_PREFIX} ${env.REMNAWAVE_API_KEY}`
    : env.REMNAWAVE_API_KEY;

  return { [headerName]: value };
}

const RW_API_ROUTES = {
  internalSquads: "/api/internal-squads",
  externalSquads: "/api/external-squads",
  usersByEmail: (email: string) => `/api/users/by-email/${encodeURIComponent(email)}`,
  users: "/api/users",
  userHwidDevices: (userUuid: string) => `/api/hwid/devices/${encodeURIComponent(userUuid)}`,
  deleteUserHwidDevice: "/api/hwid/devices/delete",
  subscriptionByUuid: (uuid: string) => `/api/subscriptions/by-uuid/${encodeURIComponent(uuid)}`,
} as const;

function mapSquadOptions(input: Array<{ uuid?: string; name?: string }> | undefined): RemnawaveSquadOption[] {
  return (input ?? [])
    .filter((item): item is { uuid: string; name: string } => Boolean(item?.uuid && item?.name))
    .map((item) => ({ uuid: item.uuid, name: item.name }));
}

function extractInternalSquads(payload: RemnawaveInternalSquadsResponse) {
  if (Array.isArray(payload.response)) {
    return payload.response;
  }
  return payload.response?.internalSquads;
}

function extractExternalSquads(payload: RemnawaveExternalSquadsResponse) {
  if (Array.isArray(payload.response)) {
    return payload.response;
  }
  return payload.response?.externalSquads;
}

export async function listRemnawaveSquads() {
  const [internalData, externalData] = await Promise.all([
    remnawaveRequest<RemnawaveInternalSquadsResponse>(RW_API_ROUTES.internalSquads, { method: "GET" }),
    remnawaveRequest<RemnawaveExternalSquadsResponse>(RW_API_ROUTES.externalSquads, { method: "GET" })
  ]);

  return {
    internalSquads: mapSquadOptions(extractInternalSquads(internalData)),
    externalSquads: mapSquadOptions(extractExternalSquads(externalData))
  };
}

async function remnawaveRequest<T>(path: string, init: RequestInit): Promise<T> {
  const env = getEnv();
  const apiBase = env.REMNAWAVE_API_URL.replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const finalPath =
    apiBase.endsWith("/api") && normalizedPath.startsWith("/api/")
      ? normalizedPath.replace(/^\/api/, "")
      : normalizedPath;

  const response = await fetch(`${apiBase}${finalPath}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...buildAuthHeader(),
      ...(init.headers ?? {})
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Remnawave API error ${response.status}: ${errorText}`);
  }

  return (await response.json()) as T;
}

function sanitizeUsername(seed: string) {
  const normalized = seed
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  const base = normalized.length >= 3 ? normalized : "vpn-user";
  return base.slice(0, 28);
}

function buildUsername(email: string, internalSubscriptionId: string) {
  const [local] = email.split("@");
  const base = sanitizeUsername(local || "vpn-user");
  const suffix = internalSubscriptionId.replace(/[^a-z0-9]/gi, "").slice(-7).toLowerCase();
  return `${base}-${suffix}`.slice(0, 36);
}

async function getUserByEmail(email: string) {
  const result = await remnawaveRequest<RemnawaveUsersByEmailResponse>(RW_API_ROUTES.usersByEmail(email), {
    method: "GET"
  });

  return result.response?.[0] ?? null;
}

export async function resolveRemnawaveUserUuidByEmail(email: string) {
  const user = await getUserByEmail(email);
  return user?.uuid ?? null;
}

export async function getUserHwidDevices(userUuid: string) {
  const result = await remnawaveRequest<RemnawaveUserHwidDevicesResponse>(RW_API_ROUTES.userHwidDevices(userUuid), {
    method: "GET"
  });

  return result.response?.devices ?? [];
}

export async function deleteUserHwidDevice(userUuid: string, hwid: string) {
  await remnawaveRequest<RemnawaveUserHwidDevicesResponse>(RW_API_ROUTES.deleteUserHwidDevice, {
    method: "POST",
    body: JSON.stringify({ userUuid, hwid })
  });
}

async function createUser(params: {
  email: string;
  username: string;
  expireAt: string;
  deviceLimit: number;
  description: string;
  internalSquadUuid?: string | null;
  externalSquadUuid?: string | null;
}) {
  const body = {
    username: params.username,
    status: "ACTIVE",
    trafficLimitBytes: 0,
    trafficLimitStrategy: "NO_RESET",
    expireAt: params.expireAt,
    description: params.description,
    email: params.email,
    hwidDeviceLimit: params.deviceLimit,
    ...(params.internalSquadUuid ? { activeInternalSquads: [params.internalSquadUuid] } : {}),
    ...(params.externalSquadUuid ? { externalSquadUuid: params.externalSquadUuid } : {})
  };

  const result = await remnawaveRequest<RemnawaveUserResponse>(RW_API_ROUTES.users, {
    method: "POST",
    body: JSON.stringify(body)
  });

  if (!result.response?.uuid) {
    throw new Error("Remnawave create user response has no uuid");
  }

  return result.response;
}

async function updateUser(params: {
  uuid: string;
  expireAt: string;
  deviceLimit: number;
  internalSquadUuid?: string | null;
  externalSquadUuid?: string | null;
}) {
  const body = {
    uuid: params.uuid,
    status: "ACTIVE",
    trafficLimitBytes: 0,
    trafficLimitStrategy: "NO_RESET",
    expireAt: params.expireAt,
    hwidDeviceLimit: params.deviceLimit,
    ...(params.internalSquadUuid ? { activeInternalSquads: [params.internalSquadUuid] } : {}),
    ...(params.externalSquadUuid ? { externalSquadUuid: params.externalSquadUuid } : {})
  };

  const result = await remnawaveRequest<RemnawaveUserResponse>(RW_API_ROUTES.users, {
    method: "PATCH",
    body: JSON.stringify(body)
  });

  if (!result.response?.uuid) {
    throw new Error("Remnawave update user response has no uuid");
  }

  return result.response;
}

async function getSubscriptionByUuid(userUuid: string) {
  const result = await remnawaveRequest<RemnawaveSubscriptionResponse>(RW_API_ROUTES.subscriptionByUuid(userUuid), {
    method: "GET"
  });

  return result.response?.subscriptionUrl ?? result.response?.user?.subscriptionUrl ?? null;
}

export async function syncRemnawaveSubscription(params: {
  email: string;
  expiresAt: Date;
  deviceLimit: number;
  internalSubscriptionId: string;
  remnawaveProfileId?: string | null;
  internalSquadUuid?: string | null;
  externalSquadUuid?: string | null;
}) {
  const description = `vpn-shop:${params.internalSubscriptionId}`;
  const expireAtIso = params.expiresAt.toISOString();

  let user: RemnawaveUser | null = null;
  if (params.remnawaveProfileId) {
    user = await updateUser({
      uuid: params.remnawaveProfileId,
      expireAt: expireAtIso,
      deviceLimit: params.deviceLimit,
      internalSquadUuid: params.internalSquadUuid,
      externalSquadUuid: params.externalSquadUuid
    });
  } else {
    user = await getUserByEmail(params.email);
  }

  if (!user) {
    user = await createUser({
      email: params.email,
      username: buildUsername(params.email, params.internalSubscriptionId),
      expireAt: expireAtIso,
      deviceLimit: params.deviceLimit,
      description,
      internalSquadUuid: params.internalSquadUuid,
      externalSquadUuid: params.externalSquadUuid
    });
  } else if (!params.remnawaveProfileId) {
    user = await updateUser({
      uuid: user.uuid,
      expireAt: expireAtIso,
      deviceLimit: params.deviceLimit,
      internalSquadUuid: params.internalSquadUuid,
      externalSquadUuid: params.externalSquadUuid
    });
  }

  const subscriptionUrl = (await getSubscriptionByUuid(user.uuid)) ?? user.subscriptionUrl ?? null;
  return {
    remnawaveUserUuid: user.uuid,
    subscriptionUrl
  };
}
