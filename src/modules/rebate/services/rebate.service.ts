import {
    Injectable,
    Logger,
    BadRequestException,
    NotFoundException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { RebateRepository } from '../repository/repositories/rebate.repository';
import { RebateDoc } from '../repository/entities/rebate.entity';
import { RebateCreateRequestDto } from '../dtos/request/rebate.create.request.dto';
import { RebateUpdateRequestDto } from '../dtos/request/rebate.update.request.dto';
import { RebateGetResponseDto } from '../dtos/response/rebate.get.response.dto';
import { RebateListResponseDto } from '../dtos/response/rebate.list.response.dto';
import {
    IDatabaseFindAllOptions,
    IDatabaseFindOneOptions,
} from '@common/database/interfaces/database.interface';

@Injectable()
export class RebateService {
    private readonly logger = new Logger(RebateService.name);

    constructor(private readonly rebateRepository: RebateRepository) {}

    async create(
        companyId: string,
        data: RebateCreateRequestDto,
        createdBy: string
    ): Promise<RebateDoc> {
        const name = data.name.trim();
        const code = data.code.trim();

        if (await this.rebateRepository.isNameExists(companyId, name)) {
            throw new BadRequestException(
                `Rebate '${name}' already exists for this company`
            );
        }
        if (await this.rebateRepository.isCodeExists(companyId, code)) {
            throw new BadRequestException(
                `Rebate code '${code}' already exists for this company`
            );
        }

        const { _id: _ignored, ...rest } = data as any;
        const rebate = await this.rebateRepository.create({
            ...rest,
            name,
            code,
            company_id: companyId,
            created_by: createdBy,
        } as any);

        this.logger.log(`Rebate created: ${rebate._id} for company: ${companyId}`);
        return rebate;
    }

    async findOneById(
        rebateId: string,
        options?: IDatabaseFindOneOptions
    ): Promise<RebateDoc> {
        const rebate = await this.rebateRepository.findOneById(rebateId, options);
        if (!rebate) throw new NotFoundException('Rebate not found');
        return rebate;
    }

    async findAll(
        companyId: string,
        options?: IDatabaseFindAllOptions
    ): Promise<RebateDoc[]> {
        return this.rebateRepository.findByCompanyId(companyId, options);
    }

    async update(rebate: RebateDoc, data: RebateUpdateRequestDto): Promise<RebateDoc> {
        const companyId = rebate.company_id.toString();

        if (data.name && data.name.trim() !== rebate.name) {
            if (
                await this.rebateRepository.isNameExists(
                    companyId,
                    data.name.trim(),
                    rebate._id.toString()
                )
            ) {
                throw new BadRequestException(
                    `Rebate '${data.name.trim()}' already exists for this company`
                );
            }
            data.name = data.name.trim();
        }
        if (data.code && data.code.trim() !== rebate.code) {
            if (
                await this.rebateRepository.isCodeExists(
                    companyId,
                    data.code.trim(),
                    rebate._id.toString()
                )
            ) {
                throw new BadRequestException(
                    `Rebate code '${data.code.trim()}' already exists for this company`
                );
            }
            data.code = data.code.trim();
        }

        Object.assign(rebate, data);
        // Keep status and is_active consistent — whichever the caller changed wins.
        if (data.status !== undefined) {
            rebate.is_active = data.status === 'active';
        } else if (data.is_active !== undefined) {
            rebate.status = data.is_active
                ? ('active' as any)
                : ('inactive' as any);
        }
        const updated = await this.rebateRepository.save(rebate);
        this.logger.log(`Rebate updated: ${rebate._id}`);
        return updated;
    }

    async softDelete(rebate: RebateDoc, deletedBy?: string): Promise<RebateDoc> {
        rebate.soft_delete = true;
        rebate.is_active = false;
        (rebate as any).deleted = true;
        (rebate as any).deletedAt = new Date();
        if (deletedBy) (rebate as any).deletedBy = deletedBy;
        const updated = await this.rebateRepository.save(rebate);
        this.logger.log(`Rebate soft deleted: ${rebate._id}`);
        return updated;
    }

    mapGet(rebate: RebateDoc): RebateGetResponseDto {
        return plainToInstance(RebateGetResponseDto, rebate);
    }

    mapList(rebates: RebateDoc[]): RebateListResponseDto[] {
        return rebates.map((r) => plainToInstance(RebateListResponseDto, r));
    }
}
