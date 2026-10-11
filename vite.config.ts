import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// The browser itself enforces the privacy promise: nothing may be loaded from or sent to
// another origin. `connect-src 'self'` blocks every fetch, XHR, WebSocket and beacon to a
// foreign server. 'wasm-unsafe-eval' is needed to run the PDF engine (WebAssembly).
const CSP = [
  "default-src 'none'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "worker-src 'self'",
  "style-src 'self'",
  "img-src 'self' blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "manifest-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')

// Response headers for Cloudflare Pages (dist/_headers). The policy is repeated here because
// only a real header can forbid embedding the site in a frame.
const HEADERS = `/*
  Content-Security-Policy: ${CSP}; frame-ancestors 'none'
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  X-Frame-Options: DENY
  Permissions-Policy: camera=(), microphone=(), geolocation=()

# The service worker and the manifest must always be fetched fresh, or updates would not arrive.
/sw.js
  Cache-Control: no-cache
/manifest.webmanifest
  Cache-Control: no-cache

# Hashed build files never change, so browsers may keep them.
/assets/*
  Cache-Control: public, max-age=31536000, immutable
`

// The policy is written into the built page, so it holds on every host and in the e2e tests,
// and into dist/_headers from the same constant, so the two cannot drift apart.
// The dev server is left out: hot reloading needs inline styles and a WebSocket.
const contentSecurityPolicy = (): Plugin => ({
  name: 'pdfgoat-csp',
  apply: 'build',
  transformIndexHtml: () => [
    {
      tag: 'meta',
      attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP },
      injectTo: 'head-prepend',
    },
  ],
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: '_headers', source: HEADERS })
  },
})

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    contentSecurityPolicy(),
    // Makes the site an app that works offline. The app's own files are cached when the site is
    // first opened; the PDF engine (.wasm, 10 MB) and the text recognition files (/ocr) only after
    // first use, so a visit to the start page alone does not download them for the cache.
    // A new version waits until the user agrees to load it: a reload would lose unsaved changes.
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      manifest: {
        id: './',
        name: 'PDFgoat',
        short_name: 'PDFgoat',
        description: 'PDFs bearbeiten, ohne sie hochzuladen. Alles läuft im Browser.',
        lang: 'de',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#ffffff',
        categories: ['productivity', 'utilities'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        // "Open with PDFgoat" for PDF files, where the system supports it.
        file_handlers: [{ action: './', accept: { 'application/pdf': ['.pdf'] } }],
      } as never,
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,wasm,png,webmanifest,txt}'],
        globIgnores: ['ocr/**', '_headers', '**/*.wasm'],
        maximumFileSizeToCacheInBytes: 40 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.endsWith('.wasm'),
            handler: 'CacheFirst',
            options: { cacheName: 'pdfgoat-engine', cacheableResponse: { statuses: [200] } },
          },
          {
            urlPattern: ({ url }) => url.pathname.includes('/ocr/'),
            handler: 'CacheFirst',
            options: { cacheName: 'pdfgoat-ocr', cacheableResponse: { statuses: [200] }, expiration: { maxEntries: 20 } },
          },
        ],
      },
    }),
  ],
  // Relative paths so the build works on any static host, also in a subfolder.
  base: './',
  // The PDF engine alone is several MB; that is expected for this app.
  build: { chunkSizeWarningLimit: 1500 },
  // MuPDF uses top-level await, which needs module workers.
  worker: { format: 'es' },
})
