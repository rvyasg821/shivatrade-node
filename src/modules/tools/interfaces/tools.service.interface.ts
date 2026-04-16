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
import { ToolsCreateRequestDto } from '@modules/tools/dtos/request/tools.create.request.dto';
import { ToolsUpdateRequestDto } from '@modules/tools/dtos/request/tools.update.request.dto';
import { ToolsListResponseDto } from '@modules/tools/dtos/response/tools.list.response.dto';
import { ToolsGetResponseDto } from '@modules/tools/dtos/response/tools.get.response.dto';
import { ToolsShortResponseDto } from '@modules/tools/dtos/response/tools.short.response.dto';
import { ToolsDoc } from '@modules/tools/repository/entities/tools.entity';
import { IToolsEntity } from '@modules/tools/interfaces/tools.interface';
import { ENUM_TOOLS_STATUS } from '@modules/tools/enums/tools.enum';

export interface IToolsService {
    findAll(
        find?: Record<string, any>,
        options?: IDatabaseFindAllOptions
    ): Promise<ToolsDoc[]>;

    findAllActive(
        find?: Record<string, any>,
        options?: IDatabaseFindAllOptions
    ): Promise<ToolsDoc[]>;

    getTotal(
        find?: Record<string, any>,
        options?: IDatabaseGetTotalOptions
    ): Promise<number>;

    findOneById(
        _id: string,
        options?: IDatabaseFindOneOptions
    ): Promise<ToolsDoc>;

    findOne(
        find: Record<string, any>,
        options?: IDatabaseFindOneOptions
    ): Promise<ToolsDoc>;

    findOneByName(
        name: string,
        options?: IDatabaseFindOneOptions
    ): Promise<ToolsDoc>;

    existByName(
        name: string,
        options?: IDatabaseExistsOptions
    ): Promise<boolean>;

    create(
        data: ToolsCreateRequestDto,
        options?: IDatabaseCreateOptions
    ): Promise<ToolsDoc>;

    update(
        repository: ToolsDoc,
        data: ToolsUpdateRequestDto,
        options?: IDatabaseSaveOptions
    ): Promise<ToolsDoc>;

    updateStatus(
        repository: ToolsDoc,
        status: ENUM_TOOLS_STATUS,
        options?: IDatabaseSaveOptions
    ): Promise<ToolsDoc>;

    softDelete(
        repository: ToolsDoc,
        options?: IDatabaseSoftDeleteOptions
    ): Promise<ToolsDoc>;

    deleteMany(
        find: Record<string, any>,
        options?: IDatabaseDeleteManyOptions
    ): Promise<boolean>;

    countByStatus(status: ENUM_TOOLS_STATUS): Promise<number>;

    mapList(tools: ToolsDoc[] | IToolsEntity[]): ToolsListResponseDto[];
    mapGet(tool: ToolsDoc | IToolsEntity): ToolsGetResponseDto;
    mapShort(tools: ToolsDoc[] | IToolsEntity[]): ToolsShortResponseDto[];
}