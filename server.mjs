import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 10000;

// In-memory cache for RSS feeds (5 min TTL)
const rssCache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

// Self-hosted RSS proxy - fetches feeds directly from source
app.get('/api/rss-proxy', async (req, res) => {
  const feedUrl = req.query.url;
  if (!feedUrl) return res.status(400).json({ error: 'Missing url parameter' });

  // Validate URL
  let parsed;
  try {
    parsed = new URL(feedUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Invalid protocol');
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  // CORS headers
  res.set({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });

  // Check cache
  const cached = rssCache.get(feedUrl);
  if (cached && Date.now() - cached.time < CACHE_TTL) {
    res.set('Content-Type', cached.contentType || 'application/xml');
    res.set('X-Cache', 'HIT');
    return res.send(cached.body);
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(feedUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'WorldMonitor-RSS/1.0 (compatible; news aggregator)',
        'Accept': 'application/rss+xml, application/xml, text/xml, application/atom+xml, */*',
      },
      redirect: 'follow',
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return res.status(502).json({ error: `Upstream returned ${response.status}` });
    }

    const body = await response.text();
    const contentType = response.headers.get('content-type') || 'application/xml';

    // Cache it
    rssCache.set(feedUrl, { body, contentType, time: Date.now() });

    // Evict old entries
    if (rssCache.size > 500) {
      const now = Date.now();
      for (const [key, val] of rssCache) {
        if (now - val.time > CACHE_TTL) rssCache.delete(key);
      }
    }

    res.set('Content-Type', contentType);
    res.set('X-Cache', 'MISS');
    res.send(body);
  } catch (err) {
    console.error(`[RSS Proxy] Failed to fetch ${feedUrl}:`, err.message);
    res.status(502).json({ error: 'Failed to fetch feed', detail: err.message });
  }
});

// Handle other API routes - return 404 gracefully
app.all('/api/*', (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(204).end();
  res.status(404).json({ error: 'API endpoint not available in self-hosted mode' });
});

// Serve static files
app.use(express.static(join(__dirname, 'dist'), {
  maxAge: '1h',
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  }
}));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`World Monitor (self-hosted) running on port ${PORT}`);
});
