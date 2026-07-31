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
import { PriceListBulkCreateRequestDto } from '../dtos/request/price-list.bulk-create.request.dto';
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

    @Response('priceList.create')
    @AuthJwtAccessProtected()
    @Post('/bulk')
    async bulkCreate(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('user') userId: string,
        @Body() body: PriceListBulkCreateRequestDto
    ): Promise<IResponse<{ created: number }>> {
        const created = await this.priceListService.bulkCreate(
            companyId,
            body.items,
            userId
        );
        return { data: { created } };
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
        @Query('search') searchRaw?: string,
        @Query('current') current?: string
    ): Promise<IResponsePaging<PriceListGetResponseDto>> {
        const currentOnly = current === '1' || current === 'true';
        const find: any = {};
        if (companyId) find.company_id = companyId;
        if (vendorId) find.vendor_id = vendorId;
        if (productId) find.product_id = productId;
        if (currencyId) find.currency_id = currencyId;
        // Current-only: never look past today's effective rows.
        if (currentOnly) {
            find.effective_date = {
                $lte: new Date().toISOString().slice(0, 10),
            };
        }

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

        // Current-only mode: reduce to the latest price per (vendor, product),
        // drop explicitly-expired rows, order by product (then vendor), and
        // paginate in memory. Used by the product-centric price-list view.
        if (currentOnly) {
            const today = new Date().toISOString().slice(0, 10);
            const allRows = await this.priceListRepository.findAll(find, {
                order: {
                    effective_date: 'desc' as any,
                    createdAt: 'desc' as any,
                },
            });
            // First occurrence per (vendor, product) wins (rows are desc by date).
            const seen = new Set<string>();
            const latest: any[] = [];
            for (const r of allRows as any[]) {
                const k = `${r.vendor_id?.toString()}|${r.product_id?.toString()}`;
                if (seen.has(k)) continue;
                seen.add(k);
                if (r.valid_until && String(r.valid_until).slice(0, 10) < today) {
                    continue; // explicitly expired
                }
                latest.push(r);
            }
            const mapped = await this.priceListService.mapList(latest);
            mapped.sort((a, b) => {
                const pa = (a.product_code || a.product_name || '').toLowerCase();
                const pb = (b.product_code || b.product_name || '').toLowerCase();
                if (pa !== pb) return pa < pb ? -1 : 1;
                const va = (a.vendor_name || '').toLowerCase();
                const vb = (b.vendor_name || '').toLowerCase();
                return va < vb ? -1 : va > vb ? 1 : 0;
            });
            const total = mapped.length;
            const data = mapped.slice(_offset, _offset + _limit);
            return {
                _pagination: { total, totalPage: Math.ceil(total / _limit) },
                data,
            };
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
        // Vendor PICKER source for the costing worksheet — return every vendor
        // that has a price for this product (one row per vendor), exactly like
        // the price-list listing. No date window: effective_date / valid_until
        // are not used as gating concepts here, so a future- or oddly-dated
        // effective_date can no longer hide a vendor.
        const rows = await this.priceListRepository.findAll(
            {
                company_id: companyId,
                product_id: productId,
            } as any,
            { order: { effective_date: 'desc' as any } }
        );
        // Rows are ordered effective_date desc, so the first row seen per
        // vendor is its latest price.
        const byVendor = new Map<string, any>();
        for (const r of rows as any[]) {
            const key = r.vendor_id?.toString();
            if (key && !byVendor.has(key)) byVendor.set(key, r);
        }
        // Cheapest first — compared in the home currency (INR) so a foreign
        // price (e.g. $37 = ₹3,071) is ranked fairly against ₹ prices, not by
        // raw number. Rows whose currency has no →INR rate are ranked last.
        const result = await this.priceListService.mapListWithInrCompare(
            Array.from(byVendor.values())
        );
        return { data: result };
    }

    @Response('priceList.byProducts')
    @AuthJwtAccessProtected()
    @Get('/vendors-by-products')
    async vendorsByProducts(
        @AuthJwtPayload('companyId') companyId: string,
        @Query('product_ids') productIdsRaw?: string
    ): Promise<IResponse<Record<string, PriceListGetResponseDto[]>>> {
        // Batch version of by-product: one request returns { productId: vendors[] }
        // for many products at once. The costing worksheet uses this so a 30-row
        // import doesn't fire 30 concurrent by-product calls (which could fail
        // under load and leave a vendor dropdown permanently empty). Same
        // semantics as by-product: latest row per vendor, no date window.
        const productIds = (productIdsRaw || '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
        if (!productIds.length) return { data: {} };

        const rows = await this.priceListRepository.findAll(
            {
                company_id: companyId,
                product_id: { $in: productIds },
            } as any,
            { order: { effective_date: 'desc' as any } }
        );
        // Group by product → latest row per vendor (rows are effective_date desc,
        // so the first seen per (product, vendor) is the current price).
        const perProduct = new Map<string, Map<string, any>>();
        for (const r of rows as any[]) {
            const pid = r.product_id?.toString();
            const vid = r.vendor_id?.toString();
            if (!pid || !vid) continue;
            if (!perProduct.has(pid)) perProduct.set(pid, new Map());
            const vmap = perProduct.get(pid)!;
            if (!vmap.has(vid)) vmap.set(vid, r);
        }
        // Map all survivors once, then regroup by product and sort cheapest-first.
        const survivors: any[] = [];
        for (const vmap of perProduct.values())
            survivors.push(...vmap.values());
        const mapped = await this.priceListService.mapList(survivors);
        const result: Record<string, PriceListGetResponseDto[]> = {};
        for (const m of mapped) {
            const pid = (m as any).product_id?.toString();
            if (!pid) continue;
            (result[pid] = result[pid] || []).push(m);
        }
        for (const pid of Object.keys(result)) {
            result[pid].sort(
                (a, b) => Number(a.unit_price || 0) - Number(b.unit_price || 0)
            );
        }
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

    @Response('priceList.delete')
    @AuthJwtAccessProtected()
    @Post('/delete-many')
    async deleteMany(
        @Body() body: { ids: string[] }
    ): Promise<IResponse<{ deleted: string[]; skipped: any[] }>> {
        const ids = body?.ids;
        if (!Array.isArray(ids) || ids.length === 0) {
            throw new BadRequestException('ids array is required');
        }
        const data = await this.priceListService.deleteMany(ids);
        return { data };
    }
}
