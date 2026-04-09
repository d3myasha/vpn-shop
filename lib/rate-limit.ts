import Redis from "ioredis";

type InMemoryBucket = {
  timestamps: number[];
  lastCleanup: number;
};

const inMemoryBuckets = new Map<string, InMemoryBucket>();
const MAX_IN_MEMORY_BUCKETS = 10_000;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 минут

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
  
  // Периодическая очистка старых бакетов
  if (inMemoryBuckets.size > MAX_IN_MEMORY_BUCKETS || 
      (inMemoryBuckets.size > 0 && Math.random() < 0.01)) { // 1% шанс очистки
    cleanupStaleBuckets(now, windowMs);
  }
  
  const bucket = inMemoryBuckets.get(params.key) ?? { timestamps: [], lastCleanup: now };

  bucket.timestamps = bucket.timestamps.filter((ts) => ts > from);
  if (bucket.timestamps.length >= params.limit) {
    inMemoryBuckets.set(params.key, bucket);
    return false;
  }

  bucket.timestamps.push(now);
  inMemoryBuckets.set(params.key, bucket);
  return true;
}

function cleanupStaleBuckets(now: number, windowMs: number) {
  const cutoff = now - windowMs;
  for (const [key, bucket] of inMemoryBuckets.entries()) {
    if (bucket.timestamps.length === 0 || bucket.timestamps[bucket.timestamps.length - 1] < cutoff) {
      inMemoryBuckets.delete(key);
    }
  }
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

    // Атомарная операция через multi/exec для предотвращения race condition
    const multi = client.multi();
    multi.incr(params.key);
    multi.expire(params.key, params.windowSec);
    
    const results = await multi.exec();
    if (!results) {
      return null;
    }
    
    const count = results[0][1] as number;
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
