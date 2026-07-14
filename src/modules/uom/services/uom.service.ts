import {
    BadRequestException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';

import { UomRepository } from '../repository/repositories/uom.repository';
import { UomDoc, UomEntity } from '../repository/entities/uom.entity';
import { UomCreateRequestDto } from '../dtos/request/uom.create.request.dto';
import { UomUpdateRequestDto } from '../dtos/request/uom.update.request.dto';
import { UomDropdownDto, UomResponseDto } from '../dtos/response/uom.response.dto';
import { ENUM_UOM_STATUS } from '../enums/uom.enum';
import { ProductRepository } from '@modules/product/repository/repositories/product.repository';

@Injectable()
export class UomService {
    private readonly logger = new Logger(UomService.name);

    constructor(
        private readonly uomRepository: UomRepository,
        private readonly productRepository: ProductRepository
    ) {}

    /**
     * Validate a unit against the master. This is what REPLACED the old
     * `@IsEnum(ENUM_PRODUCT_UOM)` on the product DTO.
     *
     * Returns the CANONICAL code from the master, so "kg" typed into the Excel
     * import still stores "KG" — the import has always been case-insensitive and
     * every existing import file depends on that.
     *
     * Throws if the unit is unknown or inactive: without this, the master would
     * look like it worked and the product save would 400 anyway.
     */
    async resolveCode(rawCode: string): Promise<string> {
        const row = await this.uomRepository.findByCode(rawCode);
        if (!row) {
            const active = await this.uomRepository.findForDropdown();
            throw new BadRequestException(
                `Unit of measure '${rawCode}' is not in the UOM master. ` +
                    `Valid units: ${active.map((u) => u.code).join(', ')}`
            );
        }
        if (row.status !== ENUM_UOM_STATUS.ACTIVE) {
            throw new BadRequestException(
                `Unit of measure '${row.code}' is inactive. Re-activate it under Master → UOM, or pick another.`
            );
        }
        return row.code;
    }

    /** Every active unit, for validators and the Excel reference sheet. */
    async activeCodes(): Promise<string[]> {
        const rows = await this.uomRepository.findForDropdown();
        return rows.map((r) => r.code);
    }

    async create(data: UomCreateRequestDto): Promise<UomDoc> {
        // NOT uppercased. The codes are stored verbatim on every product and
        // line ("Nos", "Tonne" — mixed case on purpose), and forcing case here
        // would make the master disagree with the data it is supposed to
        // describe. Only whitespace is trimmed.
        const code = data.code.trim();

        if (await this.uomRepository.isCodeExists(code)) {
            throw new BadRequestException(`Unit '${code}' already exists`);
        }

        // Soft delete + a unique index that covers deleted rows: a deleted twin
        // still holds the slot, so re-adding it must revive rather than insert.
        const softDeleted = await this.uomRepository.findSoftDeleted(code);
        if (softDeleted) {
            const restored = await this.uomRepository.restore(softDeleted);
            return this.update(restored, data);
        }

        const create = new UomEntity();
        create.code = code;
        create.name = data.name?.trim() || undefined;
        create.uqc_code = data.uqc_code?.trim().toUpperCase() || undefined;
        create.allow_decimal = data.allow_decimal ?? true;
        create.sort_order = data.sort_order ?? 0;
        create.status = data.status || ENUM_UOM_STATUS.ACTIVE;

        const row = await this.uomRepository.create<UomEntity>(create);
        this.logger.log(`UOM created: ${row._id} (${code})`);
        return row;
    }

    async findOneById(id: string): Promise<UomDoc> {
        const row = await this.uomRepository.findOneById(id);
        if (!row || row.deleted) throw new NotFoundException('Unit not found');
        return row;
    }

    async update(row: UomDoc, data: UomUpdateRequestDto): Promise<UomDoc> {
        if (data.code) {
            const code = data.code.trim();
            if (code !== row.code) {
                if (
                    await this.uomRepository.isCodeExists(code, String(row._id))
                ) {
                    throw new BadRequestException(
                        `Unit '${code}' already exists`
                    );
                }
                // Renaming a code ORPHANS every product holding the old string —
                // there is no foreign key, the unit is loose text. Refuse it and
                // tell them to create a new unit instead.
                const inUse = await this.countInUse(row.code);
                if (inUse > 0) {
                    throw new BadRequestException(
                        `Cannot rename '${row.code}' — ${inUse} product(s) store it. ` +
                            `Create a new unit instead; renaming would leave those products with an unknown unit.`
                    );
                }
                row.code = code;
            }
        }

        if (data.name !== undefined) row.name = data.name?.trim() || undefined;
        if (data.uqc_code !== undefined) {
            row.uqc_code = data.uqc_code?.trim().toUpperCase() || undefined;
        }
        if (data.allow_decimal !== undefined) {
            row.allow_decimal = data.allow_decimal;
        }
        if (data.sort_order !== undefined) row.sort_order = data.sort_order;
        if (data.status) row.status = data.status;

        const updated = await this.uomRepository.save(row);
        this.logger.log(`UOM updated: ${row._id}`);
        return updated;
    }

    async softDelete(row: UomDoc): Promise<UomDoc> {
        return this.uomRepository.softDelete(row);
    }

    /**
     * How many products hold this unit. The delete guard — and the count shown
     * beside each row so the client can see what they are about to break.
     *
     * Products only. SO / POV / invoice lines also carry a `unit` string, but
     * those are historical documents: an issued invoice's unit must never change
     * regardless of what the master says, and blocking a delete on a five-year-old
     * invoice would make the master impossible to curate.
     */
    async countInUse(code: string): Promise<number> {
        return this.productRepository.getTotal({
            unit_of_measure: code,
            soft_delete: false,
        } as any);
    }

    async findForList(filters: {
        q?: string;
        status?: ENUM_UOM_STATUS;
        limit: number;
        offset: number;
    }): Promise<[UomResponseDto[], number]> {
        const [rows, total] = await this.uomRepository.findForList(filters);
        const mapped = await Promise.all(
            rows.map(async (r) => ({
                ...this.mapGet(r),
                in_use_count: await this.countInUse(r.code),
            }))
        );
        return [mapped, total];
    }

    async findForDropdown(): Promise<UomDropdownDto[]> {
        const rows = await this.uomRepository.findForDropdown();
        return rows.map((r) => ({
            _id: String(r._id),
            code: r.code,
            name: r.name || undefined,
            uqc_code: r.uqc_code || undefined,
            allow_decimal: r.allow_decimal,
        }));
    }

    mapGet(row: UomDoc): UomResponseDto {
        return {
            _id: String(row._id),
            code: row.code,
            name: row.name || undefined,
            uqc_code: row.uqc_code || undefined,
            allow_decimal: row.allow_decimal,
            sort_order: row.sort_order,
            status: row.status,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
        };
    }
}
