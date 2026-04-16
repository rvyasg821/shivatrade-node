import { Injectable, InternalServerErrorException } from '@nestjs/common';
import puppeteer from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class ContractPdfService {
    /**
     * Converts an HTML string to a PDF Buffer using Puppeteer.
     *
     * Extracts .page-header and .page-footer from the HTML body and renders
     * them via Puppeteer's native displayHeaderFooter so they:
     *  - appear on every page
     *  - have a fixed height
     *  - never overlap with body content
     */
    async generatePdf(html: string): Promise<Buffer> {
        // Inline local logo images as base64 so Puppeteer doesn't need network
        html = this.inlineLocalImages(html);
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
            // Allow server to specify Chrome path via env var
            if (process.env.PUPPETEER_EXECUTABLE_PATH) {
                launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
            }
            browser = await puppeteer.launch(launchOptions);

            const page = await browser.newPage();

            // Extract header / footer from HTML, return cleaned body
            const { bodyHtml, headerTemplate, footerTemplate } = this.extractHeaderFooter(html);

            await page.setContent(bodyHtml, { waitUntil: 'networkidle0', timeout: 30000 });

            const pdfBuffer = await page.pdf({
                format: 'A4',
                margin: {
                    top: '30mm',     // space for header
                    bottom: '20mm',  // space for footer
                    left: '15mm',
                    right: '15mm',
                },
                printBackground: true,
                displayHeaderFooter: true,
                headerTemplate,
                footerTemplate,
            });

            return Buffer.from(pdfBuffer);
        } catch (err) {
            throw new InternalServerErrorException(
                `PDF generation failed: ${err?.message || err}`,
            );
        } finally {
            if (browser) {
                await browser.close().catch(() => { /* ignore close errors */ });
            }
        }
    }

    /**
     * Parse the full HTML document, extract the .page-header and .page-footer
     * content, build Puppeteer-compatible header/footer templates, and return
     * the cleaned body HTML without those elements.
     */
    private extractHeaderFooter(html: string): {
        bodyHtml: string;
        headerTemplate: string;
        footerTemplate: string;
    } {
        let headerInner = '';
        let footerInner = '';
        let bodyHtml = html;

        // ── Extract header (contains nested divs, so use marker-based extraction) ──
        const headerOpenTag = '<div class="page-header">';
        const contentOpenTag = '<div class="content">';
        const headerStart = html.indexOf(headerOpenTag);
        const contentStart = html.indexOf(contentOpenTag);

        if (headerStart !== -1 && contentStart > headerStart) {
            const afterHeaderTag = headerStart + headerOpenTag.length;
            // Find the closing </div> just before <div class="content">
            const closingDiv = html.lastIndexOf('</div>', contentStart);
            if (closingDiv > afterHeaderTag) {
                headerInner = html.substring(afterHeaderTag, closingDiv).trim();
            }
            // Remove the entire header block from body
            bodyHtml = bodyHtml.substring(0, headerStart) + bodyHtml.substring(contentStart);
        }

        // ── Extract footer (simple text, no nested divs) ──
        const footerRegex = /<div class="page-footer">([\s\S]*?)<\/div>\s*<\/body>/i;
        const footerMatch = bodyHtml.match(footerRegex);
        if (footerMatch) {
            footerInner = footerMatch[1].trim();
            // Remove footer from body
            bodyHtml = bodyHtml.replace(footerMatch[0], '</body>');
        }

        // ── Build Puppeteer headerTemplate ──
        // Puppeteer header/footer templates must be self-contained HTML with inline styles.
        // Font size defaults to 0 so it must be explicitly set.
        const headerTemplate = headerInner
            ? `<div style="width:100%;display:flex;align-items:center;justify-content:space-between;padding:8px 30px 6px;border-bottom:2px solid #333;font-family:Arial,Helvetica,sans-serif;font-size:10px;box-sizing:border-box;">
                ${headerInner}
               </div>`
            : '<span></span>';

        // ── Build Puppeteer footerTemplate ──
        // All info centered in one line, fixed height
        const footerTemplate = footerInner
            ? `<div style="width:100%;text-align:center;border-top:1px solid #ccc;padding:6px 30px;font-family:Arial,Helvetica,sans-serif;font-size:8px;color:#777;box-sizing:border-box;">
                ${footerInner}
               </div>`
            : '<span></span>';

        return { bodyHtml, headerTemplate, footerTemplate };
    }

    /**
     * Convert local /assets/ image URLs to base64 data URIs
     * so Puppeteer renders them without needing network access.
     * Handles logos (/assets/logos/) and signatures (/assets/signatures/).
     */
    private inlineLocalImages(html: string): string {
        // Match src="http://...host.../assets/subdir/filename" or src="/assets/subdir/filename"
        return html.replace(
            /src="(?:https?:\/\/[^/]+)?\/assets\/((?:logos|signatures)\/[^"]+)"/g,
            (match, relativePath) => {
                try {
                    const filePath = path.join(process.cwd(), 'public', relativePath);
                    if (fs.existsSync(filePath)) {
                        const buffer = fs.readFileSync(filePath);
                        const ext = path.extname(relativePath).toLowerCase().replace('.', '');
                        const mime = ext === 'svg' ? 'image/svg+xml'
                            : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
                            : ext === 'webp' ? 'image/webp'
                            : 'image/png';
                        return `src="data:${mime};base64,${buffer.toString('base64')}"`;
                    }
                } catch { /* fall through to original */ }
                return match;
            }
        );
    }
}
