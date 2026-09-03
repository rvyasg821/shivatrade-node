import {
    Injectable,
    InternalServerErrorException,
    Logger,
    OnModuleDestroy,
} from '@nestjs/common';
import puppeteer from 'puppeteer';

type PuppeteerBrowser = Awaited<ReturnType<typeof puppeteer.launch>>;
type PuppeteerPage = Awaited<ReturnType<PuppeteerBrowser['newPage']>>;

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
 * Singleton browser: one Chromium process shared across requests (launched
 * lazily on first use, relaunched if it crashes/disconnects), each request
 * only pays for a `newPage()`/`page.close()`. Avoids a ~500ms-1s+ cold start
 * per PDF that a launch-per-request approach paid every time.
 */
@Injectable()
export class PdfService implements OnModuleDestroy {
    private readonly logger = new Logger(PdfService.name);
    private browserPromise: Promise<PuppeteerBrowser> | null = null;

    /** Returns the shared browser, launching it on first use or relaunching
     *  it if the previous instance crashed/disconnected. */
    private async getBrowser(): Promise<PuppeteerBrowser> {
        if (this.browserPromise) {
            const browser = await this.browserPromise;
            if (browser.connected) return browser;
            this.browserPromise = null;
        }
        this.browserPromise = puppeteer.launch(this.launchOptions());
        return this.browserPromise;
    }

    async onModuleDestroy(): Promise<void> {
        if (!this.browserPromise) return;
        try {
            const browser = await this.browserPromise;
            await browser.close();
        } catch {
            // ignore close errors on shutdown
        }
    }

    /** Render the given HTML string into a PDF. */
    async generateFromHtml(
        html: string,
        options: PdfRenderOptions = {}
    ): Promise<Buffer> {
        let page: PuppeteerPage | null = null;
        try {
            const browser = await this.getBrowser();
            page = await browser.newPage();
            await page.setContent(html, {
                waitUntil: 'networkidle0' as any,
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
            if (page) {
                try {
                    await page.close();
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
        let page: PuppeteerPage | null = null;
        try {
            const browser = await this.getBrowser();
            page = await browser.newPage();
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
            if (page) {
                try {
                    await page.close();
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
