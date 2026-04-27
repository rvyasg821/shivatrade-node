import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Param,
    Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthJwtAccessProtected, AuthJwtPayload } from '@modules/auth/decorators/auth.jwt.decorator';
import { Response, ResponsePaging } from '@common/response/decorators/response.decorator';
import { IResponse, IResponsePaging } from '@common/response/interfaces/response.interface';
import { PaginationQuery } from '@common/pagination/decorators/pagination.decorator';
import { PaginationListDto } from '@common/pagination/dtos/pagination.list.dto';

import { CategoryService } from '../services/category.service';
import { CategoryRepository } from '../repository/repositories/category.repository';
import { CategoryCreateRequestDto } from '../dtos/request/category.create.request.dto';
import { CategoryUpdateRequestDto } from '../dtos/request/category.update.request.dto';
import { CategoryGetResponseDto } from '../dtos/response/category.get.response.dto';
import { CategoryListResponseDto } from '../dtos/response/category.list.response.dto';

@ApiTags('admin.category')
@Controller({
    version: '1',
    path: '/admin/category',
})
export class CategoryAdminController {
    constructor(
        private readonly categoryService: CategoryService,
        private readonly categoryRepository: CategoryRepository
    ) {}

    @Response('category.create')
    @AuthJwtAccessProtected()
    @Post('/create')
    async create(
        @AuthJwtPayload('companyId') companyId: string,
        @AuthJwtPayload('user') userId: string,
        @Body() body: CategoryCreateRequestDto
    ): Promise<IResponse<CategoryGetResponseDto>> {
        const category = await this.categoryService.create(companyId, body, userId);
        const data = await this.categoryService.mapGetWithParent(category);
        return { data };
    }

    @ResponsePaging('category.list')
    @AuthJwtAccessProtected()
    @Get('/list')
    async list(
        @AuthJwtPayload('companyId') companyId: string,
        @PaginationQuery() { _search, _limit, _offset, _order }: PaginationListDto,
        @Query('status') status?: string
    ): Promise<IResponsePaging<CategoryListResponseDto>> {
        const find: any = {
            soft_delete: false,
        };

        if (companyId) {
            find.company_id = companyId;
        }

        if (status === 'ACTIVE') {
            find.is_active = true;
        } else if (status === 'INACTIVE') {
            find.is_active = false;
        }

        if (_search) {
            find.$or = [
                { name: { $regex: _search, $options: 'i' } },
                { description: { $regex: _search, $options: 'i' } },
            ];
        }

        const categories = await this.categoryRepository.findAll(find, {
            paging: { limit: _limit, offset: _offset },
            order: _order,
        });

        const total = await this.categoryRepository.getTotal(find);
        const data = await this.categoryService.mapListWithParent(categories);

        return {
            _pagination: { total, totalPage: Math.ceil(total / _limit) },
            data,
        };
    }

    @Response('category.dropdown')
    @AuthJwtAccessProtected()
    @Get('/dropdown')
    async dropdown(
        @AuthJwtPayload('companyId') companyId: string
    ): Promise<IResponse<{ _id: string; name: string; parent_id?: string }[]>> {
        const find: any = { soft_delete: false, is_active: true };
        if (companyId) find.company_id = companyId;

        const categories = await this.categoryRepository.findAll(find, {
            order: { name: 'asc' as any },
        });

        return {
            data: categories.map((c) => ({
                _id: c._id.toString(),
                name: c.name,
                parent_id: c.parent_id ? c.parent_id.toString() : undefined,
            })),
        };
    }

    @Response('category.get')
    @AuthJwtAccessProtected()
    @Get('/get/:categoryId')
    async get(
        @Param('categoryId') categoryId: string
    ): Promise<IResponse<CategoryGetResponseDto>> {
        const category = await this.categoryService.findOneById(categoryId);
        const data = await this.categoryService.mapGetWithParent(category);
        return { data };
    }

    @Response('category.update')
    @AuthJwtAccessProtected()
    @Put('/update/:categoryId')
    async update(
        @Param('categoryId') categoryId: string,
        @Body() body: CategoryUpdateRequestDto
    ): Promise<IResponse<CategoryGetResponseDto>> {
        const category = await this.categoryService.findOneById(categoryId);
        const updated = await this.categoryService.update(category, body);
        const data = await this.categoryService.mapGetWithParent(updated);
        return { data };
    }

    @Response('category.delete')
    @AuthJwtAccessProtected()
    @Delete('/delete/:categoryId')
    async delete(@Param('categoryId') categoryId: string): Promise<void> {
        const category = await this.categoryService.findOneById(categoryId);
        await this.categoryService.softDelete(category);
    }
}
