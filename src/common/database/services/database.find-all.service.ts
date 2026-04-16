import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { PaginationListDto } from '@common/pagination/dtos/pagination.list.dto';
import { IResponsePaging } from '@common/response/interfaces/response.interface';
import { IDatabaseFindAllService } from '@common/database/interfaces/database.find-all.service.interface';
import { PaginationService } from '@common/pagination/services/pagination.service';

@Injectable()
export class DatabaseFindAllService<T>
    implements IDatabaseFindAllService<T>
{
    constructor(private readonly paginationService: PaginationService) {}

    async findAll(
        repository: Repository<T>,
        pagination: PaginationListDto,
        options?: Record<string, any>
    ): Promise<IResponsePaging<T>> {
        const { _limit, _offset, _order, _search } = pagination;

        const find: Record<string, any> = {
            ..._search,
            ...(options?.conditions || {}),
        };

        const where = { ...find, deleted: false } as any;

        const count: number = await repository.count({ where });
        const data: T[] = await repository.find({
            where,
            order: _order as any,
            take: _limit,
            skip: _offset,
        });

        const totalPage: number = this.paginationService.totalPage(
            count,
            _limit
        );

        return {
            _pagination: {
                total: count,
                totalPage: totalPage,
            },
            data,
        };
    }
}
