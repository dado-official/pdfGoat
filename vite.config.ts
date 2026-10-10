import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

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
  plugins: [react(), contentSecurityPolicy()],
  // Relative paths so the build works on any static host, also in a subfolder.
  base: './',
  // PDF.js alone is ~500 kB; that is expected for this app.
  build: { chunkSizeWarningLimit: 1500 },
  // MuPDF uses top-level await, which needs module workers.
  worker: { format: 'es' },
})
