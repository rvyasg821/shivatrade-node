import { Injectable } from '@nestjs/common';
import { PdfService } from '@common/pdf/pdf.service';
import { FileService } from '@common/file/services/file.service';
import { DashboardExportRequestDto } from '../dtos/request/dashboard-export.request.dto';

const esc = (v: any) =>
    String(v ?? '').replace(
        /[&<>"']/g,
        (c) =>
            (
                ({
                    '&': '&amp;',
                    '<': '&lt;',
                    '>': '&gt;',
                    '"': '&quot;',
                    "'": '&#39;',
                }) as any
            )[c]
    );

@Injectable()
export class DashboardExportService {
    constructor(
        private readonly pdfService: PdfService,
        private readonly fileService: FileService
    ) {}

    /** Styled-free, plain-xlsx summary — matches the Closing Inventory export
     * pattern (a report-style export, not a per-document Sales/Purchase doc,
     * so it stays off the xlsx-js-style dependency). */
    renderExcel(body: DashboardExportRequestDto): {
        buffer: Buffer;
        filename: string;
    } {
        const aoa: any[][] = [];
        aoa.push(['ShivaTrade Dashboard Summary']);
        aoa.push([body.companyName, body.locationName || '']);
        aoa.push([`Period: ${body.periodLabel}`]);
        aoa.push([]);

        aoa.push(['KPIs']);
        for (const c of body.kpis || []) {
            aoa.push([c.label, c.value, c.sub || '']);
        }
        aoa.push([]);

        aoa.push(['Needs Attention']);
        for (const c of body.attention || []) {
            aoa.push([c.label, c.value, c.sub || '']);
        }
        aoa.push([]);

        aoa.push(['Counts']);
        for (const c of body.counts || []) {
            aoa.push([c.label, c.value]);
        }
        aoa.push([]);

        aoa.push(['Top Customers']);
        aoa.push(['#', 'Customer', 'Invoices', 'Amount']);
        (body.topCustomers || []).forEach((r, i) => {
            aoa.push([i + 1, r.name, r.invoices, r.amount]);
        });
        aoa.push([]);

        aoa.push(['Top Products']);
        aoa.push(['#', 'Product', 'Qty', 'Amount']);
        (body.topProducts || []).forEach((r, i) => {
            aoa.push([i + 1, r.name, r.qty, r.amount]);
        });

        const buffer = this.fileService.writeExcelFromArray(aoa as any);
        return {
            buffer,
            filename: `Dashboard-Summary-${Date.now()}.xlsx`,
        };
    }

    async renderPdf(
        body: DashboardExportRequestDto
    ): Promise<{ buffer: Buffer; filename: string }> {
        const cardRows = (cards: any[]) =>
            (cards || [])
                .map(
                    (c) => `
            <tr>
                <td class="lbl">${esc(c.label)}</td>
                <td class="val">${esc(c.value)}${
                        c.sub ? `<div class="sub">${esc(c.sub)}</div>` : ''
                    }</td>
            </tr>`
                )
                .join('');

        const customerRows = (body.topCustomers || [])
            .map(
                (r, i) => `
            <tr>
                <td>${i + 1}</td>
                <td>${esc(r.name)}</td>
                <td class="num">${esc(r.invoices)}</td>
                <td class="num">${esc(r.amount)}</td>
            </tr>`
            )
            .join('');

        const productRows = (body.topProducts || [])
            .map(
                (r, i) => `
            <tr>
                <td>${i + 1}</td>
                <td>${esc(r.name)}</td>
                <td class="num">${esc(r.qty)}</td>
                <td class="num">${esc(r.amount)}</td>
            </tr>`
            )
            .join('');

        const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; color: #1e2a3a; margin: 0; padding: 24px; }
    h1 { font-size: 18px; color: #1e3a5f; margin: 0 0 2px; }
    .meta { color: #6b7280; font-size: 11px; margin-bottom: 18px; }
    h2 { font-size: 13px; color: #1e3a5f; border-bottom: 1px solid #dbe3ec; padding-bottom: 4px; margin: 18px 0 8px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
    td, th { padding: 5px 8px; font-size: 11px; border-bottom: 1px solid #eef1f5; text-align: left; }
    th { background: #f4f7fa; color: #55606b; font-weight: 600; }
    td.lbl { color: #45505c; width: 55%; }
    td.val { font-weight: 700; color: #1e3a5f; text-align: right; }
    td.num { text-align: right; }
    .sub { font-weight: 400; font-size: 10px; color: #82868b; }
    .section { display: inline-block; width: 49%; vertical-align: top; }
</style>
</head>
<body>
    <h1>${esc(body.companyName)}</h1>
    <div class="meta">${esc(body.locationName || '')} &middot; Dashboard Summary &middot; Period: ${esc(
            body.periodLabel
        )} &middot; Generated ${new Date().toLocaleString('en-IN')}</div>

    <div class="section">
        <h2>KPIs</h2>
        <table><tbody>${cardRows(body.kpis)}</tbody></table>
    </div>
    <div class="section" style="margin-left: 2%;">
        <h2>Needs Attention</h2>
        <table><tbody>${cardRows(body.attention)}</tbody></table>
    </div>

    <h2>Counts</h2>
    <table><tbody>${cardRows(body.counts)}</tbody></table>

    <h2>Top Customers</h2>
    <table>
        <thead><tr><th>#</th><th>Customer</th><th>Invoices</th><th>Amount</th></tr></thead>
        <tbody>${customerRows || '<tr><td colspan="4">No data</td></tr>'}</tbody>
    </table>

    <h2>Top Products</h2>
    <table>
        <thead><tr><th>#</th><th>Product</th><th>Qty</th><th>Amount</th></tr></thead>
        <tbody>${productRows || '<tr><td colspan="4">No data</td></tr>'}</tbody>
    </table>
</body>
</html>`;

        const buffer = await this.pdfService.generateFromHtml(html, {
            format: 'A4',
        });
        return {
            buffer,
            filename: `Dashboard-Summary-${Date.now()}.pdf`,
        };
    }
}
