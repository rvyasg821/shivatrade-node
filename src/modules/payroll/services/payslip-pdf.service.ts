import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import puppeteer from 'puppeteer';
import { PayslipService } from './payslip.service';
import { PayRunRepository } from '../repository/repositories/pay-run.repository';
import { CompanyService } from '@modules/company/services/company.service';
import { docDate } from '@common/pdf/tally-pdf.util';
import { PayslipEntity } from '../repository/entities/payslip.entity';
import { PayslipLineItemEntity } from '../repository/entities/payslip-line-item.entity';
import { ENUM_LINE_ITEM_TYPE } from '../enums/payroll.enum';

@Injectable()
export class PayslipPdfService {
    private readonly logger = new Logger(PayslipPdfService.name);

    constructor(
        private readonly payslipService: PayslipService,
        private readonly payRunRepo: PayRunRepository,
        private readonly companyService: CompanyService,
    ) {}

    /**
     * Generate a UK-style payslip PDF for a single payslip.
     */
    async generate(payslipId: string): Promise<{ buffer: Buffer; filename: string }> {
        const payslip = await this.payslipService.findOneById(payslipId);
        const lineItems = await this.payslipService.getLineItems(payslipId);
        const payRun = (await this.payRunRepo.findOneById(payslip.pay_run_id)) as any;
        const company = await this.companyService.findOneById(payslip.company_id).catch(() => null);

        const html = this.renderHtml(payslip, lineItems, payRun, company);
        const buffer = await this.htmlToPdf(html);

        const safeName = (payslip.employee_name || 'employee')
            .replace(/[^a-z0-9]+/gi, '-')
            .toLowerCase();
        const periodLabel = payRun?.period_end
            ? new Date(payRun.period_end).toISOString().slice(0, 10)
            : 'period';
        const filename = `payslip-${safeName}-${periodLabel}.pdf`;

        return { buffer, filename };
    }

    private async htmlToPdf(html: string): Promise<Buffer> {
        let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;
        try {
            const launchOptions: any = {
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu',
                    '--font-render-hinting=none',
                ],
            };
            if (process.env.PUPPETEER_EXECUTABLE_PATH) {
                launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
            }
            browser = await puppeteer.launch(launchOptions);
            const page = await browser.newPage();
            await page.setContent(html, { waitUntil: 'networkidle0' as any, timeout: 30000 });
            const pdfBuffer = await page.pdf({
                format: 'A4',
                margin: { top: '15mm', bottom: '15mm', left: '15mm', right: '15mm' },
                printBackground: true,
            });
            return Buffer.from(pdfBuffer);
        } catch (err: any) {
            this.logger.error(`Payslip PDF generation failed: ${err?.message}`);
            throw new InternalServerErrorException(
                `Payslip PDF generation failed: ${err?.message || err}`,
            );
        } finally {
            if (browser) {
                await browser.close().catch(() => { /* ignore */ });
            }
        }
    }

    private renderHtml(
        payslip: PayslipEntity,
        lineItems: PayslipLineItemEntity[],
        payRun: any,
        company: any,
    ): string {
        const earnings = lineItems.filter(i => i.type === ENUM_LINE_ITEM_TYPE.EARNING);
        const deductions = lineItems.filter(i => i.type === ENUM_LINE_ITEM_TYPE.DEDUCTION);

        const fmt = (n: number | string | undefined) => {
            const num = Number(n) || 0;
            const symbol = this.currencySymbol(payslip.currency || 'GBP');
            return `${symbol}${num.toFixed(2)}`;
        };
        // DD-MM-YYYY, same as every other printed document. Was en-GB, which
        // renders with slashes (03/06/2026) — close, but not the same format.
        const fmtDate = (d: any) => (d ? docDate(d) : '—');

        const renderRow = (label: string, amount: number | string | undefined) =>
            `<tr><td>${this.escape(label)}</td><td class="right">${fmt(amount)}</td></tr>`;

        const earningsRows = earnings.length
            ? earnings.map(i => renderRow(i.label, i.amount)).join('')
            : '<tr><td colspan="2" class="muted">No earnings</td></tr>';
        const deductionsRows = deductions.length
            ? deductions.map(i => renderRow(i.label, i.amount)).join('')
            : '<tr><td colspan="2" class="muted">No deductions</td></tr>';

        const companyName = this.escape(company?.company_name || 'Company');
        const companyAddress = [
            company?.address_1,
            company?.city,
            company?.zipcode,
            company?.country,
        ]
            .filter(Boolean)
            .map(x => this.escape(String(x)))
            .join(', ');
        const payeRef = company?.paye_reference || '';

        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Payslip — ${this.escape(payslip.employee_name || '')}</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #333; margin: 0; padding: 0; }
  .container { padding: 0; }
  h1 { font-size: 18px; margin: 0 0 4px; color: #09418B; }
  h2 { font-size: 12px; margin: 16px 0 6px; color: #09418B; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #09418B; padding-bottom: 4px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; padding: 12px 18px; background: #f4f5f7; border-bottom: 3px solid #09418B; }
  .header .left { max-width: 60%; }
  .header .right { text-align: right; font-size: 10px; color: #666; }
  .header .meta { margin-top: 4px; color: #666; font-size: 10px; }
  .body { padding: 14px 18px; }
  .grid { display: flex; gap: 18px; margin-bottom: 12px; }
  .grid .col { flex: 1; }
  .label { color: #888; font-size: 9px; text-transform: uppercase; letter-spacing: 0.4px; }
  .value { font-weight: 600; font-size: 11px; margin-bottom: 6px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  th, td { padding: 5px 6px; border-bottom: 1px solid #e8e8e8; text-align: left; vertical-align: top; }
  th { background: #f4f5f7; font-size: 10px; text-transform: uppercase; letter-spacing: 0.4px; color: #555; }
  td.right, th.right { text-align: right; }
  .muted { color: #999; font-style: italic; }
  .totals { background: #fafbfd; }
  .totals td { font-weight: 600; }
  .grand { background: #09418B; color: #fff; }
  .grand td { font-weight: 700; padding: 7px 6px; }
  .ytd { background: #fff; border: 1px solid #e0e0e0; padding: 8px 10px; margin-top: 12px; border-radius: 3px; font-size: 10px; color: #555; }
  .ytd strong { color: #333; }
  .footer { margin-top: 14px; padding: 8px 18px; font-size: 9px; color: #888; text-align: center; border-top: 1px solid #eee; }
</style>
</head>
<body>
<div class="container">

  <div class="header">
    <div class="left">
      <h1>${companyName}</h1>
      <div class="meta">${companyAddress}</div>
      ${payeRef ? `<div class="meta">PAYE Reference: ${this.escape(payeRef)}</div>` : ''}
    </div>
    <div class="right">
      <div style="font-size:14px;font-weight:700;color:#09418B;">PAYSLIP</div>
      <div class="meta">Pay Date: <strong>${fmtDate(payRun?.pay_date)}</strong></div>
      <div class="meta">Period: ${fmtDate(payRun?.period_start)} → ${fmtDate(payRun?.period_end)}</div>
    </div>
  </div>

  <div class="body">

    <div class="grid">
      <div class="col">
        <div class="label">Employee</div>
        <div class="value">${this.escape(payslip.employee_name || '')}</div>
        ${payslip.employee_code ? `<div class="label">Employee Code</div><div class="value">${this.escape(payslip.employee_code)}</div>` : ''}
      </div>
      <div class="col">
        <div class="label">Tax Code</div>
        <div class="value">${this.escape(payslip.tax_code || '—')}</div>
        <div class="label">NI Category</div>
        <div class="value">${this.escape(payslip.ni_category || '—')}</div>
      </div>
      <div class="col">
        <div class="label">Hours Worked</div>
        <div class="value">${Number(payslip.hours_worked).toFixed(2)} h</div>
        ${Number(payslip.overtime_hours) > 0 ? `<div class="label">Overtime</div><div class="value">${Number(payslip.overtime_hours).toFixed(2)} h</div>` : ''}
      </div>
    </div>

    <h2>Earnings</h2>
    <table>
      <thead><tr><th>Description</th><th class="right">Amount</th></tr></thead>
      <tbody>
        ${earningsRows}
      </tbody>
      <tfoot>
        <tr class="totals"><td>Gross Pay</td><td class="right">${fmt(payslip.gross_pay)}</td></tr>
      </tfoot>
    </table>

    <h2>Deductions</h2>
    <table>
      <thead><tr><th>Description</th><th class="right">Amount</th></tr></thead>
      <tbody>
        ${deductionsRows}
      </tbody>
      <tfoot>
        <tr class="totals"><td>Total Deductions</td><td class="right">${fmt(payslip.total_deductions)}</td></tr>
      </tfoot>
    </table>

    <table>
      <tr class="grand">
        <td>NET PAY</td>
        <td class="right">${fmt(payslip.net_pay)}</td>
      </tr>
    </table>

    <div class="ytd">
      <strong>Year to Date (current tax year):</strong>
      &nbsp;&nbsp; Gross: <strong>${fmt(payslip.ytd_gross)}</strong>
      &nbsp;&nbsp; Taxable Gross: <strong>${fmt(payslip.ytd_taxable_gross)}</strong>
      &nbsp;&nbsp; Tax: <strong>${fmt(payslip.ytd_tax)}</strong>
      &nbsp;&nbsp; NI: <strong>${fmt(payslip.ytd_ni)}</strong>
      &nbsp;&nbsp; Pension: <strong>${fmt(payslip.ytd_pension_employee)}</strong>
      &nbsp;&nbsp; Net: <strong>${fmt(payslip.ytd_net)}</strong>
    </div>

    ${payslip.account_number ? `
    <div class="ytd">
      <strong>Payment to:</strong>
      ${this.escape(payslip.account_holder_name || '')}
      ${payslip.sort_code ? ` &nbsp;Sort code: <strong>${this.escape(payslip.sort_code)}</strong>` : ''}
      ${payslip.account_number ? ` &nbsp;Account: <strong>${this.escape(payslip.account_number)}</strong>` : ''}
    </div>
    ` : ''}

  </div>

  <div class="footer">
    This is a computer-generated payslip. Please retain for your records.
  </div>

</div>
</body>
</html>`;
    }

    private currencySymbol(code: string): string {
        const map: Record<string, string> = {
            GBP: '£',
            USD: '$',
            EUR: '€',
            INR: '₹',
            AUD: 'A$',
            CAD: 'C$',
        };
        return map[code] || code + ' ';
    }

    private escape(s: string | null | undefined): string {
        if (s == null) return '';
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
}
