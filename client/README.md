# IPL Auction – Landing Page (Vite + React + Tailwind)

The landing page is built with **Vite**, **React**, and **Tailwind** (no CDN or in-browser Babel) to reduce lag during bidding.

## Setup

```bash
cd client
npm install
```

## Build (required before production)

From project root:

```bash
npm run build:landing
```

Or from `client/`:

```bash
npm run build
```

Output: `public/assets/landing.js` and `public/assets/landing.css` (loaded by the main `index.html`).

## Dev (optional)

From project root:

```bash
npm run dev:landing
```

Or from `client/`:

```bash
npm run dev
```

Then open the main app; for live landing edits you’d need to proxy or run the full app while Vite serves the landing (or just use build and refresh).
