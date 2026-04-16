import { ISelectedTool } from '../repository/entities/subscription.entity';

export interface ISubscriptionEntity {
    _id: string;
    user_id: string;
    plan_id: string;
    plan_type: string;
    plan_type_value: number;
    platform_price: number;
    tools_price: number;
    total_price: number;
    tax_value?: number;
    recurring: boolean;
    start_date: Date;
    next_date: Date;
    end_date: Date;
    hold: boolean;
    trial: boolean;
    is_default: boolean;
    status: boolean;
    cancelledAt: Date;
    soft_delete: boolean;
    is_lifetime: boolean;
    tools: ISelectedTool[];
    createdAt: Date;
    updatedAt: Date;
}