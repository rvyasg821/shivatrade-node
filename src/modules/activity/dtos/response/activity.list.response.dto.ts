import { faker } from '@faker-js/faker';
import { ApiProperty, getSchemaPath } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { DatabaseObjectIdDto } from '@common/database/dtos/database.object-id.dto';
import { UserShortResponseDto } from '@modules/user/dtos/response/user.short.response.dto';

export class ActivityListResponseDto extends DatabaseObjectIdDto {
    @ApiProperty({
        required: true,
        example: faker.database.mongodbObjectId(),
    })
    user: string;

    @ApiProperty({
        required: true,
        example: faker.lorem.paragraph(),
    })
    description: string;

    @ApiProperty({
        required: true,
        type: UserShortResponseDto,
        oneOf: [{ $ref: getSchemaPath(UserShortResponseDto) }],
    })
    @Type(() => UserShortResponseDto)
    by: UserShortResponseDto;
}
