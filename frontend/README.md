# ACME salary frontend

React 19 + TypeScript, Vite, and Vitest. No analytics, third-party fonts, or external runtime services are used. All employee information in this demonstrator must be synthetic.

## Development

Start the backend on `127.0.0.1:8000`, then:

```sh
npm ci
npm run dev
```

The development server binds to loopback and proxies `/api` to the backend. The backend serves the production build after `npm run build` and a backend restart.

```sh
npm test
npm run build
```

If the environment's default npm cache is not writable, use `npm ci --cache /tmp/acme-npm-cache` instead.

## Important behavior

- Search and pagination happen on the server; the browser never fetches the full directory to show a page.
- Every salary carries its original currency. There is deliberately no cross-currency total, conversion, or pay-equity score.
- Salary inputs remain decimal strings. Display abbreviation is approximate, with full amounts available in hover titles and the detailed insights table.
- JPY inputs are whole yen; other supported currencies allow up to two decimal places.
- Editing sends the record version. A stale edit is rejected, its contents stay visible, and the user must reopen the latest record. A duplicate employee ID during creation is recoverable without closing the form.
- Native modal dialogs provide an inert background, focus trap and Escape behavior. Closing restores focus to the opener. Saving disables dismissal until the outcome is known.
- Requests are aborted when filters, pages or panels change, preventing stale read results from replacing newer views.
- Archives are reversible. Archived records must be restored before they can be edited.
- Import is create-only and atomic. The download template shows required headers. Export is a filtered reporting dataset, not an import template.

## Tests

The UI tests use a mocked API to cover currency separation, server-side search and pagination, salary edits, immutable IDs, duplicate-create recovery, stale-edit rejection, JPY validation, archive/restore, repeated history opens, atomic CSV error feedback, grouped analytics, network retry and canceled forms/focus return. Format tests cover decimal display, dates, currency labels and API error messages. Integrated real-browser checks are documented in the repository-level verification notes.

## Reading the implementation

Inline comments focus on contracts and decisions rather than narrating each JSX tag:

- `src/main.tsx` mounts React; `App.tsx` owns filters, pagination, read requests, dialog selection, and refresh invalidation. A revision counter re-fetches dependent views after a successful write.
- `src/types.ts` describes the API's JSON shapes. `api.ts` normalizes HTTP/network errors and preserves HTTP status for conflict handling. TypeScript types document responses; they do not perform runtime JSON schema validation.
- `src/EmployeeForm.tsx` owns a create/edit draft. Salary inputs stay strings; basic browser/client validation improves feedback, while the API remains authoritative. A version conflict preserves the draft and forces reopening the refreshed record.
- `src/EmployeeActions.tsx` handles reversible archive/restore and read-only history. A stale status change also refreshes the directory before retrying from a newly opened dialog.
- `src/Modal.tsx` supplies the native dialog wrapper, accessible naming, dismissal rules, and focus restoration. Pending writes lock both dismissal and editable controls.
- `src/ImportDialog.tsx` creates a local CSV template, reads a file or pasted text, and submits one atomic create-only import. The browser intentionally caps previews at 2 MiB, below the API's larger request cap.
- `src/format.ts` preserves exact full-money display using string manipulation. Only abbreviated overview labels use approximate numbers. Date-only values are not treated as UTC instants.
- `src/Icon.tsx` contains decorative inline SVG shapes. `src/styles.css` is organized into commented component/layout sections, responsive breakpoints, and final readability overrides.
- `src/test/` exercises observable UI behavior with mocked requests. It is not a substitute for a real-browser check of layout, native dialog focus trapping, or downloads.

### Configuration that must remain strict JSON

`package.json` cannot contain comments. Its scripts run the loopback-only Vite development/preview servers, a TypeScript-checked production build, Vitest, and Prettier. React/React DOM are runtime dependencies; TypeScript, Vite, Vitest, Testing Library, jsdom, and Prettier are development tools. The project is private to prevent accidental npm publication. `package-lock.json` is generated and records reproducible dependency resolution; it is not manually annotated.

`.prettierrc.json` configures single quotes, omitted semicolons, and trailing commas. The TypeScript project files accept JSON-with-comments, so their build boundaries and strictness settings are explained inline. `vite.config.ts` documents the development API proxy and shared test setup. Generated `dist/`, `node_modules/`, compiler caches, and coverage outputs are not authored source and should not be hand-commented.
