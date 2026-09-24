# Frontend structure

This project uses Expo Router and groups code by responsibility. Route files stay in
`app/`; reusable implementation code stays outside it.

```text
src/
├── app/                     Thin Expo Router route files and layouts
├── components/
│   ├── layout/              Page-level layout primitives
│   ├── maps/                Shared map presentation
│   ├── navigation/          Navigation UI and its local context
│   └── ui/                  Small reusable UI primitives
├── i18n/                    Thai/English catalogs, language state, native strings
├── features/                Page-owned code, grouped by page name
│   ├── ai/                  AI camera page
│   ├── alerts/              Safety alerts page
│   ├── home/                Map/home page
│   ├── navigation/          Active navigation page
│   ├── profile/             Profile and preferences page
│   ├── report-issue/        Issue reporting page
│   ├── routes/              Route selection page
│   └── search/              Place search page
├── providers/               Application-wide React providers
│   └── app-data/            App state, types, defaults, and consumer hook
├── services/                External API and platform integrations
└── theme.ts                 Shared design tokens
```

## Conventions

- Keep `app/` for route declarations and layouts only. A route should re-export its
  page from `features/<page-name>`.
- Keep page-specific components, hooks, types, and helpers inside that page's
  `features/<page-name>` directory. Create a local `components/` subdirectory when
  a page grows into multiple components.
- Put a component in `components/ui` only when it is reused across features.
- Colocate component-only helpers, types, and tests with their component.
- Access provider state through its public `index.ts`; do not import its context
  directly outside the provider package.
- Keep network and platform calls in `services/`, not in presentation components.
- Add a global state library only when React state/context is no longer sufficient.
  Empty architecture folders and speculative abstractions are intentionally avoided.

## Languages

See [i18n/README.md](./i18n/README.md) for adding translations, preserving saved
reports, localizing service errors, and testing. Run `npm run test:i18n` alongside
`npm run lint` and `npx tsc --noEmit` before handing off changes.
- Use PascalCase for component files, `use...` for hooks, and descriptive domain
  names for services and data.
