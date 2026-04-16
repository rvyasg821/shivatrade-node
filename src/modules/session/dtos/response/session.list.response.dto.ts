import { faker } from '@faker-js/faker';
import { ApiProperty } from '@nestjs/swagger';
import { DatabaseObjectIdDto } from '@common/database/dtos/database.object-id.dto';
import { ENUM_SESSION_STATUS } from '@modules/session/enums/session.enum';

export class SessionListResponseDto extends DatabaseObjectIdDto {
    @ApiProperty({
        required: true,
        example: faker.string.uuid(),
    })
    user: string;

    @ApiProperty({
        description: 'Date expired at',
        example: faker.date.recent(),
        required: true,
    })
    expiredAt: Date;

    @ApiProperty({
        description: 'Date expired at',
        example: faker.date.recent(),
        required: false,
    })
    revokeAt?: Date;

    @ApiProperty({
        required: true,
        enum: ENUM_SESSION_STATUS,
        default: ENUM_SESSION_STATUS.ACTIVE,
    })
    status: ENUM_SESSION_STATUS;

    @ApiProperty({
        required: true,
        example: faker.internet.ipv4(),
    })
    ip: string;

    @ApiProperty({
        required: true,
        example: faker.internet.domainName(),
    })
    hostname: string;

    @ApiProperty({
        required: true,
        example: faker.internet.protocol(),
    })
    protocol: string;

    @ApiProperty({
        required: true,
        example: faker.internet.url(),
    })
    originalUrl: string;

    @ApiProperty({
        required: true,
        example: faker.internet.httpMethod(),
    })
    method: string;

    @ApiProperty({
        required: false,
        example: faker.internet.userAgent(),
    })
    userAgent?: string;

    @ApiProperty({
        required: false,
        example: faker.internet.ipv4(),
    })
    xForwardedFor?: string;

    @ApiProperty({
        required: false,
        example: faker.internet.ipv4(),
    })
    xForwardedHost?: string;

    @ApiProperty({
        required: false,
        example: faker.internet.protocol(),
    })
    xForwardedPorto?: string;
}
