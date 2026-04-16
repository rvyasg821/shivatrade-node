import { applyDecorators, HttpStatus } from '@nestjs/common';
import {
    ApiOperation,
    ApiResponse,
    getSchemaPath,
} from '@nestjs/swagger';
import { CompanyGetResponseDto } from '@modules/company/dtos/response/company.get.response.dto';
import { DatabaseIdResponseDto } from '@common/database/dtos/response/database.id.response.dto';
import { DocAuth } from '@common/doc/decorators/doc.decorator';

export function CompanySharedProfileDoc(): MethodDecorator {
    return applyDecorators(
        ApiOperation({
            summary: 'Get user company profile',
            description: 'Retrieve the company profile for the current authenticated user',
        }),
        ApiResponse({
            status: HttpStatus.OK,
            description: 'Successfully retrieved company profile',
            schema: {
                type: 'object',
                properties: {
                    data: { $ref: getSchemaPath(CompanyGetResponseDto) },
                },
            },
        }),
        ApiResponse({
            status: HttpStatus.NOT_FOUND,
            description: 'User has no company profile',
        }),
        DocAuth({
            jwtAccessToken: true,
        }),
        ApiResponse({
            status: HttpStatus.UNAUTHORIZED,
            description: 'User not authenticated',
        }),
    );
}

export function CompanySharedUpdateDoc(): MethodDecorator {
    return applyDecorators(
        ApiOperation({
            summary: 'Update user company profile',
            description: 'Update the company profile for the current authenticated user',
        }),
        ApiResponse({
            status: HttpStatus.OK,
            description: 'Company profile updated successfully',
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
            description: 'User has no company profile',
        }),
        ApiResponse({
            status: HttpStatus.CONFLICT,
            description: 'Email already exists',
        }),
        DocAuth({
            jwtAccessToken: true,
        }),
        ApiResponse({
            status: HttpStatus.UNAUTHORIZED,
            description: 'User not authenticated',
        }),
    );
}