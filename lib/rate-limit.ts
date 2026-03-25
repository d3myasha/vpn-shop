import Redis from "ioredis";

type InMemoryBucket = {
  timestamps: number[];
};

const inMemoryBuckets = new Map<string, InMemoryBucket>();

let redisClient: Redis | null = null;

function getRedisClient() {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    return null;
  }

  if (!redisClient) {
    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 2,
      lazyConnect: true
    });
  }

  return redisClient;
}

async function checkInMemory(params: { key: string; limit: number; windowSec: number }) {
  const now = Date.now();
  const windowMs = params.windowSec * 1000;
  const from = now - windowMs;
  const bucket = inMemoryBuckets.get(params.key) ?? { timestamps: [] };

  bucket.timestamps = bucket.timestamps.filter((ts) => ts > from);
  if (bucket.timestamps.length >= params.limit) {
    inMemoryBuckets.set(params.key, bucket);
    return false;
  }

  bucket.timestamps.push(now);
  inMemoryBuckets.set(params.key, bucket);
  return true;
}

async function checkRedis(params: { key: string; limit: number; windowSec: number }) {
  const client = getRedisClient();
  if (!client) {
    return null;
  }

  try {
    if (client.status !== "ready") {
      await client.connect();
    }

    const count = await client.incr(params.key);
    if (count === 1) {
      await client.expire(params.key, params.windowSec);
    }

    return count <= params.limit;
  } catch {
    return null;
  }
}

export async function checkRateLimit(params: { key: string; limitPerMinute: number }) {
  const limit = Math.max(1, params.limitPerMinute);
  const windowSec = 60;

  const redisResult = await checkRedis({
    key: params.key,
    limit,
    windowSec
  });

  if (redisResult !== null) {
    return redisResult;
  }

  return checkInMemory({
    key: params.key,
    limit,
    windowSec
  });
}
