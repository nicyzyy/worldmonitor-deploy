import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 10000;

// Proxy /api/* requests to worldmonitor.app, overriding Origin header
app.use('/api', createProxyMiddleware({
  target: 'https://worldmonitor.app',
  changeOrigin: true,
  headers: {
    'Origin': 'https://worldmonitor.app',
    'Referer': 'https://worldmonitor.app/',
  },
  pathRewrite: { '^/api': '/api' },
  onProxyRes(proxyRes) {
    // Allow our domain
    proxyRes.headers['access-control-allow-origin'] = '*';
  },
}));

// Serve static files
app.use(express.static(join(__dirname, 'dist'), {
  maxAge: '1h',
  setHeaders(res, path) {
    if (path.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  }
}));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`World Monitor running on port ${PORT}`);
});
