import { faker } from '@faker-js/faker';
import { ENUM_ASSESSMENT_STATUS } from '@modules/assessment/enums/assessment.enum';

export const AssessmentDocParamsId = [
    {
        name: 'assessment',
        allowEmptyValue: false,
        required: true,
        type: 'string',
        example: faker.database.mongodbObjectId(),
    },
];

export const AssessmentReportDocParamsId = [
    {
        name: 'id',
        allowEmptyValue: false,
        required: true,
        type: 'string',
        example: faker.database.mongodbObjectId(),
    },
];

export const SectionDocParamsId = [
    {
        name: 'id',
        allowEmptyValue: false,
        required: true,
        type: 'string',
        example: faker.database.mongodbObjectId(),
    },
];

export const QuestionDocParamsId = [
    {
        name: 'id',
        allowEmptyValue: false,
        required: true,
        type: 'string',
        example: faker.database.mongodbObjectId(),
    },
];

export const QuestionAnswerDocParamsId = [
    {
        name: 'answer',
        allowEmptyValue: false,
        required: true,
        type: 'string',
        example: faker.database.mongodbObjectId(),
    },
];

export const AssessmentDocQueryStatus = [
    {
        name: 'status',
        allowEmptyValue: true,
        required: false,
        type: 'string',
        example: Object.values(ENUM_ASSESSMENT_STATUS).join(','),
        description: "value with ',' delimiter",
    },
];

export const SectionDocParamsIdString = [
    {
        name: 'sectionId',
        allowEmptyValue: false,
        required: true,
        type: 'string',
        example: faker.database.mongodbObjectId(),
    },
];