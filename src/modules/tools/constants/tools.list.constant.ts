import { ENUM_TOOLS_STATUS } from "../enums/tools.enum";

export const TOOLS_DEFAULT_AVAILABLE_SEARCH = ['name'];

export const TOOLS_DEFAULT_AVAILABLE_ORDER_BY = [
    'name',
    'status',
    'createdAt',
    'updatedAt',
];

export const TOOLS_DEFAULT_STATUS = Object.values(ENUM_TOOLS_STATUS);