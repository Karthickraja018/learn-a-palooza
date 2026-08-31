const { Redis } = require('@upstash/redis');

// Vercel's Upstash Marketplace integration injects KV_REST_API_URL /
// KV_REST_API_TOKEN. A standalone Upstash integration may instead inject
// UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN. Support both so this
// works regardless of which one you connect.
const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

if (!url || !token) {
  console.warn(
    'No Redis connection found. Connect a Redis database to this project in the Vercel dashboard (Storage tab).'
  );
}

const kv = new Redis({ url, token });

module.exports = { kv };
