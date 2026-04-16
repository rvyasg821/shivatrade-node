import {
    IDatabaseCreateOptions,
    IDatabaseDeleteManyOptions,
    IDatabaseExistsOptions,
    IDatabaseFindAllOptions,
    IDatabaseFindOneOptions,
    IDatabaseGetTotalOptions,
    IDatabaseSaveOptions,
    IDatabaseSoftDeleteOptions,
} from '@common/database/interfaces/database.interface';
import { IPlanDoc, IPlanEntity } from '@modules/plan/interfaces/plan.interface';
import { PlanDoc } from '@modules/plan/repository/entities/plan.entity';
import { PlanCreateRequestDto } from '@modules/plan/dtos/request/plan.create.request.dto';
import { PlanUpdateRequestDto } from '@modules/plan/dtos/request/plan.update.request.dto';
import { PlanListResponseDto } from '@modules/plan/dtos/response/plan.list.response.dto';
import { PlanGetResponseDto } from '@modules/plan/dtos/response/plan.get.response.dto';
import { PlanShortResponseDto } from '@modules/plan/dtos/response/plan.short.response.dto';
import { ENUM_PLAN_STATUS } from '@modules/plan/enums/plan.enum';

export interface IPlanService {
    findAll(
        find?: Record<string, any>,
        options?: IDatabaseFindAllOptions
    ): Promise<PlanDoc[]>;

    findAllActive(
        find?: Record<string, any>,
        options?: IDatabaseFindAllOptions
    ): Promise<PlanDoc[]>;

    getTotal(
        find?: Record<string, any>,
        options?: IDatabaseGetTotalOptions
    ): Promise<number>;

    findOneById(
        _id: string,
        options?: IDatabaseFindOneOptions
    ): Promise<PlanDoc>;

    findOne(
        find: Record<string, any>,
        options?: IDatabaseFindOneOptions
    ): Promise<PlanDoc>;

    findOneByName(
        name: string,
        options?: IDatabaseFindOneOptions
    ): Promise<PlanDoc>;

    findDefault(options?: IDatabaseFindOneOptions): Promise<PlanDoc>;

    existByName(
        name: string,
        options?: IDatabaseExistsOptions
    ): Promise<boolean>;

    create(
        data: PlanCreateRequestDto,
        options?: IDatabaseCreateOptions
    ): Promise<PlanDoc>;

    update(
        repository: PlanDoc,
        data: PlanUpdateRequestDto,
        options?: IDatabaseSaveOptions
    ): Promise<PlanDoc>;

    updateStatus(
        repository: PlanDoc,
        status: ENUM_PLAN_STATUS,
        options?: IDatabaseSaveOptions
    ): Promise<PlanDoc>;

    softDelete(
        repository: PlanDoc,
        options?: IDatabaseSoftDeleteOptions
    ): Promise<PlanDoc>;

    deleteMany(
        find: Record<string, any>,
        options?: IDatabaseDeleteManyOptions
    ): Promise<boolean>;

    convertToObjectId(id: string): string;

    mapList(plans: PlanDoc[] | IPlanEntity[]): PlanListResponseDto[];
    mapGet(plan: PlanDoc | IPlanEntity): PlanGetResponseDto;
    mapShort(plans: PlanDoc[] | IPlanEntity[]): PlanShortResponseDto[];
}