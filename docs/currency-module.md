# Currencies & Exchange Rates Module

End-to-end reference for the Currency master + Exchange Rate history feature.
Covers data model, endpoints, sample data, edge cases, and how the rate is used
across the platform.

---

## What it does

- Maintain a per-company list of currencies (INR, USD, EUR, …).
- Capture exchange rates between any two of those currencies, with an
  **effective date** so the system can pick the right rate for any moment in
  time.
- Adding a new rate for the same `from → to` pair **does not delete** the old
  one - old rates are kept as history. The system always uses the most
  recent effective-dated rate for conversions.
- No third-party FX API. All rates entered manually.

## Tables

### `currencies`
| Column | Type | Notes |
|---|---|---|
| `_id` | uuid PK | from `DatabaseObjectIdEntityBase` |
| `company_id` | uuid, indexed | tenant scope |
| `created_by` | uuid | who added it |
| `code` | varchar(3), indexed | ISO 4217, uppercase, unique per company (case-insensitive) |
| `name` | varchar(100) | e.g. "Indian Rupee" |
| `symbol` | varchar(10), nullable | e.g. "₹" |
| `is_active` | boolean | mirrors `status` |
| `status` | varchar | `active` / `inactive` |
| `soft_delete` | boolean, indexed | soft-delete flag |
| `createdAt` / `updatedAt` / etc. | from base entity | audit |

### `currency_exchange_rates`
| Column | Type | Notes |
|---|---|---|
| `_id` | uuid PK | |
| `company_id` | uuid, indexed | tenant scope |
| `from_currency_id` | uuid, indexed | FK → currencies._id |
| `to_currency_id` | uuid, indexed | FK → currencies._id |
| `rate` | numeric(18, 8) | `1 from = rate * to`. Stored as string for precision. |
| `effective_date` | date, indexed | when this rate became active |
| `created_by` | uuid | |
| `createdAt` | timestamp | from base entity |

**No soft delete** - rate history is permanent (per spec).
A currency soft-delete **hard-deletes** its rate rows (cascade in service).

## Module layout

`src/modules/currency/`
```
constants/currency.entity.constant.ts        # table names
enums/currency.enum.ts                       # ENUM_CURRENCY_STATUS
repository/
  entities/
    currency.entity.ts
    currency-exchange-rate.entity.ts
  repositories/
    currency.repository.ts                   # findByCompanyId, isCodeExists
    currency-exchange-rate.repository.ts     # findByFromCurrencyId, findCurrentRate, deleteByCurrencyId
  currency.repository.module.ts
dtos/
  request/
    currency.create.request.dto.ts
    currency.update.request.dto.ts
    exchange-rate.create.request.dto.ts
  response/
    currency.get.response.dto.ts
    currency.list.response.dto.ts
services/currency.service.ts                 # CRUD + addRate + listRatesForCurrency + getCurrentRate
controllers/currency.admin.controller.ts
currency.module.ts
```

Wired into `src/router/routes/routes.admin.module.ts` (`CurrencyModule` +
`CurrencyAdminController`).

Language messages: `src/languages/en/currency.json`.

## Endpoints

All under `/api/v1/admin/currency`. JWT required.

| Method | Path | Body / Query | Returns |
|---|---|---|---|
| `POST` | `/create` | `{ code, name, symbol?, status? }` | created currency |
| `GET`  | `/list` | `?status=ACTIVE&_search=&_limit=&_offset=&_order=` | paged list |
| `GET`  | `/dropdown` | - | `[{ _id, code, name, symbol }]` (active only) |
| `GET`  | `/get/:id` | - | one currency |
| `PUT`  | `/update/:id` | partial of create | updated |
| `DELETE` | `/delete/:id` | - | soft-deletes + wipes rate history |
| `GET`  | `/:id/rates` | - | full history for this currency as the `from` side, newest first |
| `POST` | `/:id/rates` | `{ to_currency_id, rate, effective_date }` | new rate row |

### Validation rules
- `code` exactly 3 letters, stored uppercase, unique per company (case-insensitive)
- `name` 1–100 chars; `symbol` optional ≤10 chars
- `rate` numeric string (preserves precision)
- `to_currency_id` must exist in same company and ≠ this currency
- `effective_date` ISO date (`YYYY-MM-DD`)

## Permissions

Slug: `currencies` (in `MODULES_PERMISSIONS`).

| Role | Permissions |
|---|---|
| Super Admin | full (auto via seed loop) |
| Company Admin | full CRUD |
| Location Admin | read-only |
| Employee / Agent / Vendor / Customer | none |

After editing any role-permission constant, run:
```bash
npm run update:role-permissions
npm run sync:custom-role-permissions
```

## How "current rate" lookup works

Service helper: `currencyService.getCurrentRate(companyId, fromId, toId)`.

```ts
SELECT * FROM currency_exchange_rates
WHERE  company_id = $1
  AND  from_currency_id = $2
  AND  to_currency_id = $3
ORDER BY effective_date DESC, "createdAt" DESC
LIMIT 1
```

Returns `null` if no rate exists or `from === to`. Future modules
(quotations, PO, invoices) should call this - never query the table directly.

If you also want **bidirectional** auto-resolution (USD→INR not found but
INR→USD exists ⇒ use `1 / rate`) extend the helper. The current spec stores
each direction explicitly so we don't do that yet.

## Frontend

Path: `shivatrades-react/src/views/currencies/`

```
store/index.js     # Redux thunks: getCurrencyList/Dropdown/get/create/update/delete
                   #               + getExchangeRates + addExchangeRate
index.js           # DataTable list (Code, Name, Symbol, Status, Action) + status filter
add/index.js       # Create+Edit form. In edit mode: Exchange Rates section
                   # (Add Rate sub-form + history table using reactstrap <Table bordered>)
```

API endpoints: `src/utility/ApiEndPoints.js → currencies`.
Slug + sidebar entry: `src/navigation/vertical/apps.js → currenciesModuleSlug`.

Display: rates rendered with `Number(rate).toString()` to trim trailing zeros
(e.g. `83.50000000` → `83.5`). Storage is unchanged at numeric(18, 8).

---

## Sample data to create

Useful starter set for an India-based trading company.

### Currencies
| Code | Name | Symbol |
|---|---|---|
| INR | Indian Rupee | ₹ |
| USD | United States Dollar | $ |
| EUR | Euro | € |
| GBP | British Pound Sterling | £ |
| AED | UAE Dirham | د.إ |
| CNY | Chinese Yuan | ¥ |
| JPY | Japanese Yen | ¥ |
| SGD | Singapore Dollar | S$ |
| AUD | Australian Dollar | A$ |
| SAR | Saudi Riyal | ﷼ |

All status = Active.

### Sample rates (illustrative - replace with your real source)

After creating the currencies, open each one in edit mode and add rates.

**Edit USD →**
| To | Rate |
|---|---|
| INR | 83.50 |
| EUR | 0.92 |
| GBP | 0.78 |
| AED | 3.6725 |

**Edit INR →**
| To | Rate |
|---|---|
| USD | 0.012 |
| AED | 0.044 |
| EUR | 0.011 |

**Edit EUR →**
| To | Rate |
|---|---|
| USD | 1.087 |
| INR | 90.65 |
| GBP | 0.85 |

**Edit AED →**
| To | Rate |
|---|---|
| INR | 22.74 |
| USD | 0.272 |

Effective Date: today.

### Curl seed (alternative to UI)

```bash
TOKEN="<company-admin-jwt>"
API="http://localhost:3001/api/v1"

for ROW in \
  'INR|Indian Rupee|₹' \
  'USD|United States Dollar|$' \
  'EUR|Euro|€' \
  'GBP|British Pound Sterling|£' \
  'AED|UAE Dirham|د.إ'; do
  IFS='|' read -r CODE NAME SYM <<< "$ROW"
  curl -s -X POST "$API/admin/currency/create" \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -d "{\"code\":\"$CODE\",\"name\":\"$NAME\",\"symbol\":\"$SYM\",\"status\":\"active\"}"
  echo
done

# Inspect ids
curl -s "$API/admin/currency/dropdown" -H "Authorization: Bearer $TOKEN" | jq

# Add a USD→INR rate (replace UUIDs)
curl -s -X POST "$API/admin/currency/<USD_ID>/rates" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"to_currency_id":"<INR_ID>","rate":"83.50","effective_date":"2026-04-27"}'
```

---

## Common edge cases

| Case | Result |
|---|---|
| Duplicate code in same company | 400 "Currency code 'XXX' already exists" |
| Same code in *different* company | allowed (scoped per company) |
| Add rate where `to_currency_id == this currency` | 400 "From and To currencies must be different" |
| Add rate referencing unknown / soft-deleted currency | 400 "Target currency not found" |
| Soft-delete currency that is referenced as `from` or `to` in rates | succeeds, rate rows hard-deleted in cascade |
| Lookup current rate for `from === to` | helper returns `null` (no row, no implicit `1.0`) |
| Lookup current rate when no rates exist | helper returns `null` - caller must handle gracefully |
| Update currency code (e.g. typo fix) | allowed if new code is unique; existing rate rows still link by id, unaffected |

## Where the rate is consumed (future work)

These modules will call `currencyService.getCurrentRate(...)` once they exist:

- Price List - vendor pricing in non-base currency
- Quotations / PFI - convert vendor prices into customer-currency totals
- Purchase Orders - record rate snapshot at PO date
- Invoices - convert + display in customer currency
- Reports - multi-currency aggregation

Each consumer should snapshot the rate it used into its own row at the time
of creation (e.g. `purchase_orders.exchange_rate_used`) so historical
documents don't shift when newer rates land.
