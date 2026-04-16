import { ENUM_ASSESSMENT_STATUS } from '@modules/assessment/enums/assessment.enum';

export const ASSESSMENT_DEFAULT_AVAILABLE_SEARCH = ['name', 'description'];
export const ASSESSMENT_DEFAULT_STATUS = Object.values(ENUM_ASSESSMENT_STATUS);

export const SECTION_DEFAULT_AVAILABLE_SEARCH = ['name', 'description'];
export const SECTION_DEFAULT_STATUS = Object.values(ENUM_ASSESSMENT_STATUS);

export const QUESTION_DEFAULT_AVAILABLE_SEARCH = ['question', 'description'];
export const QUESTION_DEFAULT_STATUS = Object.values(ENUM_ASSESSMENT_STATUS);

export const QUESTION_ANSWER_DEFAULT_AVAILABLE_SEARCH = ['value'];
export const QUESTION_ANSWER_DEFAULT_STATUS = Object.values(ENUM_ASSESSMENT_STATUS);

export const ASSESSMENT_REPORT_DEFAULT_AVAILABLE_SEARCH = [
    'name',
    'first_name',
    'last_name',
    'company_name',
    'email',
    'mobile',
];
export const ASSESSMENT_REPORT_DEFAULT_STATUS = Object.values(ENUM_ASSESSMENT_STATUS);
