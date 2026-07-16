import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { Response as ExpressResponse } from 'express';
import { ApiTags, ApiQuery } from '@nestjs/swagger';
import {
    AuthJwtAccessProtected,
    AuthJwtPayload,
} from '@modules/auth/decorators/auth.jwt.decorator';
import { Response } from '@common/response/decorators/response.decorator';
import { IResponse } from '@common/response/interfaces/response.interface';
import { LedgerService } from '../services/ledger.service';
import { LedgerResponseDto } from '../dtos/response/ledger.response.dto';

/**
 * Party ledgers (clients #9 / #10) — read-only projection. Customer ledger in
 * the customer's currency; vendor ledger in INR. Company-scoped by JWT.
 */
@ApiTags('admin.ledger')
@Controller({ version: '1', path: '/admin/ledger' })
export class LedgerAdminController {
    constructor(private readonly ledgerService: LedgerService) {}

    @Response('ledger.customer')
    @AuthJwtAccessProtected()
    @ApiQuery({ name: 'from', required: false })
    @ApiQuery({ name: 'to', required: false })
    @Get('/customer/:id')
    async customer(
        @AuthJwtPayload('companyId') companyId: string,
        @Param('id') id: string,
        @Query('from') from?: string,
        @Query('to') to?: string
    ): Promise<IResponse<LedgerResponseDto>> {
        const data = await this.ledgerService.customerLedger(
            companyId,
            id,
            from,
            to
        );
        return { data };
    }

    @AuthJwtAccessProtected()
    @Get('/customer/:id/export')
    async customerExport(
        @AuthJwtPayload('companyId') companyId: string,
        @Param('id') id: string,
        @Res() res: ExpressResponse,
        @Query('from') from?: string,
        @Query('to') to?: string
    ): Promise<void> {
        const ledger = await this.ledgerService.customerLedger(
            companyId,
            id,
            from,
            to
        );
        const buf = await this.ledgerService.ledgerExcel(ledger);
        this.sendXlsx(res, buf, `customer-ledger-${id}`);
    }

    @Response('ledger.vendor')
    @AuthJwtAccessProtected()
    @ApiQuery({ name: 'from', required: false })
    @ApiQuery({ name: 'to', required: false })
    @Get('/vendor/:id')
    async vendor(
        @AuthJwtPayload('companyId') companyId: string,
        @Param('id') id: string,
        @Query('from') from?: string,
        @Query('to') to?: string
    ): Promise<IResponse<LedgerResponseDto>> {
        const data = await this.ledgerService.vendorLedger(
            companyId,
            id,
            from,
            to
        );
        return { data };
    }

    @AuthJwtAccessProtected()
    @Get('/vendor/:id/export')
    async vendorExport(
        @AuthJwtPayload('companyId') companyId: string,
        @Param('id') id: string,
        @Res() res: ExpressResponse,
        @Query('from') from?: string,
        @Query('to') to?: string
    ): Promise<void> {
        const ledger = await this.ledgerService.vendorLedger(
            companyId,
            id,
            from,
            to
        );
        const buf = await this.ledgerService.ledgerExcel(ledger);
        this.sendXlsx(res, buf, `vendor-ledger-${id}`);
    }

    private sendXlsx(
        res: ExpressResponse,
        buf: Buffer,
        name: string
    ): void {
        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="${name}.xlsx"`
        );
        res.setHeader('Content-Length', String(buf.length));
        res.end(buf);
    }
}
