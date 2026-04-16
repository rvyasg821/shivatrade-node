import { faker } from '@faker-js/faker';
import { ApiProperty } from '@nestjs/swagger';

export class EmailSendDto {
    @ApiProperty({ required: true, example: faker.person.fullName() })
    name: string;

    @ApiProperty({
        required: true,
        example: faker.internet.email(),
    })
    email: string;

    @ApiProperty({ required: false, example: faker.string.alphanumeric(10) })
    password?: string;

    @ApiProperty({ required: false, example: faker.string.alphanumeric(8) })
    referral_code?: string;
}
