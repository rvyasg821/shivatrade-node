import {
    ENUM_ADJUSTMENT_PARTY_TYPE,
    ENUM_ADJUSTMENT_DIRECTION,
} from '../enums/adjustment-note.enum';

/**
 * How a note moves the balance of the document it is linked to.
 *
 * The client's DR/CR convention is cash-direction based (money out = DEBIT on
 * BOTH sides), which is why the two "reduce the bill" cases sit in opposite
 * columns. Stated in plain terms — the wording the Adjustment Note form now
 * uses — this is simply:
 *
 *   Customer + CREDIT  → "reduce the bill"   (allowance to them)   → balance ↓
 *   Customer + DEBIT   → "increase the bill" (we charge more)      → balance ↑
 *   Vendor   + DEBIT   → "reduce the bill"   (short/damaged goods) → balance ↓
 *   Vendor   + CREDIT  → "increase the bill" (vendor charges more) → balance ↑
 *
 * Both "reduce" rows match standard AR/AP practice; the naming is what trips
 * people up, hence the plain-language labels on the form.
 */
export function adjustmentReducesBalance(
    partyType: string,
    direction: string
): boolean {
    if (partyType === ENUM_ADJUSTMENT_PARTY_TYPE.CUSTOMER) {
        return direction === ENUM_ADJUSTMENT_DIRECTION.CREDIT;
    }
    return direction === ENUM_ADJUSTMENT_DIRECTION.DEBIT;
}

const num = (v: any): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};
const round2 = (v: number): number =>
    Math.round((v + Number.EPSILON) * 100) / 100;

/**
 * The money a single note actually posts: base + GST. `gst_amount` is null on
 * every note except a vendor + debit one, so this equals the base elsewhere.
 */
export function adjustmentEffectiveAmount(note: {
    amount?: any;
    gst_amount?: any;
}): number {
    return round2(num(note?.amount) + num(note?.gst_amount));
}

/**
 * Net effect of a set of notes on their document's balance, as a POSITIVE
 * number meaning "the balance goes down by this much". Voided and soft-deleted
 * notes are skipped, so voiding a note reverses it automatically.
 *
 * Used by both InvoiceService (balance_receivable) and PoVendorService
 * (balance_payable) so the two can never drift apart.
 */
export function sumAdjustmentEffect(
    notes: Array<{
        party_type?: string;
        direction?: string;
        amount?: any;
        gst_amount?: any;
        voided_at?: any;
        soft_delete?: boolean;
    }>
): number {
    let total = 0;
    for (const n of notes || []) {
        if (!n || n.voided_at || n.soft_delete) continue;
        const eff = adjustmentEffectiveAmount(n);
        total += adjustmentReducesBalance(n.party_type, n.direction)
            ? eff
            : -eff;
    }
    return round2(total);
}
