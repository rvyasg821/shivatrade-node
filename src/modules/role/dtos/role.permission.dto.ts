import { ApiProperty } from '@nestjs/swagger';
import {
    ArrayNotEmpty,
    IsArray,
    IsEnum,
    IsNotEmpty,
    IsString,
} from 'class-validator';

export class RolePermissionDto {
    @ApiProperty({
        required: true,
        description: 'Permission subject',
        enum: ['user', 'role', 'setting', 'auth', 'activity', 'api-key', 'country', 'file', 'migration', 'password-history', 'reset-password', 'session', 'sms', 'email', 'hello', 'health'],
    })
    @IsNotEmpty()
    @IsString()
    @IsEnum(['user', 'role', 'setting', 'auth', 'activity', 'api-key', 'country', 'file', 'migration', 'password-history', 'reset-password', 'session', 'sms', 'email', 'hello', 'health'])
    subject: string;

    @ApiProperty({
        required: true,
        description: 'Permission action base on subject',
        isArray: true,
        default: ['manage'],
        enum: ['read', 'create', 'update', 'delete', 'manage'],
    })
    @IsString({ each: true })
    @IsEnum(['read', 'create', 'update', 'delete', 'manage'], { each: true })
    @IsArray()
    @IsNotEmpty()
    @ArrayNotEmpty()
    action: string[];
}