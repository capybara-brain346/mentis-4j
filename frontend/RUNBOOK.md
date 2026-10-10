# Landing page

Run these commands in `frontend`:

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:6969`. The page uses local demonstration records. It needs no database or API key.

```text
[Example records] + [Page text] + [Images]
                       |
                       v
                [Next.js build]
                       |
                       v
                 [Local server]
                       | HTML and assets
                       v
                    [Browser]
```

For a production preview, run `npm run build`, then `npm run preview`.

Run `npm run typecheck`, `npm run lint`, and `npm run format` to check the source. Start a preview before `npm run check:browser`. Install a browser with `npx playwright install chromium` if needed. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to use an existing Chromium binary. Set `LANDING_URL` to check a different local port.

The browser check covers tabs, playback, keyboard input, the phone menu, corrections, clipboard errors, page links, images, contrast, and reduced motion. It saves captures and results to `.impeccable/review` at the repository root. It does not call the MCP server or verify a database.

Generated landscape originals and exact prompts are in `assets/`. Optimized images are in `public/images/`. `assets/provenance.json` records their source. Next.js builds the social preview from the page text, the generated valley image, and the Mentis logo.

The user supplied `Monochrome Praying Mantis Emblem.png` and `Monochrome Praying Mantis Emblem.ico` from `~/Downloads`. The unchanged PNG is saved as `assets/originals/mentis-logo.png`. The unchanged ICO is saved as `app/favicon.ico`; it replaces the old SVG browser icon. The header, footer, and social preview use a transparent 96px PNG. To generate it again, run this command in `frontend`:

```sh
magick assets/originals/mentis-logo.png -fuzz 3% -trim +repage -transparent white -resize 96x96 -gravity center -background none -extent 96x96 -strip public/images/mentis-logo.png
```

```text
Browser                          Local server
   |                                  |
   |-- Request page ----------------->|
   |<-- HTML and assets --------------|
   |                                  |
   | Tabs change local examples       |
   | Copy writes to local clipboard   |
```

## Cloudflare deployment

The public frontend is `https://men-tis.xyz`. It runs on Cloudflare Workers with vinext. The existing Next development and preview commands remain available.

Run these commands in `frontend`:

```sh
npm ci
FRONTEND_BASE_URL=https://men-tis.xyz npm run deploy
```

`build:cloudflare` runs the existing Next build, builds the Worker with Vite, and copies the generated social image to the static assets. `public/_headers` sets its PNG content type. The Worker cannot read the source image files from the local filesystem. `typecheck` regenerates Next route types because both build tools write them.

`wrangler.jsonc` sets the account, Worker name, custom domain, backend origin, frontend origin, logs, and traces. No frontend secrets or database bindings are needed. The metadata base uses `FRONTEND_BASE_URL`. Set this variable for the production build as shown above; it takes precedence over the local development value in `.env.local`.

```text
Build:   Next -> generated social image -> Workers static assets
         Vite + vinext -> frontend Worker
Runtime: Browser -> frontend Worker -> auth proxy -> backend Worker
```

The backend origin is `https://mcp.men-tis.xyz`; the MCP endpoint is `https://mcp.men-tis.xyz/mcp`. The root `wrangler.jsonc` records the custom domain and sets `PUBLIC_BASE_URL`. `src/config/config.ts` defines the public backend origin used by the frontend setup instructions. The frontend `wrangler.jsonc` sets `MENTIS_BACKEND_URL` to the same origin.

Before deployment, add `https://mcp.men-tis.xyz/google/callback` to the Google web client's authorized redirect URIs. Set the backend's `FRONTEND_BASE_URL` to the public frontend origin, then deploy it from the repository root with `npm run worker:deploy`. Deploy the frontend after the backend. Keep Google credentials in backend Worker secrets. See `AUTH.md` for the callback and local setup.

After this change, the backend rejects requests to the old `workers.dev` hostname with HTTP 421. Update existing MCP clients to the new endpoint and reconnect. Browser sessions on the old backend hostname do not transfer to the new hostname. No database migration or deletion is needed.

After deployment, check the public page and static assets:

```sh
LANDING_URL=https://men-tis.xyz npm run check:browser
```

This check does not complete real Google sign-in.
