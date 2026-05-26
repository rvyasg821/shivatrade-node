import {
    Injectable,
    Logger,
    BadRequestException,
    NotFoundException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';

import { PortMasterRepository } from '../repository/repositories/port-master.repository';
import { PortMasterDoc } from '../repository/entities/port-master.entity';
import { PortMasterCreateRequestDto } from '../dtos/request/port-master.create.request.dto';
import { PortMasterUpdateRequestDto } from '../dtos/request/port-master.update.request.dto';
import {
    PortMasterResponseDto,
    PortMasterDropdownDto,
} from '../dtos/response/port-master.response.dto';
import { ENUM_PORT_TYPE } from '../enums/port-master.enum';

@Injectable()
export class PortMasterService {
    private readonly logger = new Logger(PortMasterService.name);

    constructor(private readonly portMasterRepository: PortMasterRepository) {}

    async create(data: PortMasterCreateRequestDto): Promise<PortMasterDoc> {
        const code = data.code.trim().toUpperCase();
        if (await this.portMasterRepository.isCodeExists(code)) {
            throw new BadRequestException(
                `Port code '${code}' already exists`
            );
        }

        const row = await this.portMasterRepository.create({
            ...data,
            code,
            name: data.name.trim(),
            country_code: (data.country_code || 'IN').toUpperCase(),
        } as any);

        this.logger.log(`Port master created: ${row._id} (${code})`);
        return row;
    }

    async findOneById(id: string): Promise<PortMasterDoc> {
        const row = await this.portMasterRepository.findOneById(id);
        if (!row || row.soft_delete) {
            throw new NotFoundException('Port not found');
        }
        return row;
    }

    async findForDropdown(filters: {
        country_code?: string;
        types?: ENUM_PORT_TYPE[];
        q?: string;
    }): Promise<PortMasterDropdownDto[]> {
        const rows = await this.portMasterRepository.findForDropdown({
            country_code: filters.country_code,
            types: filters.types,
            q: filters.q,
            is_active: true,
        });
        return rows.map((r) => this.mapDropdown(r));
    }

    async update(
        row: PortMasterDoc,
        data: PortMasterUpdateRequestDto
    ): Promise<PortMasterDoc> {
        if (data.code) {
            const newCode = data.code.trim().toUpperCase();
            if (newCode !== row.code) {
                if (
                    await this.portMasterRepository.isCodeExists(
                        newCode,
                        row._id.toString()
                    )
                ) {
                    throw new BadRequestException(
                        `Port code '${newCode}' already exists`
                    );
                }
                data.code = newCode;
            } else {
                data.code = newCode;
            }
        }
        if (data.name) data.name = data.name.trim();
        if (data.country_code) data.country_code = data.country_code.toUpperCase();

        Object.assign(row, data);
        const updated = await this.portMasterRepository.save(row);
        this.logger.log(`Port master updated: ${row._id}`);
        return updated;
    }

    async softDelete(row: PortMasterDoc): Promise<PortMasterDoc> {
        row.soft_delete = true;
        row.is_active = false;
        const updated = await this.portMasterRepository.save(row);
        this.logger.log(`Port master soft-deleted: ${row._id}`);
        return updated;
    }

    /**
     * Idempotent upsert by `code` - used by the seed loader. Updates name /
     * type / state / country if the code already exists; creates otherwise.
     */
    async upsertByCode(data: PortMasterCreateRequestDto): Promise<PortMasterDoc> {
        const code = data.code.trim().toUpperCase();
        const existing = await this.portMasterRepository.findByCode(code);

        if (existing) {
            Object.assign(existing, {
                name: data.name.trim(),
                type: data.type,
                country_code: (data.country_code || 'IN').toUpperCase(),
                state: data.state ?? null,
                is_active: data.is_active ?? true,
                soft_delete: false,
            });
            return this.portMasterRepository.save(existing);
        }

        return this.create(data);
    }

    mapGet(row: PortMasterDoc): PortMasterResponseDto {
        return plainToInstance(PortMasterResponseDto, row);
    }

    mapList(rows: PortMasterDoc[]): PortMasterResponseDto[] {
        return rows.map((r) => plainToInstance(PortMasterResponseDto, r));
    }

    mapDropdown(row: PortMasterDoc): PortMasterDropdownDto {
        const parts = [row.state, row.type ? row.type.toUpperCase() : null].filter(
            Boolean
        );
        const tail = parts.length ? ` (${parts.join(', ')})` : '';
        return {
            _id: row._id.toString(),
            code: row.code,
            name: row.name,
            type: row.type,
            country_code: row.country_code,
            state: row.state || undefined,
            display_label: `${row.code} - ${row.name}${tail}`,
        };
    }
}
