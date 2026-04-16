import { faker } from '@faker-js/faker';
import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty } from 'class-validator';
import { PasswordHistoryCreateRequestDto } from '@modules/password-history/dtos/request/password-history.create.request.dto';

export class PasswordHistoryCreateByAdminRequestDto extends PasswordHistoryCreateRequestDto {
    @ApiProperty({
        example: faker.string.uuid(),
        required: true,
    })
    @IsNotEmpty()
    by: string;
}
