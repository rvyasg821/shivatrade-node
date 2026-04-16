import { applyDecorators, HttpStatus } from '@nestjs/common';
import {
    ApiOperation,
    ApiResponse,
    ApiParam,
    ApiQuery,
    getSchemaPath,
} from '@nestjs/swagger';
import { CompanyListResponseDto } from '@modules/company/dtos/response/company.list.response.dto';
import { CompanyGetResponseDto } from '@modules/company/dtos/response/company.get.response.dto';
import { CompanySuspendResponseDto } from '@modules/company/dtos/response/company.suspend.response.dto';
import { CompanyReactivateResponseDto } from '@modules/company/dtos/response/company.reactivate.response.dto';
import { DatabaseIdResponseDto } from '@common/database/dtos/response/database.id.response.dto';
import { DocAuth } from '@common/doc/decorators/doc.decorator';

export function CompanyAdminListDoc(): MethodDecorator {
    return applyDecorators(
        ApiOperation({
            summary: 'Get list of companies',
            description: 'Retrieve paginated list of companies with filtering and search capabilities',
        }),
        ApiQuery({
            name: 'search',
            required: false,
            type: String,
            description: 'Search in company name, contact name, or email',
        }),
        ApiQuery({
            name: 'page',
            required: false,
            type: Number,
            description: 'Page number for pagination',
        }),
        ApiQuery({
            name: 'perPage',
            required: false,
            type: Number,
            description: 'Number of items per page',
        }),
        ApiQuery({
            name: 'sort',
            required: false,
            type: String,
            description: 'Sort field (company_name, contact_name, email, createdAt, updatedAt)',
        }),
        ApiQuery({
            name: 'availableSort',
            required: false,
            type: String,
            description: 'Sort direction (asc, desc)',
        }),
        ApiResponse({
            status: HttpStatus.OK,
            description: 'Successfully retrieved company list',
            schema: {
                type: 'object',
                properties: {
                    _pagination: {
                        type: 'object',
                        properties: {
                            total: { type: 'number' },
                            totalPage: { type: 'number' },
                        },
                    },
                    data: {
                        type: 'array',
                        items: { $ref: getSchemaPath(CompanyListResponseDto) },
                    },
                },
            },
        }),
        DocAuth({
            jwtAccessToken: true,
        }),
        ApiResponse({
            status: HttpStatus.FORBIDDEN,
            description: 'Insufficient permissions',
        }),
    );
}

export function CompanyAdminGetDoc(): MethodDecorator {
    return applyDecorators(
        ApiOperation({
            summary: 'Get company details',
            description: 'Retrieve detailed information about a specific company',
        }),
        ApiParam({
            name: 'company',
            type: String,
            description: 'Company ID',
        }),
        ApiResponse({
            status: HttpStatus.OK,
            description: 'Successfully retrieved company details',
            schema: {
                type: 'object',
                properties: {
                    data: { $ref: getSchemaPath(CompanyGetResponseDto) },
                },
            },
        }),
        ApiResponse({
            status: HttpStatus.NOT_FOUND,
            description: 'Company not found',
        }),
        DocAuth({
            jwtAccessToken: true,
        }),
        ApiResponse({
            status: HttpStatus.FORBIDDEN,
            description: 'Insufficient permissions',
        }),
    );
}

export function CompanyAdminCreateDoc(): MethodDecorator {
    return applyDecorators(
        ApiOperation({
            summary: 'Create new company',
            description: 'Create a new company record with the provided information',
        }),
        ApiResponse({
            status: HttpStatus.CREATED,
            description: 'Company created successfully',
            schema: {
                type: 'object',
                properties: {
                    data: { $ref: getSchemaPath(DatabaseIdResponseDto) },
                },
            },
        }),
        ApiResponse({
            status: HttpStatus.BAD_REQUEST,
            description: 'Validation error or invalid data',
        }),
        ApiResponse({
            status: HttpStatus.CONFLICT,
            description: 'Email already exists',
        }),
        DocAuth({
            jwtAccessToken: true,
        }),
        ApiResponse({
            status: HttpStatus.FORBIDDEN,
            description: 'Insufficient permissions',
        }),
    );
}

export function CompanyAdminUpdateDoc(): MethodDecorator {
    return applyDecorators(
        ApiOperation({
            summary: 'Update company',
            description: 'Update an existing company record with new information',
        }),
        ApiParam({
            name: 'company',
            type: String,
            description: 'Company ID',
        }),
        ApiResponse({
            status: HttpStatus.OK,
            description: 'Company updated successfully',
            schema: {
                type: 'object',
                properties: {
                    data: { $ref: getSchemaPath(DatabaseIdResponseDto) },
                },
            },
        }),
        ApiResponse({
            status: HttpStatus.BAD_REQUEST,
            description: 'Validation error or invalid data',
        }),
        ApiResponse({
            status: HttpStatus.NOT_FOUND,
            description: 'Company not found',
        }),
        ApiResponse({
            status: HttpStatus.CONFLICT,
            description: 'Email already exists',
        }),
        DocAuth({
            jwtAccessToken: true,
        }),
        ApiResponse({
            status: HttpStatus.FORBIDDEN,
            description: 'Insufficient permissions',
        }),
    );
}

export function CompanyAdminGetByUserDoc(): MethodDecorator {
    return applyDecorators(
        ApiOperation({
            summary: 'Get my company details',
            description: 'Retrieve company details for the currently authenticated user',
        }),
        ApiResponse({
            status: HttpStatus.OK,
            description: 'Successfully retrieved user company details',
            schema: {
                type: 'object',
                properties: {
                    data: { $ref: getSchemaPath(CompanyGetResponseDto) },
                },
            },
        }),
        ApiResponse({
            status: HttpStatus.NOT_FOUND,
            description: 'User or company not found',
        }),
        DocAuth({
            jwtAccessToken: true,
        }),
        ApiResponse({
            status: HttpStatus.FORBIDDEN,
            description: 'Insufficient permissions',
        }),
    );
}

export function CompanyAdminDeleteDoc(): MethodDecorator {
    return applyDecorators(
        ApiOperation({
            summary: 'Delete company',
            description: 'Soft delete a company record (sets soft_delete flag to true)',
        }),
        ApiParam({
            name: 'company',
            type: String,
            description: 'Company ID',
        }),
        ApiResponse({
            status: HttpStatus.OK,
            description: 'Company deleted successfully',
        }),
        ApiResponse({
            status: HttpStatus.NOT_FOUND,
            description: 'Company not found',
        }),
        DocAuth({
            jwtAccessToken: true,
        }),
        ApiResponse({
            status: HttpStatus.FORBIDDEN,
            description: 'Insufficient permissions',
        }),
    );
}

export function CompanyAdminSuspendDoc(): MethodDecorator {
    return applyDecorators(
        ApiOperation({
            summary: 'Suspend company admin',
            description: 'Suspend a company admin user and deactivate all associated resources including subscription and tenant users',
        }),
        ApiParam({
            name: 'company',
            type: String,
            description: 'Company ID',
        }),
        ApiResponse({
            status: HttpStatus.OK,
            description: 'Company admin suspended successfully',
            schema: {
                type: 'object',
                properties: {
                    data: { $ref: getSchemaPath(CompanySuspendResponseDto) },
                },
            },
        }),
        ApiResponse({
            status: HttpStatus.NOT_FOUND,
            description: 'Company not found',
        }),
        ApiResponse({
            status: HttpStatus.CONFLICT,
            description: 'Company is already suspended',
        }),
        DocAuth({
            jwtAccessToken: true,
        }),
        ApiResponse({
            status: HttpStatus.FORBIDDEN,
            description: 'Insufficient permissions',
        }),
    );
}

export function CompanyAdminReactivateDoc(): MethodDecorator {
    return applyDecorators(
        ApiOperation({
            summary: 'Reactivate company admin',
            description: 'Reactivate a company and its associated admin user',
        }),
        ApiParam({
            name: 'company',
            type: String,
            description: 'Company ID',
        }),
        ApiResponse({
            status: HttpStatus.OK,
            description: 'Company admin reactivated successfully',
            schema: {
                type: 'object',
                properties: {
                    data: { $ref: getSchemaPath(CompanyReactivateResponseDto) },
                },
            },
        }),
        ApiResponse({
            status: HttpStatus.NOT_FOUND,
            description: 'Company not found',
        }),
        ApiResponse({
            status: HttpStatus.CONFLICT,
            description: 'Company is already active',
        }),
        DocAuth({
            jwtAccessToken: true,
        }),
        ApiResponse({
            status: HttpStatus.FORBIDDEN,
            description: 'Insufficient permissions',
        }),
    );
}

export function CompanyAdminHardDeleteDoc(): MethodDecorator {
    return applyDecorators(
        ApiOperation({
            summary: 'Hard delete company',
            description: 'Hard delete a company record (deletes all associated resources including subscription and tenant users',
        }),
        ApiParam({
            name: 'company',
            type: String,
            description: 'Company ID',
        }),
        ApiResponse({
            status: HttpStatus.OK,
            description: 'Company Hard Delete successful.',
        }),
        ApiResponse({
            status: HttpStatus.NOT_FOUND,
            description: 'Company not found',
        }),
        ApiResponse({
            status: HttpStatus.CONFLICT,
            description: 'Company is already Deleted',
        }),
        DocAuth({
            jwtAccessToken: true,
        }),
        ApiResponse({
            status: HttpStatus.FORBIDDEN,
            description: 'Insufficient permissions',
        }),
    );
}