# ShivaTrades — Developer Handover

_Last updated: 2026-06-16_

This document hands over the **Sales → Purchase → Dispatch → GRN** work stream. It covers the
current architecture, what was just shipped, how to run things, known gaps, and a prioritized
plan for the next developer.

---

## 1. Repo layout & run

Two **separate** git repositories under `/data/Projects/ShivaTrades/app/`:

| Repo | Stack | Port | Remote |
|------|-------|------|--------|
| `react/` | React 18, Vuexy, reactstrap, Redux Toolkit, react-hook-form | **3010** | `github.com/rvyasg821/shivatrade-react` |
| `node/`  | NestJS 11, TypeORM, PostgreSQL | **3011** (`HTTP_PORT`) | `github.com/rvyasg821/shivatrade-node` |

**Branches:** `dev` is the integration branch (deploy/merge target). `main` is default/production.
All current work is committed on `dev` (node) and `feature/product-hide-rebates-expenses` → merged
into `dev` (react), both pushed.

**Run frontend:** `cd react && npm start` (CRA dev server on :3010).

**Run backend:**
```bash
cd /data/Projects/ShivaTrades/app/node
npm run build                                   # nest build → dist/ (regenerates metadata.ts)
setsid node --enable-source-maps dist/main      # MUST be cwd=node/ so .env loads
```
- Restart cwd **must** be `node/`; otherwise dotenv misses `.env` and Nest crashes at
  `auth.config.ts` with `ms(undefined)`.
- Do **not** `pkill -f dist/main` — the pattern matches your own shell (exit 144). Kill by port:
  `kill $(ss -ltnp | grep ':3011' | grep -oP 'pid=\K[0-9]+')`.
- A `nest start --watch` process may also be running but is not the served instance.

**Database:** Postgres `shivatrades_local`, user `shiva`, pass `shiva_local`, `localhost:5432`.
Ad-hoc queries via `node -e` using the `pg` client inside `node/node_modules`.

---

## 2. Domain model — Sales & Purchase

```
Lead → RFQ → Quotation → Sales Order (purchase-orders module)
                                  │  split per vendor
                                  ▼
                    Vendor PO (POV / po-vendors module)
                          draft → dispatched → closed
                                  │  receive + QC
                                  ▼
                              GRN (grn module)
                          draft → confirmed → cancelled
```

> ⚠️ **Naming trap:** the `purchase-orders` module is the **Sales Order** (customer-facing).
> The `po-vendors` module (POV) is the actual **Vendor Purchase Order**. The `grn` module is the
> Goods Receipt Note. Sidebar labels: "Sales Orders", "PO Vendors", "GRN".

### Source-of-truth split (the core of the recent rework)
- **POV** owns **order + dispatch**. Dispatch captures transport (transporter / vehicle / LR /
  e-way / dates) + per-line `dispatched_qty`. Under-dispatch shortfall is released back to the
  parent SO's pending qty for a follow-up POV.
- **GRN** owns **receive + QC** in one record: per-line `received_qty` + `accepted_qty` +
  `rejected_qty` (+ batch / remarks). **Multiple GRNs per POV** → partial deliveries.
- **GRN confirm** rolls `Σ received` (across confirmed GRNs) into the POV line `received_qty`,
  **closes** the POV when every line is fully received, and **re-opens** it (→ dispatched) if a
  confirmed GRN is later cancelled.
- **Inventory** is a **derived read model** (`node .../inventory/services/inventory.service.ts`)
  — SQL over `pv.status='closed' AND pvl.received_qty>0`. There is **no stock-movement table**;
  closing a POV makes its received qty appear in inventory automatically.

---

## 3. What was shipped this arc

**Dispatch → GRN rework (4 phases):**
1. POV **Dispatch page** — `react/src/views/po-vendors/dispatch/index.js`, route
   `/apps/po-vendors/dispatch/:id`. Replaced the dispatch modal.
2. **GRN backend** — `node .../grn/services/grn.service.ts`: create from *dispatched* POV,
   multiple GRNs/POV, seed remaining-to-receive, `update` accepts editable `received_qty`,
   `recomputePovFromGrns` (confirm/cancel rollup + POV close/reopen), `sourcePovs` → dispatched
   POVs with pending qty, GRN list `po_vendor_id` filter.
3. **GRN page** — `react/src/views/grn/view/index.js`: editable received + accepted/rejected,
   dispatched/received/accepted/rejected totals, Save / Save & Confirm / Cancel GRN.
4. **POV detail** — `Create GRN` button + **GRNs tab** (`tabView/GrnsTab.js`); removed receive
   modal; retired the dead POV `receive` endpoint/service/DTO + FE thunk.

**Detail-page UX:** shared `StatusChangeDropdown` (RFQ/Quotation/SO/POV), `DetailHeader`
`actionsPrefix`, icon contact subtitles (company + email) on lead/rfq/quotation/SO/POV, POV
Event Timeline right-panel, generate-SO promoted to a full page.

**Quotation:** Step-2 editable Costing Worksheet (`CostingWorksheet.js`), Step-3 customer USD
view (`CustomerCostingTable.js`), round-off in customer currency.

**Listings standardized** (navy `#09418B` names via `ref` `!important`, soft-color rounded-pill
status `${c}1f`/`${c}`, icon contact lines): products, categories, vendors, price-list, leads,
rfq, quotations, sales-orders, po-vendors. Pagination styling fixed.

**Other:** exchange-rate intuitive entry (store inverse, "1 USD = X INR"), product `part_no` in
Pricing + INR default, manage-vendor-pricing page, cost-only price list (no margin/discount/MOQ/
valid_until in UI), RFQ vendor checkbox per-vendor persistence + price→price-list sync.

---

## 4. Key files

**Frontend (`react/src/`):**
- `views/po-vendors/dispatch/index.js` — dispatch page
- `views/po-vendors/view/index.js` + `tabView/{index,OverviewTab,ExpensesTab,GrnsTab}.js` — POV detail
- `views/po-vendors/view/PoVendorTimelinePanel.js` — event timeline (right panel)
- `views/grn/view/index.js` — GRN receive + QC page
- `views/_shared/detail-page/{DetailHeader,StatusChangeDropdown,DetailTwoPanel}.js`
- `views/_shared/sales-doc/{_helpers,CustomerCostingTable,SalesDocCostingCard}.js` — costing math
- `views/quotations/add/wizard/CostingWorksheet.js` — quotation step-2 grid

**Backend (`node/src/modules/`):**
- `grn/services/grn.service.ts` — GRN lifecycle + POV rollup (`recomputePovFromGrns`,
  `receivedByPovLineExcluding`)
- `po-vendor/services/po-vendor.service.ts` — POV dispatch/cancel/list/mapList
- `inventory/services/inventory.service.ts` — derived inventory read model
- `price-list/services/price-list.service.ts` — `upsertFromRfq`, bulk-create

---

## 5. Known gaps / non-obvious behavior

- **Inventory tracks `received_qty`, not `accepted_qty`.** Rejected goods still count as stock.
- **Partial receipts are invisible in inventory** until the POV fully closes (inventory is
  closed-POV only).
- **Rejected qty is captured but has no downstream** (no return / debit-note flow).
- **No "Edit Dispatch"** — `dispatch()` only goes draft→dispatched; post-dispatch transport edits
  aren't possible (the Tracking tab that allowed this was removed as a Dispatch-modal duplicate).
- **No automated tests** for the dispatch/GRN rework.
- POV `received_qty` is now **owned by GRN rollup** — don't write it elsewhere.

---

## 6. Next-task plan (priority order)

1. **Inventory = accepted stock.** Change inventory SQL to use accepted (confirmed-GRN) qty
   instead of `pvl.received_qty`; decide whether rejected is excluded or tracked separately.
   Touch: `inventory.service.ts` (+ possibly join GRN lines).
2. **Partial-receipt inventory visibility.** Surface partially-received (still-open) POVs in
   inventory, or aggregate confirmed-GRN accepted qty rather than gating on `status='closed'`.
3. **Returns / Debit Note for rejected qty.** New flow consuming GRN `rejected_qty`.
4. **Edit Dispatch.** Allow correcting transport/qty after dispatch (reuse the dispatch page in
   edit mode; relax `dispatch()` precondition or add an `updateDispatch`).
5. **GRN → tracking events.** Emit POV timeline events on GRN confirm/cancel (the POV Event
   Timeline panel already renders tracking events).
6. **Dispatch PDF/preview** and **tests** for the dispatch/GRN paths.

---

## 7. Conventions

- Listing name color: `ref={el => el && el.style.setProperty("color","#09418B","important")}`.
- Status pill: `bg ${c}1f`, `color ${c}` via the same `ref` `!important` trick.
- Costing math lives in `react/src/views/_shared/sales-doc/_helpers.js`
  (`computeLineCosting`, `computeDocTotals`). Exchange convention stored = **foreign units per 1
  INR** (USD-per-INR ≈ 0.01); UI shows the intuitive inverse.
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
