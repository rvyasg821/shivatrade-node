import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Param,
    Query,
    Res,
} from '@nestjs/common';
import { Response as ExpressResponse } from 'express';
import { ApiTags } from '@nestjs/swagger';
import {
    AuthJwtAccessProtected,
    AuthJwtPayload,
} from '@modules/auth/decorators/auth.jwt.decorator';
import { Response } from '@common/response/decorators/response.decorator';
import { IResponse } from '@common/response/interfaces/response.interface';

import { RfqService } from '../services/rfq.service';
import {
    RfqAddVendorsDto,
    RfqCreateFromLeadDto,
    RfqSelectPriceDto,
    RfqSetPricesDto,
    RfqUpdateDto,
} from '../dtos/request/rfq.request.dto';
import {
    RfqGetResponseDto,
    RfqListResponseDto,
} from '../dtos/response/rfq.response.dto';

@ApiTags('admin.rfq')
@Controller({ version: '1', path: '/admin/rfq' })
export class RfqAdminController {
    constructor(private readonly rfqService: RfqService) {}

    @Response('rfq.create')
    @AuthJwtAccessProtected()
    @Post('/from-lead/:leadId')
    async createFromLead(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('user') userId: string,
        @Param('leadId') leadId: string,
        @Body() body: RfqCreateFromLeadDto
    ): Promise<IResponse<RfqGetResponseDto>> {
        const rfq = await this.rfqService.createFromLead(
            companyId,
            leadId,
            body,
            userId
        );
        return { data: await this.rfqService.mapGet(companyId, rfq._id.toString()) };
    }

    @Response('rfq.list')
    @AuthJwtAccessProtected()
    @Get('/list')
    async list(
        @AuthJwtPayload('companyId') companyId: string,
        @Query('lead_id') leadId?: string
    ): Promise<IResponse<RfqListResponseDto[]>> {
        const find: any = {};
        if (leadId) find.lead_id = leadId;
        const data = await this.rfqService.list(companyId, { find });
        return { data };
    }

    @Response('rfq.get')
    @AuthJwtAccessProtected()
    @Get('/get/:id')
    async get(
        @AuthJwtPayload('companyId') companyId: string,
        @Param('id') id: string
    ): Promise<IResponse<RfqGetResponseDto>> {
        return { data: await this.rfqService.mapGet(companyId, id) };
    }

    @Response('rfq.update')
    @AuthJwtAccessProtected()
    @Put('/update/:id')
    async update(
        @AuthJwtPayload('companyId') companyId: string,
        @Param('id') id: string,
        @Body() body: RfqUpdateDto
    ): Promise<IResponse<RfqGetResponseDto>> {
        await this.rfqService.update(companyId, id, body);
        return { data: await this.rfqService.mapGet(companyId, id) };
    }

    @Response('rfq.delete')
    @AuthJwtAccessProtected()
    @Delete('/delete/:id')
    async remove(
        @AuthJwtPayload('companyId') companyId: string,
        @Param('id') id: string
    ): Promise<IResponse<{ deleted: boolean }>> {
        await this.rfqService.softDelete(companyId, id);
        return { data: { deleted: true } };
    }

    @Response('rfq.vendors')
    @AuthJwtAccessProtected()
    @Post('/:id/vendors')
    async addVendors(
        @AuthJwtPayload('companyId') companyId: string,
        @Param('id') id: string,
        @Body() body: RfqAddVendorsDto
    ): Promise<IResponse<RfqGetResponseDto>> {
        await this.rfqService.addVendors(companyId, id, body);
        return { data: await this.rfqService.mapGet(companyId, id) };
    }

    @Response('rfq.vendors')
    @AuthJwtAccessProtected()
    @Delete('/:id/vendors/:vendorId')
    async removeVendor(
        @AuthJwtPayload('companyId') companyId: string,
        @Param('id') id: string,
        @Param('vendorId') vendorId: string
    ): Promise<IResponse<RfqGetResponseDto>> {
        await this.rfqService.removeVendor(companyId, id, vendorId);
        return { data: await this.rfqService.mapGet(companyId, id) };
    }

    @Response('rfq.prices')
    @AuthJwtAccessProtected()
    @Post('/:id/prices')
    async setPrices(
        @AuthJwtPayload('companyId') companyId: string,
        @Param('id') id: string,
        @Body() body: RfqSetPricesDto
    ): Promise<IResponse<RfqGetResponseDto>> {
        await this.rfqService.setPrices(companyId, id, body);
        return { data: await this.rfqService.mapGet(companyId, id) };
    }

    @Response('rfq.select')
    @AuthJwtAccessProtected()
    @Post('/:id/select')
    async selectPrice(
        @AuthJwtPayload('companyId') companyId: string,
        @Param('id') id: string,
        @Body() body: RfqSelectPriceDto
    ): Promise<IResponse<RfqGetResponseDto>> {
        await this.rfqService.selectPrice(companyId, id, body);
        return { data: await this.rfqService.mapGet(companyId, id) };
    }

    @AuthJwtAccessProtected()
    @Get('/:id/pdf')
    async pdf(
        @AuthJwtPayload('companyId') companyId: string,
        @Param('id') id: string,
        @Query('vendor_id') vendorId: string | undefined,
        @Res() res: ExpressResponse
    ): Promise<void> {
        const { buffer, filename } = await this.rfqService.generatePdf(
            companyId,
            id,
            vendorId
        );
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="${filename}"`
        );
        res.setHeader('Content-Length', buffer.length);
        res.end(buffer);
    }
}
