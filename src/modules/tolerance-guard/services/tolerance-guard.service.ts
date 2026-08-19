import { BadRequestException, Injectable } from '@nestjs/common';
import { CompanySettingsService } from '@modules/company-settings/services/company-settings.service';
import { PoVendorLineRepository } from '@modules/po-vendor/repository/repositories/po-vendor-line.repository';
import { GrnRepository } from '@modules/grn/repository/repositories/grn.repository';
import { GrnLineRepository } from '@modules/grn/repository/repositories/grn-line.repository';
import { ENUM_GRN_STATUS } from '@modules/grn/enums/grn.enum';

const num = (v: any): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export type ToleranceKind = 'grn_qty' | 'pov_price' | 'invoice_qty' | 'invoice_price';

const CONFIG_KEY: Record<ToleranceKind, string> = {
    grn_qty: 'grn_qty_tolerance_pct',
    pov_price: 'pov_price_tolerance_pct',
    invoice_qty: 'invoice_qty_tolerance_pct',
    invoice_price: 'invoice_price_tolerance_pct',
};

export interface ToleranceCheckResult {
    withinTolerance: boolean;
    /** Signed: positive = actual > baseline. */
    diffPct: number;
    /** The configured limit that was applied (0 = unset, meaning the check was skipped — see `buildResult`). */
    limitPct: number;
    /** Human-readable, set only when withinTolerance is false. */
    reason?: string;
}

/**
 * Shared tolerance-check engine for the Purchase and Sales workflows
 * (TOLERANCE_THREE_WAY_MATCH_PLAN.md §6). ONE service, reused by GRN
 * quantity checks, POV price-revision checks, and Invoice qty/price checks
 * — never duplicated per module, per the client's own framing of these as
 * "the same feature on the buying and selling sides."
 *
 * Reads limits from `company_settings.tolerance_config` (same JSONB-bag
 * pattern as `compliance_config`). A missing/zero baseline or an unset limit
 * always resolves to `withinTolerance: true` — nothing to compare against,
 * or the company hasn't opted into this check yet (matches
 * `assertPostingDateOpen`'s "no cutoff configured = never blocks" precedent).
 */
@Injectable()
export class ToleranceGuardService {
    constructor(
        private readonly companySettings: CompanySettingsService,
        private readonly povLineRepository: PoVendorLineRepository,
        private readonly grnRepository: GrnRepository,
        private readonly grnLineRepository: GrnLineRepository
    ) {}

    private async limitPctFor(companyId: string, kind: ToleranceKind): Promise<number> {
        const settings = await this.companySettings.getCompanyDefaults(companyId);
        const cfg = (settings as any)?.tolerance_config || {};
        return num(cfg[CONFIG_KEY[kind]]);
    }

    private buildResult(
        kind: ToleranceKind,
        baseline: number,
        actual: number,
        limitPct: number,
        subject: string
    ): ToleranceCheckResult {
        if (baseline <= 0 || limitPct <= 0) {
            // Nothing to compare against, or the company hasn't set a limit
            // for this check — the check is DISABLED, not maximally strict.
            // Deliberate: this is a safer rollout default (nothing blocks
            // the moment the feature ships, until the company opts in with
            // a real %) — never blocks.
            return { withinTolerance: true, diffPct: 0, limitPct };
        }
        const diffPct = round2(((actual - baseline) / baseline) * 100);
        const withinTolerance = Math.abs(diffPct) <= limitPct;
        return {
            withinTolerance,
            diffPct,
            limitPct,
            reason: withinTolerance
                ? undefined
                : `${subject} ${actual} vs baseline ${baseline} — ${diffPct > 0 ? '+' : ''}${diffPct}% (limit ±${limitPct}%)`,
        };
    }

    /** GRN received qty vs the PO's ordered qty, or Invoice qty vs the SO's ordered qty. */
    async checkQtyTolerance(
        companyId: string,
        baselineQty: number,
        actualQty: number,
        which: 'grn' | 'invoice'
    ): Promise<ToleranceCheckResult> {
        const kind: ToleranceKind = which === 'grn' ? 'grn_qty' : 'invoice_qty';
        const limitPct = await this.limitPctFor(companyId, kind);
        return this.buildResult(kind, num(baselineQty), num(actualQty), limitPct, 'Qty');
    }

    /** Revised POV unit price vs the PO's price, or Invoice unit price vs the SO's price. */
    async checkPriceTolerance(
        companyId: string,
        baselinePrice: number,
        actualPrice: number,
        which: 'pov' | 'invoice'
    ): Promise<ToleranceCheckResult> {
        const kind: ToleranceKind = which === 'pov' ? 'pov_price' : 'invoice_price';
        const limitPct = await this.limitPctFor(companyId, kind);
        return this.buildResult(kind, num(baselinePrice), num(actualPrice), limitPct, 'Price');
    }

    /**
     * Three-way match gate (§7.3) — throws if this POV has ANY open
     * tolerance hold: a price hold on one of its own lines, or a qty hold on
     * a line of one of its CONFIRMED GRNs. Does NOT require a GRN to exist —
     * a POV with zero GRNs and zero price holds passes through untouched
     * (preserves the "pay before goods arrive" decision already in
     * `PoVendorService.recordPayment`).
     *
     * Scoped to CONFIRMED GRNs only, not merely non-cancelled ones: a DRAFT
     * GRN hasn't posted anything yet (nothing is final — numbers can still
     * change freely, same reason only CONFIRMED GRNs post to the stock
     * ledger), and `GrnService.update` now blocks a GRN from ever reaching
     * CONFIRMED while a qty hold is open (see the status-write-ordering fix
     * there), so a confirmed GRN can only carry `tolerance_hold: true` if the
     * tolerance limit was tightened in company settings AFTER it confirmed —
     * this check exists as the defensive backstop for exactly that case.
     */
    async assertNoOpenHolds(companyId: string, povId: string): Promise<void> {
        const blocking: string[] = [];

        const povLines = (await this.povLineRepository.findAll({
            po_vendor_id: povId,
            tolerance_hold: true,
        } as any)) as any[];
        for (const l of povLines) {
            blocking.push(`POV line ${l.seq} (price): ${l.tolerance_hold_reason}`);
        }

        const grns = (await this.grnRepository.findAll({
            company_id: companyId,
            po_vendor_id: povId,
            soft_delete: false,
            status: ENUM_GRN_STATUS.CONFIRMED,
        } as any)) as any[];
        if (grns.length) {
            const grnIds = grns.map((g) => g._id.toString());
            const voucherByGrnId = new Map<string, string>(
                grns.map((g) => [g._id.toString(), g.voucher_no])
            );
            const grnLines = (await this.grnLineRepository.findAll({
                grn_id: { $in: grnIds },
                tolerance_hold: true,
                soft_delete: false,
            } as any)) as any[];
            for (const l of grnLines) {
                const voucher = voucherByGrnId.get(l.grn_id?.toString()) || 'GRN';
                blocking.push(
                    `${voucher} line ${l.seq} (qty): ${l.tolerance_hold_reason}`
                );
            }
        }

        if (blocking.length) {
            throw new BadRequestException(
                `Cannot record payment — ${blocking.length} line(s) still outside tolerance: ${blocking.join('; ')}. Resolve or override each line first.`
            );
        }
    }
}
