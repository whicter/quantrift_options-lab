# Earnings This Week — 2026-07-30

## Scope

Added an `/earnings` product tab for the current or next New York calendar week. The in-page two-state switch preserves one comparison-friendly Monday–Friday layout without expanding the top navigation. It is a read-only view of persisted earnings metadata; no provider request happens in the user path.

## Data contract

`GET /api/market/earnings-this-week` reads each symbol's latest non-null `iv_history.earnings_date`, joins only active and scan-enabled `symbol_universe` records, and limits dates to Monday through Friday of the current New York week. `?week=next` shifts that window by seven days. The response includes the week bounds even if there are no rows. `name` is nullable. Report timing, estimates and logos are not returned because the persisted source does not establish them.

The calendar may return a stored `icon_url` from the ticker reference branding record. `PolygonReferenceProvider` accepts only provider-supplied HTTPS branding URLs, and `collect_universe_metadata.py` persists them in `symbol_universe.metadata`. Cards display the icon above a stable ticker-initial fallback; failed images remove themselves instead of showing a broken-image control. No client-side third-party logo lookup occurs.

## UI contract

`/earnings` renders five stable weekday columns, marks today's column, and presents each returned ticker as a link to `/analyze?symbol=<ticker>`. Empty weekdays and empty weeks are explicit. The pure `buildEarningsWeekView` test verifies weekday grouping and discards out-of-week dates.

The shared document root intentionally has `overflow: hidden`; `/earnings` therefore owns vertical scrolling with `height: 100vh; overflow-y: auto`, matching the other product pages. This prevents long day columns from being clipped below the viewport.

## Local validation

- `frontend npm test`: 99 passing.
- `frontend npm run lint`: passing.
- `frontend npm run build && npm run check:dist`: passing; existing Vite over-500 kB chunk warning only.
- `server npm test -- --test-name-pattern='earnings calendar|briefing'`: passing (40 test files, including the new route test and four market briefing tests).
- Branding collector unit tests could not run in this checkout because the documented `collector/venv311` is absent and the system Python lacks `psycopg2`; `py_compile` succeeds. Recreate the documented collector environment before running the metadata sync.

## Not established

No production API or Vercel visual acceptance was performed. Deployment acceptance should verify `/api/market/earnings-this-week` returns current persisted dates and that a card reaches the corresponding Analyze page.
