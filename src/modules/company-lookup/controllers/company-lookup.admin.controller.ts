import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Param,
    Query,
    HttpStatus,
    HttpCode,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthJwtAccessProtected, AuthJwtPayload } from '@modules/auth/decorators/auth.jwt.decorator';
import { CompanyLookupService } from '@modules/company-lookup/services/company-lookup.service';

@ApiTags('admin.company-lookup')
@Controller({
    version: '1',
    path: '/company-lookup',
})
export class CompanyLookupAdminController {
    constructor(
        private readonly companyLookupService: CompanyLookupService,
    ) {}

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Get('/list')
    async list(
        @AuthJwtPayload('companyId') companyId: string,
        @Query('type') type: string,
    ) {
        const items = await this.companyLookupService.findByCompanyAndType(companyId, type);
        return {
            statusCode: 200,
            message: 'Success',
            data: items.map(i => this.companyLookupService.mapGet(i)),
        };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Post('/create')
    async create(
        @AuthJwtPayload('companyId') companyId: string,
        @Body() body: { type: string; name: string },
    ) {
        const item = await this.companyLookupService.create(companyId, body.type, body.name);
        return {
            statusCode: 200,
            message: 'Created successfully',
            data: this.companyLookupService.mapGet(item),
        };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Put('/update/:id')
    async update(
        @Param('id') id: string,
        @Body() body: { name: string },
    ) {
        const item = await this.companyLookupService.update(id, body.name);
        return {
            statusCode: 200,
            message: 'Updated successfully',
            data: this.companyLookupService.mapGet(item),
        };
    }

    @AuthJwtAccessProtected()
    @HttpCode(HttpStatus.OK)
    @Delete('/delete/:id')
    async delete(@Param('id') id: string) {
        await this.companyLookupService.softDelete(id);
        return { statusCode: 200, message: 'Deleted successfully' };
    }
}
