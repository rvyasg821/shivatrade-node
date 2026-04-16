import { ENUM_DISCOUNT_TYPE } from '../repository/entities/discount.entity';

export interface IDiscountEntity {
    _id: string;
    name: string;
    discount_type: ENUM_DISCOUNT_TYPE;
    discount_value: number;
    discount_code: string;
    description?: string;
    max_occurances?: number;
    start_date?: Date;
    end_date?: Date;
    status: number;
    is_expired: boolean;
    deletedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

export interface IDiscountAppliedEntity {
    _id: string;
    company_id: string;
    user_id: string;
    subscription_id: string;
    discount_id: string;
    discount_code: string;
    discount_price: number;
    createdAt: Date;
    updatedAt: Date;
}

export interface IDiscountCalculation {
    total_price: number;
    discounted_price: number;
    final_price: number;
    discount_percentage?: number;
}

export interface IDiscountValidation {
    is_valid: boolean;
    is_expired: boolean;
    is_inactive: boolean;
    is_max_exceeded: boolean;
    message: string;
}
