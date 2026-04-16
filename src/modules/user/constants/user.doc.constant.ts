import { faker } from '@faker-js/faker';
import { ENUM_USER_STATUS } from '@modules/user/enums/user.enum';

export const UserDocParamsId = [
    {
        name: 'user',
        allowEmptyValue: false,
        required: true,
        type: 'string',
        example: faker.database.mongodbObjectId(),
    },
];

export const UserAgentDocReferalCode = [
    {
        name: 'referalCode',
        allowEmptyValue: false,
        required: true,
        type: 'string',
        example: faker.string.alphanumeric(8).toUpperCase(),
    },
];

export const UserDocQueryRole = [
    {
        name: 'role',
        allowEmptyValue: true,
        required: false,
        type: 'string',
        example: `${faker.database.mongodbObjectId()},${faker.database.mongodbObjectId()}`,
        description: "value with ',' delimiter",
    },
];

export const UserDocQueryStatus = [
    {
        name: 'status',
        allowEmptyValue: true,
        required: false,
        type: 'string',
        example: Object.values(ENUM_USER_STATUS).join(','),
        description: "value with ',' delimiter",
    },
];
