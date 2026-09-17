import {
    IsBoolean,
    IsNotEmpty,
    IsNotEmptyObject,
    IsObject,
    IsOptional,
    IsString,
    ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SettingValue } from '@modules/setting/interfaces/setting.interface';
import { ApiProperty } from '@nestjs/swagger';

class SettingFeatureJsonDto {
    @ApiProperty({
        description: 'Indicates if the setting is enabled',
        example: true,
    })
    @IsBoolean()
    @Type(() => Boolean)
    @IsNotEmpty()
    enabled: boolean;

    [key: string]: SettingValue;
}

export class SettingFeatureUpdateRequestDto {
    // Both fields below are optional — this DTO previously forced every
    // update to resend BOTH description and value, so e.g. toggling just
    // `value.enabled` without retyping the description 422'd with a
    // misleading "description cannot be empty" error (found via a full-app
    // test pass, same class of gap as CountryUpdateRequestDto/
    // RoleUpdateRequestDto). The service only needs to guard against
    // `undefined` the same way it already must for a genuinely optional
    // field.
    @ApiProperty({
        description: 'Human-readable description of the setting feature',
        example: 'Enable or disable Google authentication',
        required: false,
    })
    @IsOptional()
    @IsString()
    description?: string;

    @ApiProperty({
        description:
            'Configuration object that includes the enabled flag and additional properties',
        type: () => SettingFeatureJsonDto,
        required: false,
        example: {
            enabled: true,
            provider: 'google',
            scopes: ['email', 'profile'],
        },
    })
    @IsOptional()
    @IsObject()
    @IsNotEmptyObject()
    @ValidateNested()
    @Type(() => SettingFeatureJsonDto)
    value?: SettingFeatureJsonDto;
}
