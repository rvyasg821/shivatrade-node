import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { Response as ExpressResponse } from 'express';
import { ApiTags, ApiQuery } from '@nestjs/swagger';
import {
    AuthJwtAccessProtected,
    AuthJwtPayload,
} from '@modules/auth/decorators/auth.jwt.decorator';
import {
    Response,
    ResponsePaging,
} from '@common/response/decorators/response.decorator';
import {
    IResponse,
    IResponsePaging,
} from '@common/response/interfaces/response.interface';
import { PaginationQuery } from '@common/pagination/decorators/pagination.decorator';
import { PaginationListDto } from '@common/pagination/dtos/pagination.list.dto';
import {
    LedgerService,
    LedgerRegisterRow,
} from '../services/ledger.service';
import { LedgerResponseDto } from '../dtos/response/ledger.response.dto';

/**
 * Party ledgers (clients #9 / #10) — read-only projection. Customer ledger in
 * the customer's currency; vendor ledger in INR. Company-scoped by JWT.
 */
@ApiTags('admin.ledger')
@Controller({ version: '1', path: '/admin/ledger' })
export class LedgerAdminController {
    constructor(private readonly ledgerService: LedgerService) {}

    /**
     * Combined party-transaction register for the Adjustment Notes listing —
     * adjustment notes + vendor payments + customer receipts in one list.
     */
    @ResponsePaging('ledger.register')
    @AuthJwtAccessProtected()
    @ApiQuery({ name: 'party_type', required: false })
    @ApiQuery({ name: 'party_id', required: false })
    @ApiQuery({ name: 'direction', required: false })
    @ApiQuery({ name: 'date_from', required: false })
    @ApiQuery({ name: 'date_to', required: false })
    @ApiQuery({ name: 'search', required: false })
    @Get('/register')
    async register(
        @AuthJwtPayload('companyId') companyId: string,
        @PaginationQuery() { _limit, _offset }: PaginationListDto,
        @Query('party_type') partyType?: string,
        @Query('party_id') partyId?: string,
        @Query('direction') direction?: string,
        @Query('date_from') dateFrom?: string,
        @Query('date_to') dateTo?: string,
        @Query('search') search?: string
    ): Promise<IResponsePaging<LedgerRegisterRow>> {
        const { data, total } = await this.ledgerService.register(companyId, {
            party_type: partyType,
            party_id: partyId,
            direction,
            date_from: dateFrom,
            date_to: dateTo,
            search,
            limit: _limit,
            offset: _offset,
        });
        return {
            data,
            _pagination: { total, totalPage: Math.ceil(total / (_limit || 25)) },
        };
    }

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
