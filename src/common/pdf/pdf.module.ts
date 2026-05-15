import { Global, Module } from '@nestjs/common';
import { PdfService } from './pdf.service';

/**
 * Generic Puppeteer-based PDF generator. Global so any feature module can
 * inject `PdfService` without re-importing PdfModule.
 */
@Global()
@Module({
    providers: [PdfService],
    exports: [PdfService],
})
export class PdfModule {}
