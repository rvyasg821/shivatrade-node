import { ENUM_PLAN_STATUS, ENUM_PLAN_CURRENCY } from '@modules/plan/enums/plan.enum';

export interface IPlanPrice {
    monthly: number;
    yearly: number;
    currency: ENUM_PLAN_CURRENCY;
}

export interface IPlanEntity {
    _id: string;
    name: string;
    description: string;
    price: IPlanPrice;
    features: string[];
    status: ENUM_PLAN_STATUS;
    isDefault: boolean;
    displayOrder: number;
    metadata: Record<string, any>;
    createdAt: Date;
    updatedAt: Date;
    deletedAt?: Date;
    deleted: boolean;
}

export interface IPlanDoc extends IPlanEntity {
    _id: string;
}