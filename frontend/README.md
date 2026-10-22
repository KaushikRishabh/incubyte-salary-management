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
