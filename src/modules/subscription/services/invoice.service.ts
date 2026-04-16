import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import * as htmlToPdf from 'html-pdf-node';

@Injectable()
export class InvoiceService {
    private readonly logger = new Logger(InvoiceService.name);
    private readonly NODE_DOMAIN: string;
    private readonly MAIL_FROM_NAME: string;

    constructor(
        private readonly configService: ConfigService
    ) {
        this.NODE_DOMAIN = this.configService.get<string>('IMAGE_DOMAIN') || '';
        this.MAIL_FROM_NAME = this.configService.get<string>('MAIL_FROM_NAME') || 'TextSendApp';
        this.logger.log(`Invoice Service initialized with domain: ${this.NODE_DOMAIN}`);
    }

    /**
     * Helper method to format date
     */
    getTransformDate(date: Date, format: string): string {
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();

        if (format === 'dd-mm-yyyy') {
            return `${day}-${month}-${year}`;
        }

        return date.toISOString().split('T')[0];
    }

    /**
     * Helper method to get currency sign
     */
    currencySign(currency: string): string {
        const currencyMap: Record<string, string> = {
            GBP: '£',
            USD: '$',
            EUR: '€',
        };
        return currencyMap[currency] || currency;
    }

    /**
     * Helper method to calculate percentage
     */
    calPercentage(amount: number, percentage: number): number {
        return (amount * percentage) / 100;
    }

    /**
     * Helper method to format decimal
     */
    getDecimalFormat(value: number): string {
        const val = Number(value);
        if (isNaN(val)) return '0.00';
        return val.toFixed(2);
    }

    /**
     * Helper method to get percent sign
     */
    percentSign(): string {
        return '%';
    }

    /**
     * Generate discount duration note HTML
     */
    private generateDiscountDurationNote(durationType: string | null, durationMonths: number | null, remainingMonths: number | null): string {
        if (!durationType) {
            return '';
        }

        let noteText = '';
        let noteColor = '#6b7280';

        if (durationType === 'forever') {
            noteText = 'Discount applies to all future payments';
            noteColor = '#10b981'; // green
        } else if (durationType === 'first_payment') {
            noteText = 'Discount applied to this payment only';
            noteColor = '#f59e0b'; // amber
        } else if (durationType === 'limited_months' && durationMonths) {
            if (remainingMonths !== null && remainingMonths !== undefined) {
                noteText = `Discount valid for ${remainingMonths} more payment${remainingMonths === 1 ? '' : 's'} (of ${durationMonths} total)`;
            } else {
                noteText = `Discount valid for ${durationMonths} payment${durationMonths === 1 ? '' : 's'}`;
            }
            noteColor = '#3b82f6'; // blue
        }

        if (!noteText) {
            return '';
        }

        return `<div style="display: table; width: 100%; padding: 2px 0 6px; font-size: 11px; color: ${noteColor};">
                        <div style="display: table-cell; text-align: left; font-style: italic; padding-left: 10px;">ℹ ${noteText}</div>
                    </div>`;
    }

    /**
     * Generate subscription invoice PDF
     * @param payload Invoice data containing subscription, user, and plan information
     * @returns Path to the generated PDF file
     */
    async generateSubscriptionInvoice(payload: any = null): Promise<string> {
        try {
            this.logger.log(`Generating invoice for subscription: ${payload?.full_inv_number}`);

            // Fetch company/invoice information from environment variables
            const invoiceCompanyName = this.configService.get<string>('INVOICE_COMPANY_NAME') || this.MAIL_FROM_NAME || '';
            const invoiceCompanyEmail = this.configService.get<string>('INVOICE_COMPANY_EMAIL') || '';
            const invoiceVatNumber = this.configService.get<string>('INVOICE_VAT_NUMBER') || '';
            const invoiceCompanyContact = this.configService.get<string>('INVOICE_COMPANY_CONTACT') || '';
            const invoiceCompanyAddress1 = this.configService.get<string>('INVOICE_COMPANY_ADDRESS1') || '';
            const invoiceCompanyAddress2 = this.configService.get<string>('INVOICE_COMPANY_ADDRESS2') || '';
            const invoiceCompanyCounty = this.configService.get<string>('INVOICE_COMPANY_COUNTY') || '';
            const invoiceCompanyTown = this.configService.get<string>('INVOICE_COMPANY_TOWN') || '';
            const invoiceCompanyPostcode = this.configService.get<string>('INVOICE_COMPANY_POSTCODE') || '';
            const tax_label = this.configService.get<string>('TAX_LABEL') || 'VAT';

            // Payment information
            const paymentInfoMethod = this.configService.get<string>('INVOICE_PAYMENT_METHOD') || 'Payment Method via PayPal';
            const paymentInfoCompany = this.MAIL_FROM_NAME;

            // Format invoice date
            const invDate = this.getTransformDate(new Date(payload?.date || new Date()), 'dd-mm-yyyy');
            const invoiceNumber = payload?.full_inv_number || '';
            // Get currency from STRIPE_CURRENCY env variable
            const stripeCurrency = this.configService.get<string>('stripe.currency') || 'USD';
            const currencySign = this.currencySign(stripeCurrency.toUpperCase());

            // Extract data from payload
            const user = payload?.user || {};
            const plan = payload?.plan || {};
            const taxValue = payload?.tax_value || 0;
            const specialPrice = payload?.special_price || 0;
            const discountPrice = parseFloat(payload?.discount_price || 0);
            const tools = payload?.tools || [];

            // Calculate item details
            const itemDiscount = discountPrice;
            const itemName = plan?.name || payload?.description || 'N/A';
            let itemPrice = parseFloat(payload?.price || 0);

            if (specialPrice) {
                itemPrice = specialPrice;
            }

            let itemFinalPrice = itemPrice;
            // if (discountPrice) {
            //     itemFinalPrice = Math.max(itemFinalPrice - discountPrice, 0);
            // }

            const itemTaxAmount = taxValue;//this.calPercentage(itemFinalPrice, taxValue);
            const itemTotalAmount = itemFinalPrice;// + itemTaxAmount;

            // Calculate grand totals
            const grandTotalAmount = itemTotalAmount;
            const grandTaxAmount = itemTaxAmount;
            const grandFinalAmount = grandTotalAmount + itemTaxAmount;

            // Get locations info
            const locations = payload?.locations || 1;

            // Extract discount duration info
            const discountCode = payload?.discount_code || null;
            const discountName = payload?.discount_name || null;
            const discountDurationType = payload?.discount_duration_type || null;
            const discountDurationMonths = payload?.discount_duration_months || null;
            const discountRemainingMonths = payload?.discount_remaining_months || null;

            // Generate HTML content
            const html = this.generateInvoiceHTML({
                invoiceCompanyName,
                invoiceCompanyEmail,
                invoiceVatNumber,
                invoiceCompanyContact,
                invoiceCompanyAddress1,
                invoiceCompanyAddress2,
                invoiceCompanyCounty,
                invoiceCompanyTown,
                invoiceCompanyPostcode,
                tax_label,
                tools,
                paymentInfoMethod,
                paymentInfoCompany,
                invDate,
                invoiceNumber,
                currencySign,
                user,
                itemName,
                itemPrice,
                itemDiscount,
                itemTaxAmount,
                taxValue,
                itemTotalAmount,
                grandTotalAmount,
                grandTaxAmount,
                grandFinalAmount,
                planPrice: payload?.plan_price || 0,
                locations,
                discountCode,
                discountName,
                discountDurationType,
                discountDurationMonths,
                discountRemainingMonths,
            });

            // Generate PDF
            const pdfBuffer = await htmlToPdf.generatePdf(
                { content: html },
                { format: 'A4' }
            );

            // Define paths
            const invoiceDir = path.join(process.cwd(), 'public', 'invoices');
            const invoiceFile = path.join(invoiceDir, payload?.inv_path || `invoice-${Date.now()}.pdf`);

            this.logger.log(`Saving invoice to: ${invoiceFile}`);

            // Ensure directory exists
            if (!fs.existsSync(invoiceDir)) {
                fs.mkdirSync(invoiceDir, { recursive: true });
            }

            // Write PDF file
            fs.writeFileSync(invoiceFile, pdfBuffer);

            this.logger.log(`Invoice generated successfully: ${invoiceFile}`);
            return invoiceFile;
        } catch (error) {
            this.logger.error(`Error generating invoice: ${error.message}`, error.stack);
            throw error;
        }
    }

    /**
     * Generate HTML content for invoice
     */
    private generateInvoiceHTML(data: any): string {
        const {
            invoiceCompanyName,
            invoiceCompanyEmail,
            invoiceVatNumber,
            invoiceCompanyContact,
            invoiceCompanyAddress1,
            invoiceCompanyAddress2,
            invoiceCompanyCounty,
            invoiceCompanyTown,
            invoiceCompanyPostcode,
            tax_label,
            paymentInfoMethod,
            paymentInfoCompany,
            invDate,
            invoiceNumber,
            currencySign,
            user,
            tools,
            itemName,
            itemPrice,
            itemDiscount,
            itemTaxAmount,
            taxValue,
            itemTotalAmount,
            grandTotalAmount,
            grandTaxAmount,
            grandFinalAmount,
            planPrice,
            locations,
            discountCode,
            discountName,
            discountDurationType,
            discountDurationMonths,
            discountRemainingMonths,
        } = data;
        const taxLabelValue = Number(this.configService.get<number>('TAX_VALUE') || '0');

        // Use production logo URL for consistent display across environments
        const logoUrl = this.configService.get<string>('INVOICE_LOGO_URL') || process.env.INVOICE_LOGO_URL || '';

        // `(${this.getDecimalFormat(taxValue)}${this.percentSign()})`

        let html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <title>Invoice ${invoiceNumber}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            color: #1a1a1a;
            line-height: 1.6;
            background-color: #f8f9fa;
        }
        @page {
            size: A4;
            margin: 0;
        }
        @media print {
            body {
                background-color: white;
            }
            .invoice-container {
                box-shadow: none;
                margin: 0;
                page-break-after: avoid;
            }
        }
        .invoice-container {
            max-width: 850px;
            margin: 20px auto;
            background: white;
            box-shadow: 0 0 20px rgba(0,0,0,0.06);
            page-break-inside: avoid;
        }
        .invoice-header {
            padding: 20px 40px 18px;
            border-bottom: 3px solid #7367f0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
        }
        .invoice-header-content {
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .company-logo {
            max-width: 400px;
            max-height: 280px;
            height: auto;
            background: white;
            padding: 10px;
            border-radius: 6px;
        }
        .invoice-title {
            text-align: right;
        }
        .invoice-title h1 {
            font-size: 24px;
            font-weight: 700;
            margin-bottom: 4px;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        .invoice-title p {
            font-size: 13px;
            opacity: 0.95;
            font-weight: 500;
            margin: 2px 0;
        }
        .invoice-body {
            padding: 25px 40px;
        }
        .parties-section {
            display: flex;
            justify-content: space-between;
            margin-bottom: 25px;
            gap: 30px;
        }
        .party-info {
            flex: 1;
        }
        .party-info h3 {
            font-size: 11px;
            text-transform: uppercase;
            color: #7367f0;
            font-weight: 700;
            letter-spacing: 0.5px;
            margin-bottom: 8px;
        }
        .party-info p {
            font-size: 13px;
            color: #4a5568;
            line-height: 1.6;
            margin: 0;
        }
        .party-info .name {
            font-size: 15px;
            font-weight: 600;
            color: #1a1a1a;
            margin-bottom: 6px;
        }
        .items-table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
        }
        .items-table thead {
            background: #f8f9fa;
        }
        .items-table th {
            padding: 10px 10px;
            text-align: left;
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            color: #4a5568;
            letter-spacing: 0.5px;
            border-bottom: 2px solid #e2e8f0;
        }
        .items-table th:last-child {
            text-align: right;
        }
        .items-table td {
            padding: 12px 10px;
            font-size: 13px;
            border-bottom: 1px solid #f1f3f5;
            color: #1a1a1a;
        }
        .items-table td:last-child {
            text-align: right;
            font-weight: 600;
        }
        .item-description {
            font-weight: 500;
        }
        .sub-item {
            font-size: 12px;
            color: #6b7280;
            margin-left: 10px;
            display: block;
            margin-top: 3px;
        }
        .totals-section {
            margin-top: 20px;
            border-top: 2px solid #e2e8f0;
            padding-top: 15px;
        }
        .total-row {
            display: flex;
            justify-content: space-between;
            padding: 6px 0;
            font-size: 13px;
        }
        .total-row.subtotal {
            color: #6b7280;
        }
        .total-row.grand-total {
            font-size: 16px;
            font-weight: 700;
            color: #1a1a1a;
            padding-top: 12px;
            border-top: 2px solid #e2e8f0;
            margin-top: 8px;
        }
        .total-row .label {
            font-weight: 500;
        }
        .total-row .value {
            font-weight: 600;
        }
        .payment-status {
            display: inline-block;
            background: linear-gradient(135deg, #10b981 0%, #059669 100%);
            color: white;
            padding: 8px 18px;
            border-radius: 6px;
            font-weight: 700;
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-top: 12px;
            box-shadow: 0 3px 10px rgba(16, 185, 129, 0.25);
        }
        .payment-info {
            margin-top: 25px;
            padding: 16px 20px;
            background: #f8f9fa;
            border-radius: 6px;
            border-left: 4px solid #7367f0;
        }
        .payment-info h3 {
            font-size: 12px;
            font-weight: 700;
            color: #1a1a1a;
            margin-bottom: 8px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .payment-info p {
            font-size: 12px;
            color: #4a5568;
            margin: 3px 0;
        }
        .invoice-footer {
            padding: 20px 40px;
            background: #f8f9fa;
            border-top: 1px solid #e2e8f0;
        }
        .footer-text {
            font-size: 11px;
            color: #6b7280;
            text-align: center;
            line-height: 1.6;
        }
        .footer-text strong {
            color: #1a1a1a;
            font-weight: 600;
        }
    </style>
</head>
<body>
    <div class="invoice-container">
        <!-- Header -->
        <div class="invoice-header">
            <div class="invoice-header-content" style="display: table; width: 100%;">
                <div style="display: table-cell; vertical-align: middle;">
                    <img src="${logoUrl}" alt="Company Logo" class="company-logo"/>
                </div>
                <div style="display: table-cell; vertical-align: middle; text-align: right;">
                    <div class="invoice-title">
                        <h1>INVOICE</h1>
                        <p><strong>#${invoiceNumber}</strong></p>
                        <p>Date: ${invDate}</p>
                    </div>
                </div>
            </div>
        </div>

        <!-- Body -->
        <div class="invoice-body">
            <!-- Parties Section -->
            <div class="parties-section" style="display: table; width: 100%; margin-bottom: 25px;">
                <div class="party-info" style="display: table-cell; width: 50%; padding-right: 15px; vertical-align: top;">
                    <h3 style="font-size: 11px; text-transform: uppercase; color: #7367f0; font-weight: 700; letter-spacing: 0.5px; margin-bottom: 8px;">FROM</h3>
                    <p class="name" style="font-size: 15px; font-weight: 600; color: #1a1a1a; margin-bottom: 6px;">${invoiceCompanyName}</p>
                    ${invoiceCompanyAddress1 ? `<p style="font-size: 13px; color: #4a5568; line-height: 1.6; margin: 0;">${invoiceCompanyAddress1}${invoiceCompanyAddress2 ? ', ' + invoiceCompanyAddress2 : ''}</p>` : ''}
                    ${invoiceCompanyTown ? `<p style="font-size: 13px; color: #4a5568; line-height: 1.6; margin: 0;">${invoiceCompanyTown}, ${invoiceCompanyCounty} ${invoiceCompanyPostcode}</p>` : ''}
                    ${invoiceCompanyContact ? `<p style="font-size: 13px; color: #4a5568; line-height: 1.6; margin: 0;">Tel: ${invoiceCompanyContact}</p>` : ''}
                    ${invoiceCompanyEmail ? `<p style="font-size: 13px; color: #4a5568; line-height: 1.6; margin: 0;">Email: ${invoiceCompanyEmail}</p>` : ''}
                    ${invoiceVatNumber ? `<p style="font-size: 13px; color: #4a5568; line-height: 1.6; margin: 0;">VAT No: ${invoiceVatNumber}</p>` : ''}
                </div>
                <div class="party-info" style="display: table-cell; width: 50%; padding-left: 15px; vertical-align: top;">
                    <h3 style="font-size: 11px; text-transform: uppercase; color: #7367f0; font-weight: 700; letter-spacing: 0.5px; margin-bottom: 8px;">BILL TO</h3>
                    <p class="name" style="font-size: 15px; font-weight: 600; color: #1a1a1a; margin-bottom: 6px;">${user?.name || 'N/A'}</p>
                    ${user?.email ? `<p style="font-size: 13px; color: #4a5568; line-height: 1.6; margin: 0;">Email: ${user.email}</p>` : ''}
                    ${user?.mobile ? `<p style="font-size: 13px; color: #4a5568; line-height: 1.6; margin: 0;">Phone: +${user.mobile}</p>` : ''}
                </div>
            </div>

            <!-- Items Table -->
            <table class="items-table">
                <thead>
                    <tr>
                        <th style="width: 55%;">Description</th>
                        <th style="width: 20%;">Price</th>
                        <th style="width: 12%;">${tax_label}</th>
                        <th style="width: 13%; text-align: right;">Amount</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>
                            <div class="item-description">${itemName}</div>
                            ${locations > 0 ? `<span class="sub-item" style="color: #7367f0; font-weight: 500;">• ${locations} ${locations === 1 ? 'Location' : 'Locations'}</span>` : ''}
                            ${tools && tools.length > 0 ? tools.map((tool: any) =>
                                `<span class="sub-item">• ${tool.name}${tool.pricing_mode === 'multiplier' ? ` (×${locations})` : ''}</span>`
                            ).join('') : ''}
                        </td>
                        <td>
                            ${planPrice > 0 ? `<div>${currencySign}${this.getDecimalFormat(planPrice)}</div>` : ''}
                            ${tools && tools.length > 0 ? tools.map((tool: any) =>
                                `<div style="margin-top: 3px; font-size: 12px; color: #6b7280;">${currencySign}${this.getDecimalFormat(tool.calculated_price || tool.base_price || 0)}</div>`
                            ).join('') : ''}
                        </td>
                        <td>${currencySign}${this.getDecimalFormat(itemTaxAmount)}</td>
                        <td style="text-align: right;">${currencySign}${this.getDecimalFormat(itemTotalAmount)}</td>
                    </tr>
                </tbody>
            </table>

            <!-- Totals Section -->
            <div class="totals-section" style="margin-top: 20px; border-top: 2px solid #e2e8f0; padding-top: 15px;">
                <div style="max-width: 320px; margin-left: auto;">
                    <div class="total-row subtotal" style="display: table; width: 100%; padding: 6px 0; font-size: 13px; color: #6b7280;">
                        <div class="label" style="display: table-cell; text-align: left; font-weight: 500;">Subtotal</div>
                        <div class="value" style="display: table-cell; text-align: right; font-weight: 600;">${currencySign}${this.getDecimalFormat(itemTotalAmount)}</div>
                    </div>
                    <div class="total-row subtotal" style="display: table; width: 100%; padding: 6px 0; font-size: 13px; color: #6b7280;">
                        <div class="label" style="display: table-cell; text-align: left; font-weight: 500;">Discount${discountName ? ` (${discountName})` : ''}${discountCode ? ` - ${discountCode}` : ''}</div>
                        <div class="value" style="display: table-cell; text-align: right; font-weight: 600;">-${currencySign}${this.getDecimalFormat(itemDiscount)}</div>
                    </div>
                    ${this.generateDiscountDurationNote(discountDurationType, discountDurationMonths, discountRemainingMonths)}
                    <div class="total-row subtotal" style="display: table; width: 100%; padding: 6px 0; font-size: 13px; color: #6b7280;">
                        <div class="label" style="display: table-cell; text-align: left; font-weight: 500;">${tax_label} (${this.getDecimalFormat(taxLabelValue)}%)</div>
                        <div class="value" style="display: table-cell; text-align: right; font-weight: 600;">${currencySign}${this.getDecimalFormat(grandTaxAmount)}</div>
                    </div>
                    <div class="total-row grand-total" style="display: table; width: 100%; padding: 12px 0 6px; border-top: 2px solid #e2e8f0; margin-top: 8px; font-size: 16px; font-weight: 700; color: #1a1a1a;">
                        <div class="label" style="display: table-cell; text-align: left; font-weight: 700;">Grand Total</div>
                        <div class="value" style="display: table-cell; text-align: right; font-weight: 700; color: #7367f0;">${currencySign}${this.getDecimalFormat(grandFinalAmount)}</div>
                    </div>
                </div>

                <div style="text-align: right; margin-top: 12px;">
                    <span class="payment-status">✓ PAYMENT RECEIVED</span>
                </div>
            </div>

            <!-- Payment Details -->
            <div class="payment-info">
                <h3>Payment Information</h3>
                <p><strong>Method:</strong> ${paymentInfoMethod}</p>
                <p><strong>Processed by:</strong> ${paymentInfoCompany}</p>
                <p><strong>Status:</strong> <span style="color: #10b981; font-weight: 600;">Paid in Full</span></p>
            </div>
        </div>

        <!-- Footer -->
        <div class="invoice-footer" style="padding: 20px 40px; background: #f8f9fa; border-top: 1px solid #e2e8f0;">
            <div class="footer-text" style="font-size: 11px; color: #6b7280; text-align: center; line-height: 1.6;">
                <p style="margin: 0;"><strong style="color: #1a1a1a; font-weight: 600;">Thank you for your business!</strong></p>
                <p style="margin: 6px 0 0;">
                    If you have any questions about this invoice, please contact us at
                    <strong style="color: #1a1a1a; font-weight: 600;">${invoiceCompanyEmail}</strong> or <strong style="color: #1a1a1a; font-weight: 600;">${invoiceCompanyContact}</strong>
                </p>
                <p style="margin: 8px 0 0; font-size: 10px; color: #9ca3af;">
                    This is a computer-generated invoice and does not require a physical signature.
                </p>
            </div>
        </div>
    </div>
</body>
</html>`;

        return html;
    }
}
