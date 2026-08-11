/**
 * Exchange Gain/Loss — realized forex impact per customer receipt.
 *
 * A foreign-currency (export) invoice is booked at its invoice-date rate; the
 * customer pays later at the receipt-date rate. One row per non-voided receipt
 * (advances included) against a non-INR invoice:
 *
 *   INR Expected  = amount ÷ invoice_rate     (₹ the invoice booked)
 *   INR Received  = amount ÷ receipt_rate      (₹ actually realized)
 *   Gain / Loss   = INR Received − INR Expected  (+ gain, − loss)
 *
 * Rates are stored foreign-per-₹1; `*_rate_inr` is the human-readable
 * ₹-per-1-unit (1 ÷ rate) the receipt modal / PDFs display. Amounts are in the
 * invoice currency; every INR figure is directly summable.
 */
export class ExchangeGainLossRowDto {
    payment_id: string;
    receipt_no: string | null;
    payment_date: string;
    method: string | null;

    invoice_id: string;
    invoice_no: string | null;
    invoice_date: string;
    invoice_type: string;
    currency_code: string;
    currency_symbol: string;
    customer_name: string | null;

    /** Receipt amount, in the invoice currency. */
    amount: number;
    /** ₹ per 1 unit of the foreign currency at invoice / receipt time. */
    invoice_rate_inr: number;
    receipt_rate_inr: number;

    inr_expected: number;
    inr_received: number;
    /** INR Received − INR Expected. Positive = gain, negative = loss. */
    gain_loss_inr: number;
}

export class ExchangeGainLossTotalsDto {
    /** Receipts shown. */
    receipts: number;
    inr_expected: number;
    inr_received: number;
    /** Σ gain/loss (net realized forex). */
    gain_loss_inr: number;
    /** How many receipts landed as a gain / a loss. */
    gains: number;
    losses: number;
}

export class ExchangeGainLossResponseDto {
    period_label: string;
    rows: ExchangeGainLossRowDto[];
    totals: ExchangeGainLossTotalsDto;
    pagination: { total: number; perPage: number };
}
