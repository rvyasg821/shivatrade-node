import { faker } from '@faker-js/faker';
import { ENUM_COUNTRY_STATUS } from '@modules/country/enums/country.enum';

export const CountryDocParamsId = [
    {
        name: 'country',
        allowEmptyValue: false,
        required: true,
        type: 'string',
        example: faker.database.mongodbObjectId(),
    },
];


export const CountryDocQueryStatus = [
    {
        name: 'status',
        allowEmptyValue: true,
        required: false,
        type: 'string',
        example: Object.values(ENUM_COUNTRY_STATUS).join(','),
        description: "value with ',' delimiter",
    },
];

