export interface IAuthCompanyData {
    _id: string;
    company_name: string;
    contact_name: string;
    contact_first_name?: string;
    contact_last_name?: string;
    email: string;
    mobile?: string;
    country_code?: any;
    website?: string;
    tenantId?: string;
    createdAt?: Date;
    updatedAt?: Date;
    is_subscribe?: boolean;
    subscription_id?: any;
    tools?: any[];
}

export interface IAuthUserData {
    _id: string;
    name: string;
    email: string;
    country_code?: any;
    mobile?: string;
    role?: any;
    gender?: string;
    status?: string;
    createdAt?: Date;
}

export interface IAuthLoginResponse {
    tokenType: string;
    expiresIn: number;
    accessToken: string;
    refreshToken: string;
    userData?: IAuthUserData;
    companyData?: IAuthCompanyData;
}