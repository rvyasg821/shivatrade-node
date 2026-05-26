import {
    IsString,
    IsNotEmpty,
    IsOptional,
    IsEnum,
    IsBoolean,
    MaxLength,
    Matches,
} from 'class-validator';
import { ENUM_PORT_TYPE } from '@modules/port-master/enums/port-master.enum';

export class PortMasterCreateRequestDto {
    /** Customs code - e.g. "INMUN1", "INNSA1". Uppercase enforced server-side. */
    @IsString()
    @IsNotEmpty()
    @MaxLength(20)
    code: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(150)
    name: string;

    @IsEnum(ENUM_PORT_TYPE)
    type: ENUM_PORT_TYPE;

    /** ISO 3166-1 alpha-2. Defaults to 'IN' if omitted. */
    @IsString()
    @IsOptional()
    @Matches(/^[A-Z]{2}$/, { message: 'country_code must be 2 uppercase letters' })
    country_code?: string;

    @IsString()
    @IsOptional()
    @MaxLength(80)
    state?: string;

    @IsBoolean()
    @IsOptional()
    is_active?: boolean;
}
