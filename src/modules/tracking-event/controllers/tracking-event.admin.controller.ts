import {
    Controller,
    Get,
    Post,
    Delete,
    Body,
    Param,
    Query,
    UploadedFile,
    BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiQuery, ApiConsumes } from '@nestjs/swagger';
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
import { FileUploadSingle } from '@common/file/decorators/file.decorator';

import { TrackingEventService } from '../services/tracking-event.service';
import { TrackingEventFileService } from '../services/tracking-event-file.service';
import { TrackingEventCreateRequestDto } from '../dtos/request/tracking-event.create.request.dto';
import { TrackingEventDeleteRequestDto } from '../dtos/request/tracking-event.delete.request.dto';
import { TrackingEventGetResponseDto } from '../dtos/response/tracking-event.get.response.dto';

const ALLOWED_EXTS = new Set([
    'jpg',
    'jpeg',
    'png',
    'gif',
    'webp',
    'pdf',
    'heic',
]);

@ApiTags('admin.tracking-event')
@Controller({ version: '1', path: '/admin/tracking-event' })
export class TrackingEventAdminController {
    constructor(
        private readonly trackingService: TrackingEventService,
        private readonly fileService: TrackingEventFileService
    ) {}

    // ─── Cross-POV ops feed ─────────────────────────────────────────────

    @ResponsePaging('trackingEvent.list')
    @AuthJwtAccessProtected()
    @ApiQuery({ name: 'po_vendor_id', required: false, type: String })
    @ApiQuery({ name: 'purchase_order_id', required: false, type: String })
    @ApiQuery({ name: 'vendor_id', required: false, type: String })
    @ApiQuery({ name: 'event_type', required: false, type: String })
    @ApiQuery({ name: 'date_from', required: false, type: String })
    @ApiQuery({ name: 'date_to', required: false, type: String })
    @Get('/list')
    async list(
        @AuthJwtPayload('companyId') companyId: string,
        @PaginationQuery() { _search, _limit, _offset }: PaginationListDto,
        @Query('po_vendor_id') poVendorId?: string,
        @Query('purchase_order_id') purchaseOrderId?: string,
        @Query('vendor_id') vendorId?: string,
        @Query('event_type') eventType?: string,
        @Query('date_from') dateFrom?: string,
        @Query('date_to') dateTo?: string
    ): Promise<IResponsePaging<TrackingEventGetResponseDto>> {
        const perPage = _limit;
        const page = _offset && _limit ? Math.floor(_offset / _limit) + 1 : 1;
        const { rows, total } = await this.trackingService.listFeed({
            companyId,
            poVendorId,
            purchaseOrderId,
            vendorId,
            eventType,
            dateFrom,
            dateTo,
            search: _search as any,
            page,
            perPage,
        });
        return {
            _pagination: {
                total,
                totalPage: Math.ceil(total / (perPage || 1)),
            },
            data: await this.trackingService.mapList(rows),
        };
    }

    // ─── Timeline by POV ────────────────────────────────────────────────

    @Response('trackingEvent.listByPov')
    @AuthJwtAccessProtected()
    @Get('/by-pov/:povId')
    async listByPov(
        @AuthJwtPayload('companyId') companyId: string,
        @Param('povId') povId: string
    ): Promise<IResponse<TrackingEventGetResponseDto[]>> {
        const rows = await this.trackingService.listByPov(companyId, povId);
        return { data: await this.trackingService.mapList(rows) };
    }

    // ─── Create (multipart; single optional attachment) ─────────────────

    @Response('trackingEvent.create')
    @AuthJwtAccessProtected()
    @ApiConsumes('multipart/form-data')
    @FileUploadSingle({ field: 'attachment', fileSize: 15 * 1024 * 1024 })
    @Post('/')
    async create(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('user') userId: string,
        @Body() body: TrackingEventCreateRequestDto,
        @UploadedFile() file?: Express.Multer.File
    ): Promise<IResponse<TrackingEventGetResponseDto>> {
        let attachmentUrl: string | undefined;
        if (file && file.buffer && file.originalname) {
            const ext = (file.originalname.split('.').pop() || '').toLowerCase();
            if (!ALLOWED_EXTS.has(ext)) {
                throw new BadRequestException(
                    `Unsupported attachment type: .${ext}`
                );
            }
            attachmentUrl = await this.fileService.saveFile(
                file.buffer,
                file.originalname,
                companyId
            );
        }
        const row = await this.trackingService.create(
            companyId,
            userId,
            body,
            attachmentUrl
        );
        return { data: await this.trackingService.mapGet(row) };
    }

    // ─── Retract (soft-delete) — Option D ───────────────────────────────

    @Response('trackingEvent.delete')
    @AuthJwtAccessProtected()
    @Delete('/:id')
    async delete(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('user') userId: string,
        @Param('id') id: string,
        @Body() body: TrackingEventDeleteRequestDto
    ): Promise<IResponse<TrackingEventGetResponseDto>> {
        const row = await this.trackingService.softDelete(
            id,
            companyId,
            userId,
            body?.reason
        );
        return { data: await this.trackingService.mapGet(row) };
    }
}
