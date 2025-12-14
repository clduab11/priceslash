# Frontend Architecture

This implementation is a single Next.js 14 web app (App Router).

## Pages

- `src/app/page.tsx`: marketing landing page
- `src/app/pricing/page.tsx`: subscription pricing + Stripe checkout entry
- `src/app/dashboard/page.tsx`: authenticated feed of validated glitches (tier-delayed)

## Styling

- Tailwind CSS (`src/app/globals.css`, `tailwind.config.ts`)

## Auth

- Clerk middleware guards non-public routes (`src/middleware.ts`)

