import {
    Body,
    ConflictException,
    Controller,
    Get,
    InternalServerErrorException,
    NotFoundException,
    Put,
    Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
    Response,
} from '@common/response/decorators/response.decorator';
import {
    IResponse,
} from '@common/response/interfaces/response.interface';
import {
    AuthJwtAccessProtected,
    AuthJwtPayload,
} from '@modules/auth/decorators/auth.jwt.decorator';
import { UserProtected } from '@modules/user/decorators/user.decorator';
import { ForbiddenException } from '@nestjs/common';
import { ENUM_SYSTEM_ROLE } from '@modules/role/enums/role.enum';
import { CompanyService } from '@modules/company/services/company.service';
import { CompanyDoc } from '@modules/company/repository/entities/company.entity';
import { CompanyGetResponseDto } from '@modules/company/dtos/response/company.get.response.dto';
import { CompanyUpdateRequestDto } from '@modules/company/dtos/request/company.update.request.dto';
import { DatabaseIdResponseDto } from '@common/database/dtos/response/database.id.response.dto';
// import { ActivityService } from '@modules/activity/services/activity.service';
// import { MessageService } from '@common/message/services/message.service';
import { ENUM_COMPANY_STATUS_CODE_ERROR } from '@modules/company/enums/company.status-code.enum';
import { ENUM_APP_STATUS_CODE_ERROR } from '@app/enums/app.status-code.enum';
import {
    CompanySharedProfileDoc,
    CompanySharedUpdateDoc,
} from '@modules/company/docs/company.shared.doc';
import { ApiResponse } from '@nestjs/swagger';

@ApiTags('modules.shared.company')
@Controller({
    version: '1',
    path: '/company',
})
export class CompanySharedController {
    constructor(
        private readonly companyService: CompanyService,
        // private readonly activityService: ActivityService,
        // private readonly messageService: MessageService,
    ) { }

    @CompanySharedProfileDoc()
    @ApiResponse({
        status: 200,
        type: CompanyGetResponseDto,
    })
    @Response('company.success.profile')
    @UserProtected()
    @AuthJwtAccessProtected()
    @Get('/profile')
    async profile(
        @AuthJwtPayload('roleName') roleName: string,
        @Req() request: Request,
    ): Promise<IResponse<CompanyGetResponseDto>> {
        const user = (request as any).user;
        const userId = user && user.user ? String(user.user) : null;
        const company: CompanyDoc = await this.companyService.findOneByUserId(
            this.companyService.convertToObjectId(userId),
            { join: true }
        );

        if (!company) {
            throw new NotFoundException({
                statusCode: ENUM_COMPANY_STATUS_CODE_ERROR.NOT_FOUND,
                message: 'company.error.notFound',
            });
        }

        // Check if user has administrative roles
        if (
            roleName !== ENUM_SYSTEM_ROLE.COMPANY_ADMIN &&
            roleName !== ENUM_SYSTEM_ROLE.SUPER_ADMIN &&
            roleName !== 'Admin'
        ) {
            throw new ForbiddenException({
                statusCode: ENUM_COMPANY_STATUS_CODE_ERROR.OWNERSHIP_INVALID,
                message: 'company.error.unauthorizedRole',
            });
        }

        const mapped: CompanyGetResponseDto = this.companyService.mapProfile(company);
        await this.companyService.hydrateRelationsOnto(String(company._id), mapped);

        return { data: mapped };
    }

    @CompanySharedUpdateDoc()
    @ApiResponse({
        status: 200,
        type: CompanyGetResponseDto,
    })
    @Response('company.success.updateProfile')
    @UserProtected()
    @AuthJwtAccessProtected()
    @Put('/profile')
    async updateProfile(
        @Req() request: Request,
        @AuthJwtPayload('roleName') roleName: string,
        @Body() body: CompanyUpdateRequestDto
    ): Promise<IResponse<DatabaseIdResponseDto>> {
        const {
            company_name, contact_name, contact_first_name, contact_last_name,
            email, mobile, country_code, website,
            address_1, address_2, city, state, country, zipcode,
            iec, lut_no, lut_date, cin,
            default_port_of_loading, default_declaration_text,
            addresses, bank_accounts,
        } = body;
        const user = (request as any).user;
        const userId = user && user.user ? String(user.user) : null;
        const company: CompanyDoc = await this.companyService.findOneByUserId(
            this.companyService.convertToObjectId(userId)
        );

        if (!company) {
            throw new NotFoundException({
                statusCode: ENUM_COMPANY_STATUS_CODE_ERROR.NOT_FOUND,
                message: 'company.error.notFound',
            });
        }

        // Check if user has administrative roles
        if (
            roleName !== ENUM_SYSTEM_ROLE.COMPANY_ADMIN &&
            roleName !== ENUM_SYSTEM_ROLE.SUPER_ADMIN &&
            roleName !== 'Admin'
        ) {
            throw new ForbiddenException({
                statusCode: ENUM_COMPANY_STATUS_CODE_ERROR.OWNERSHIP_INVALID,
                message: 'company.error.unauthorizedRole',
            });
        }

        // Check if email already exists (excluding current company)
        if (email && email !== company.email) {
            const emailExist = await this.companyService.existByEmailExcludingId(email, String(company._id));
            if (emailExist) {
                throw new ConflictException({
                    statusCode: ENUM_COMPANY_STATUS_CODE_ERROR.EMAIL_EXIST,
                    message: 'company.error.emailExist',
                });
            }
        }

        try {
            const updated = await this.companyService.update(
                company,
                {
                    company_name, contact_name, contact_first_name, contact_last_name,
                    email, mobile, country_code, website,
                    address_1, address_2, city, state, country, zipcode,
                    iec, lut_no, lut_date, cin,
                    default_port_of_loading, default_declaration_text,
                }
            );

            if (addresses !== undefined) {
                await this.companyService.replaceAddresses(
                    String(updated._id),
                    addresses
                );
            }
            if (bank_accounts !== undefined) {
                await this.companyService.replaceBankAccounts(
                    String(updated._id),
                    bank_accounts
                );
            }

            // TODO: Create company-specific activity logging
            // await this.activityService.createByUser(
            //     company,
            //     {
            //         description: this.messageService.setMessage('activity.company.updateProfile'),
            //     },
            // );

            return {
                data: { _id: String(updated._id) },
            };
        } catch (err: unknown) {
            throw new InternalServerErrorException({
                statusCode: ENUM_APP_STATUS_CODE_ERROR.UNKNOWN,
                message: 'http.serverError.internalServerError',
                _error: err,
            });
        }
    }
}