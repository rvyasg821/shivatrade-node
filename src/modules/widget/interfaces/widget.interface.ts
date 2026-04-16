import { IDatabaseDocument } from '@common/database/interfaces/database.interface';

export interface IWidget {
    user_id: string;
    slug: string;
    order: number;
    is_visible: boolean;
    tool_slug: string;
    status: boolean;
    soft_delete: boolean;
}

export interface IWidgetDoc extends IDatabaseDocument<IWidget>, IWidget {}

export interface IWidgetCreate {
    user_id: string;
    slug: string;
    order: number;
    is_visible: boolean;
    tool_slug: string;
    status?: boolean;
    soft_delete?: boolean;
}

export interface IWidgetUpdate {
    order?: number;
    is_visible?: boolean;
}

export interface IWidgetBulkUpdate {
    _id: string;
    order: number;
    is_visible: boolean;
}

export interface IWidgetMetadata {
    slug: string;
    name: string;
}

export interface IWidgetDefaultConfig {
    slug: string;
    name: string;
    order: number;
    is_visible: boolean;
}

export interface IToolWidgetConfig {
    [toolSlug: string]: {
        widgets: IWidgetDefaultConfig[];
    };
}

export interface IWidgetResponse {
    widgets: IWidgetDoc[];
    metadata: IWidgetMetadata[];
}