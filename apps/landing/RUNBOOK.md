# Landing page

Run these commands in `apps/landing`:

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

The user supplied `Monochrome Praying Mantis Emblem.png` and `Monochrome Praying Mantis Emblem.ico` from `~/Downloads`. The unchanged PNG is saved as `assets/originals/mentis-logo.png`. The unchanged ICO is saved as `app/favicon.ico`; it replaces the old SVG browser icon. The header, footer, and social preview use a transparent 96px PNG. To generate it again, run this command in `apps/landing`:

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

Hosting was not selected. Add a public metadata base URL when a deployment URL is known. No deployment settings are included.
