import { ENUM_TOOLS_STATUS } from '@modules/tools/enums/tools.enum';

export interface IToolsEntity {
    _id: string;
    name: string;
    slug: string;
    description: string;
    status: ENUM_TOOLS_STATUS;
    createdAt: Date;
    updatedAt: Date;
    deletedAt?: Date;
    deleted: boolean;
}

export interface IToolsDoc extends IToolsEntity {
    _id: string;
}