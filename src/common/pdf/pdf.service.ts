import {
    Injectable,
    InternalServerErrorException,
    Logger,
} from '@nestjs/common';
import puppeteer from 'puppeteer';

export interface PdfRenderOptions {
    format?: 'A4' | 'Letter';
    landscape?: boolean;
    /** Page margins. Defaults: 15mm all sides. */
    margin?: {
        top?: string;
        right?: string;
        bottom?: string;
        left?: string;
    };
    /** When true, headerTemplate / footerTemplate are rendered on every page. */
    displayHeaderFooter?: boolean;
    /** Puppeteer header HTML — supports `<span class="title"></span>` etc. */
    headerTemplate?: string;
    /** Puppeteer footer HTML — typically includes `<span class="pageNumber"></span>`. */
    footerTemplate?: string;
}

/**
 * Generic Puppeteer wrapper. Reusable for PFI, Commercial Invoice,
 * Packing List, PO PDFs.
 *
 * v1: one browser per request. Acceptable cold start ~500ms. Switch to a
 * singleton browser pool later if throughput becomes an issue.
 */
@Injectable()
export class PdfService {
    private readonly logger = new Logger(PdfService.name);

    /** Render the given HTML string into a PDF. */
    async generateFromHtml(
        html: string,
        options: PdfRenderOptions = {}
    ): Promise<Buffer> {
        let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;
        try {
            browser = await puppeteer.launch(this.launchOptions());
            const page = await browser.newPage();
            await page.setContent(html, {
                waitUntil: 'networkidle0',
                timeout: 30000,
            });
            const buf = await page.pdf({
                format: options.format || 'A4',
                landscape: !!options.landscape,
                printBackground: true,
                displayHeaderFooter: !!options.displayHeaderFooter,
                headerTemplate: options.headerTemplate || '<span></span>',
                footerTemplate: options.footerTemplate || '<span></span>',
                margin: {
                    top: options.margin?.top || '15mm',
                    right: options.margin?.right || '15mm',
                    bottom: options.margin?.bottom || '15mm',
                    left: options.margin?.left || '15mm',
                },
            });
            return Buffer.from(buf);
        } catch (err) {
            this.logger.error('PDF generation failed', err as any);
            throw new InternalServerErrorException(
                'Failed to generate PDF document'
            );
        } finally {
            if (browser) {
                try {
                    await browser.close();
                } catch {
                    // ignore close errors
                }
            }
        }
    }

    /**
     * Navigate to a URL and render the response into a PDF. Useful when the
     * page being printed is served by the front-end app (and we want the
     * same renderer to feed both web view and PDF).
     */
    async generateFromUrl(
        url: string,
        options: PdfRenderOptions = {}
    ): Promise<Buffer> {
        let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;
        try {
            browser = await puppeteer.launch(this.launchOptions());
            const page = await browser.newPage();
            await page.goto(url, {
                waitUntil: 'networkidle0',
                timeout: 30000,
            });
            const buf = await page.pdf({
                format: options.format || 'A4',
                landscape: !!options.landscape,
                printBackground: true,
                displayHeaderFooter: !!options.displayHeaderFooter,
                headerTemplate: options.headerTemplate || '<span></span>',
                footerTemplate: options.footerTemplate || '<span></span>',
                margin: {
                    top: options.margin?.top || '15mm',
                    right: options.margin?.right || '15mm',
                    bottom: options.margin?.bottom || '15mm',
                    left: options.margin?.left || '15mm',
                },
            });
            return Buffer.from(buf);
        } catch (err) {
            this.logger.error(`PDF render of ${url} failed`, err as any);
            throw new InternalServerErrorException(
                'Failed to generate PDF document'
            );
        } finally {
            if (browser) {
                try {
                    await browser.close();
                } catch {
                    // ignore close errors
                }
            }
        }
    }

    private launchOptions(): any {
        const opts: any = {
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
            opts.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
        }
        return opts;
    }
}
