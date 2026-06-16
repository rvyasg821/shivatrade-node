import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Param,
    Query,
    UploadedFile,
    Res,
    BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { Response as ExpressResponse } from 'express';
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
import { IFile } from '@common/file/interfaces/file.interface';

import { PriceListService } from '../services/price-list.service';
import { PriceListImportExportService } from '../services/price-list.import-export.service';
import { PriceListRepository } from '../repository/repositories/price-list.repository';
import { VendorRepository } from '@modules/vendor/repository/repositories/vendor.repository';
import { ProductRepository } from '@modules/product/repository/repositories/product.repository';
import { PriceListCreateRequestDto } from '../dtos/request/price-list.create.request.dto';
import { PriceListUpdateRequestDto } from '../dtos/request/price-list.update.request.dto';
import { PriceListGetResponseDto } from '../dtos/response/price-list.get.response.dto';

@ApiTags('admin.priceList')
@Controller({ version: '1', path: '/admin/price-list' })
export class PriceListAdminController {
    constructor(
        private readonly priceListService: PriceListService,
        private readonly priceListRepository: PriceListRepository,
        private readonly importExportService: PriceListImportExportService,
        private readonly vendorRepository: VendorRepository,
        private readonly productRepository: ProductRepository
    ) {}

    // ============ IMPORT / EXPORT ============

    @AuthJwtAccessProtected()
    @Get('/sample-excel')
    @ApiOperation({ summary: 'Download sample Excel for price-list import' })
    async downloadSampleExcel(
        @Res() res: ExpressResponse,
        @Query('vendor_id') vendorId?: string,
    ) {
        const buffer = this.importExportService.generateSampleExcel(vendorId);
        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader(
            'Content-Disposition',
            'attachment; filename="price-list-import-sample.xlsx"'
        );
        res.end(buffer);
    }

    @AuthJwtAccessProtected()
    @Get('/export')
    @ApiOperation({ summary: 'Export price-list as Excel' })
    async exportExcel(
        @AuthJwtPayload('companyId') companyId: string,
        @Res() res: ExpressResponse,
        @Query('vendor_id') vendorId?: string,
    ) {
        const buffer = await this.importExportService.exportPriceLists(
            companyId,
            vendorId,
        );
        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="price-list-${
                new Date().toISOString().split('T')[0]
            }.xlsx"`
        );
        res.end(buffer);
    }

    @ApiConsumes('multipart/form-data')
    @FileUploadSingle({ field: 'file', fileSize: 5 * 1024 * 1024 })
    @AuthJwtAccessProtected()
    @Post('/import')
    @ApiOperation({
        summary: 'Import price-list from Excel/CSV (preview or confirm)',
    })
    async importExcel(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('user') userId: string,
        @UploadedFile() file: IFile,
        @Query('preview') preview?: string,
        @Query('vendor_id') vendorId?: string,
    ) {
        if (!file) throw new BadRequestException('No file provided');

        const { summary, rows } =
            await this.importExportService.parseAndValidate(
                file.buffer,
                companyId,
                vendorId,
            );

        if (preview === 'true') {
            return {
                statusCode: 200,
                message: 'Preview',
                data: { summary, rows },
            };
        }

        const validRows = rows.filter((r) => r.status !== 'error');
        if (validRows.length === 0) {
            return {
                statusCode: 200,
                message: 'No valid rows to import',
                data: { summary, created: 0, updated: 0, errors: [] },
            };
        }

        const result = await this.importExportService.importPriceLists(
            validRows,
            companyId,
            userId
        );

        return {
            statusCode: 200,
            message: `Import complete: ${result.created} created, ${result.updated} updated`,
            data: { summary, ...result },
        };
    }

    @Response('priceList.create')
    @AuthJwtAccessProtected()
    @Post('/create')
    async create(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('user') userId: string,
        @Body() body: PriceListCreateRequestDto
    ): Promise<IResponse<PriceListGetResponseDto>> {
        const row = await this.priceListService.create(companyId, body, userId);
        return { data: await this.priceListService.mapGet(row) };
    }

    @ResponsePaging('priceList.list')
    @AuthJwtAccessProtected()
    @Get('/list')
    async list(
        @AuthJwtPayload('companyId') companyId: string,
        @PaginationQuery() { _search, _limit, _offset, _order }: PaginationListDto,
        @Query('vendor_id') vendorId?: string,
        @Query('product_id') productId?: string,
        @Query('currency_id') currencyId?: string,
        @Query('search') searchRaw?: string
    ): Promise<IResponsePaging<PriceListGetResponseDto>> {
        const find: any = {};
        if (companyId) find.company_id = companyId;
        if (vendorId) find.vendor_id = vendorId;
        if (productId) find.product_id = productId;
        if (currencyId) find.currency_id = currencyId;

        // PaginationSearchPipe doesn't populate `_search` without an
        // `availableSearch` option — fall back to the raw `search` query.
        const searchTerm =
            searchRaw?.trim() ||
            (_search && typeof _search === 'string' ? _search : null);

        if (searchTerm) {
            // Resolve term against vendor + product so the user can type a
            // vendor code, vendor name, product code or product name and have
            // matching rows surface. `notes` is also matched directly on the
            // price-list row.
            const [vendorMatches, productMatches] = await Promise.all([
                this.vendorRepository.findAll({
                    company_id: companyId,
                    soft_delete: false,
                    $or: [
                        { vendor_code: { $regex: searchTerm, $options: 'i' } },
                        { company_name: { $regex: searchTerm, $options: 'i' } },
                    ],
                } as any),
                this.productRepository.findAll({
                    company_id: companyId,
                    soft_delete: false,
                    $or: [
                        { code: { $regex: searchTerm, $options: 'i' } },
                        { name: { $regex: searchTerm, $options: 'i' } },
                    ],
                } as any),
            ]);
            const vendorIds = vendorMatches.map((v: any) => v._id.toString());
            const productIds = productMatches.map((p: any) => p._id.toString());

            // OR across whichever sources actually matched. Skipping empty
            // branches matters because `vendor_id` / `product_id` are uuid
            // columns — passing a sentinel like '__none__' makes Postgres
            // reject the query with an invalid-input-syntax error.
            const orBranches: any[] = [
                { notes: { $regex: searchTerm, $options: 'i' } },
            ];
            if (vendorIds.length) {
                orBranches.push({ vendor_id: { $in: vendorIds } });
            }
            if (productIds.length) {
                orBranches.push({ product_id: { $in: productIds } });
            }
            find.$or = orBranches;
        }

        const rows = await this.priceListRepository.findAll(find, {
            paging: { limit: _limit, offset: _offset },
            order: _order || { effective_date: 'desc' as any, createdAt: 'desc' as any },
        });

        const total = await this.priceListRepository.getTotal(find);
        return {
            _pagination: { total, totalPage: Math.ceil(total / _limit) },
            data: await this.priceListService.mapList(rows),
        };
    }

    @Response('priceList.byProduct')
    @AuthJwtAccessProtected()
    @Get('/by-product/:productId')
    async byProduct(
        @AuthJwtPayload('companyId') companyId: string,
        @Param('productId') productId: string
    ): Promise<IResponse<PriceListGetResponseDto[]>> {
        const today = new Date().toISOString().slice(0, 10);
        const rows = await this.priceListRepository.findAll(
            {
                company_id: companyId,
                product_id: productId,
                effective_date: { $lte: today },
            } as any,
            { order: { effective_date: 'desc' as any } }
        );
        const mapped = await this.priceListService.mapList(rows);
        // Filter out expired rows (where effective_until < today).
        const active = mapped.filter(
            (r) => !r.effective_until || r.effective_until >= today
        );
        // Keep the most recent row per vendor (first occurrence in desc order).
        const byVendor = new Map<string, PriceListGetResponseDto>();
        for (const r of active) {
            const key = (r as any).vendor_id?.toString();
            if (key && !byVendor.has(key)) byVendor.set(key, r);
        }
        // Sort: cheapest unit_price first.
        const result = Array.from(byVendor.values()).sort(
            (a, b) =>
                Number(a.unit_price || 0) - Number(b.unit_price || 0)
        );
        return { data: result };
    }

    // Current effective unit price for a vendor across a list of products.
    // Used by the RFQ draft builder to pre-fill a freshly-added vendor's grid
    // cells (mirrors the prefill that addVendors does when persisting).
    @AuthJwtAccessProtected()
    @Get('/current-prices')
    async currentPrices(
        @AuthJwtPayload('companyId') companyId: string,
        @Query('vendor_id') vendorId?: string,
        @Query('product_ids') productIdsRaw?: string
    ): Promise<
        IResponse<
            Array<{
                product_id: string;
                unit_price: string;
                effective_date: string | null;
            }>
        >
    > {
        const productIds = (productIdsRaw || '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
        if (!vendorId || !productIds.length) return { data: [] };

        const results: Array<{
            product_id: string;
            unit_price: string;
            effective_date: string | null;
        }> = [];
        for (const productId of productIds) {
            const row = await this.priceListRepository.findCurrentPrice(
                companyId,
                vendorId,
                productId
            );
            if (row && (row as any).unit_price != null) {
                results.push({
                    product_id: productId,
                    unit_price: String((row as any).unit_price),
                    // Drives the grid's greyed "last known · date" reference.
                    effective_date: (row as any).effective_date
                        ? String((row as any).effective_date)
                        : null,
                });
            }
        }
        return { data: results };
    }

    // Cheapest ACTIVE price per product across all vendors. Powers the
    // quotation-from-lead auto-pick: one winning (vendor, price) per line.
    // "Cheapest" = lowest EFFECTIVE price (unit_price × (1 − discount_pct/100)).
    // Tie-break: most recent effective_date, then shortest lead_time_days.
    // Returns the source trace (source_type / source_rfq_* ) so the line can
    // show a "from RFQ …" badge.
    @AuthJwtAccessProtected()
    @Get('/best-prices')
    async bestPrices(
        @AuthJwtPayload('companyId') companyId: string,
        @Query('product_ids') productIdsRaw?: string
    ): Promise<IResponse<any[]>> {
        const productIds = (productIdsRaw || '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
        if (!productIds.length) return { data: [] };

        const today = new Date().toISOString().slice(0, 10);
        const out: any[] = [];

        for (const productId of productIds) {
            const rows = await this.priceListRepository.findAll(
                {
                    company_id: companyId,
                    product_id: productId,
                    effective_date: { $lte: today },
                } as any,
                { order: { effective_date: 'desc' as any } }
            );
            const mapped = await this.priceListService.mapList(rows);
            // Active window only.
            const active = mapped.filter(
                (r) => !(r as any).effective_until || (r as any).effective_until >= today
            );
            if (!active.length) continue;

            const eff = (r: any) =>
                Number(r.unit_price || 0) *
                (1 - Number(r.discount_pct || 0) / 100);

            active.sort((a: any, b: any) => {
                const ea = eff(a);
                const eb = eff(b);
                if (ea !== eb) return ea - eb; // cheapest effective price
                // tie-break: newest effective_date
                const da = String(a.effective_date || '');
                const db = String(b.effective_date || '');
                if (da !== db) return da > db ? -1 : 1;
                // then shortest lead time
                return (
                    Number(a.lead_time_days || 999999) -
                    Number(b.lead_time_days || 999999)
                );
            });

            const best: any = active[0];
            out.push({
                product_id: productId,
                price_list_id: best._id,
                vendor_id: best.vendor_id,
                currency_id: best.currency_id,
                unit_price: String(best.unit_price ?? '0'),
                discount_pct:
                    best.discount_pct != null ? String(best.discount_pct) : '0',
                margin_pct:
                    best.margin_pct != null ? String(best.margin_pct) : null,
                effective_date: best.effective_date || null,
                valid_until: best.effective_until || null,
                source_type: best.source_type || 'manual',
                source_rfq_id: best.source_rfq_id || null,
                source_rfq_voucher_no: best.source_rfq_voucher_no || null,
            });
        }

        return { data: out };
    }

    @Response('priceList.get')
    @AuthJwtAccessProtected()
    @Get('/get/:priceListId')
    async get(
        @Param('priceListId') id: string
    ): Promise<IResponse<PriceListGetResponseDto>> {
        const row = await this.priceListService.findOneById(id);
        return { data: await this.priceListService.mapGet(row) };
    }

    @Response('priceList.update')
    @AuthJwtAccessProtected()
    @Put('/update/:priceListId')
    async update(
        @Param('priceListId') id: string,
        @Body() body: PriceListUpdateRequestDto
    ): Promise<IResponse<PriceListGetResponseDto>> {
        const row = await this.priceListService.findOneById(id);
        const updated = await this.priceListService.update(row, body);
        return { data: await this.priceListService.mapGet(updated) };
    }

    @Response('priceList.delete')
    @AuthJwtAccessProtected()
    @Delete('/delete/:priceListId')
    async delete(@Param('priceListId') id: string): Promise<void> {
        const row = await this.priceListService.findOneById(id);
        await this.priceListService.hardDelete(row);
    }
}
