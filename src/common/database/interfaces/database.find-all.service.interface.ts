import { Repository } from 'typeorm';
import { PaginationListDto } from '@common/pagination/dtos/pagination.list.dto';
import { IResponsePaging } from '@common/response/interfaces/response.interface';

export interface IDatabaseFindAllService<T> {
    findAll(
        repository: Repository<T>,
        pagination: PaginationListDto,
        options?: Record<string, any>
    ): Promise<IResponsePaging<T>>;
}
