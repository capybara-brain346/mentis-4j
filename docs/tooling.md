# Code checks

Biome 2.5.15 runs lint, format, and import order checks. Both npm packages pin
the same version. TypeScript still runs type checks and builds the server.

Run these commands from the repository root or from `frontend`:

| Command | Action |
| --- | --- |
| `npm run lint` | Check lint rules. |
| `npm run format` | Check formatting. Do not write files. |
| `npm run check` | Check lint rules, formatting, and import order. |
| `npm run fix` | Apply formatting, import order, and safe lint fixes. |
| `npm run format:write` | Apply formatting only. |
| `npm run typecheck` | Check TypeScript types. |

Root Biome commands cover the server and landing app. Commands in
`frontend` cover only that app. The Git commit hook runs the root
`npm run check`, then `npm test`.

```text
[Source, tests, configuration] -> [Biome] -> [Check results]
                                      |
                                      | fix or format:write
                                      v
                              [Updated files]
```

The root `biome.json` selects server source, tests, configuration, and the
landing app. The app's nested `biome.json` selects its source, tests, and
configuration. Lint checks keep the prior source scope. Tests get format and
import order checks. Both configurations use Git ignore rules. Generated
Worker types, Next.js types, build output, lockfiles, and image records are
outside the selected scope. CSS parsing supports Tailwind directives.

## Migration limits

The configurations came from `biome migrate eslint --include-inspired`.
The rule preset is `none`; explicit migrated rules keep the supported prior
checks. Biome formatted the selected files with two spaces and an 80-column
line width. It also sorted imports and exports.

The migration reported 80 mapped rules out of 89 server rules and 69 mapped
rules out of 113 landing app rules. These are not exact coverage measures:
some rules differ, and formatting covers some old rules. See the
[Biome migration guide](https://biomejs.dev/installation/migrate-eslint-prettier/).

Server rules without a Biome mapping were `no-delete-var`,
`no-invalid-regexp`, `no-new-symbol`, `no-octal`, `no-unexpected-multiline`,
`@typescript-eslint/no-unused-expressions`, and
`@typescript-eslint/triple-slash-reference`.

The landing app loses some Next.js, React, and React Compiler lint checks.
Examples include `@next/next/no-html-link-for-pages`, `react/display-name`,
`react-hooks/set-state-in-effect`, and `react-hooks/preserve-manual-memoization`.
Type checks, builds, and browser checks remain separate commands. They do not
replace every missing lint rule.

The old server rule limited cyclomatic complexity to 10. Biome uses cognitive
complexity. Its limit is 20; the highest score in the current server code was
19. This is a change of measure and limit, not an exact rule replacement.
