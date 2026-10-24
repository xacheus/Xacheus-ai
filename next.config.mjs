/**
 * VOICEPILOT AI — Next.js configuration.
 *
 * Security headers are applied here. Note: `frame-ancestors` is intentionally
 * permissive so the app can be embedded in preview/sandbox frames; there is no
 * `X-Frame-Options` header for the same reason. Everything else is locked down.
 */
const isDev = process.env.NODE_ENV !== 'production';

/** @type {string[]} */
const connectSrc = [
  "'self'",
  'https://*.googleapis.com',
  'https://*.firebaseio.com',
  'wss://*.firebaseio.com',
  'https://*.cloudfunctions.net',
  'https://identitytoolkit.googleapis.com',
  'https://securetoken.googleapis.com',
  'https://firestore.googleapis.com',
  'https://firebasestorage.googleapis.com',
  'https://storage.googleapis.com',
  'https://www.google.com',
  'https://www.gstatic.com',
];

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' https://www.google.com https://www.gstatic.com${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  'media-src \'self\' blob: data:',
  'worker-src \'self\' blob:',
  `connect-src ${connectSrc.join(' ')}`,
  'frame-src https://www.google.com https://recaptcha.google.com https://*.firebaseapp.com',
  'frame-ancestors *',
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    // Server Actions body limit is irrelevant here (API routes validate uploads),
    // but keep the graph small for faster cold starts.
    optimizePackageImports: ['lucide-react'],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=()' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
        ],
      },
      {
        source: '/api/(.*)',
        headers: [{ key: 'Cache-Control', value: 'no-store, max-age=0' }],
      },
    ];
  },
};

export default nextConfig;
