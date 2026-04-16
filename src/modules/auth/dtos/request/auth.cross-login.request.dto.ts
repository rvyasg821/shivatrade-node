import { IsNotEmpty, IsString, IsOptional, IsEnum } from 'class-validator';

/**
 * Actions that can be performed after cross-login
 */
export enum CrossLoginAction {
    VIEW_SUBSCRIPTION = 'view_subscription',
    UPGRADE_PLAN = 'upgrade_plan',
    EDIT_SUBSCRIPTION = 'edit_subscription',
    CANCEL_SUBSCRIPTION = 'cancel_subscription',
    REPURCHASE_PLAN = 'repurchase_plan',
    MANAGE_BILLING = 'manage_billing',
}

/**
 * DTO for cross-app login request
 * Token is passed as query parameter from appointment app
 */
export class AuthCrossLoginRequestDto {
    @IsNotEmpty()
    @IsString()
    token: string;

    @IsOptional()
    @IsEnum(CrossLoginAction)
    action?: CrossLoginAction;

    @IsOptional()
    @IsString()
    redirect?: string;
}

/**
 * Interface for cross-login JWT payload
 * This is what the appointment app should include in the token
 */
export interface ICrossLoginTokenPayload {
    // Required fields
    saas_user_id: string;      // User ID in SaaS app (mapped during sync)
    saas_company_id: string;   // Company ID in SaaS app

    // Optional fields
    appointment_user_id?: string;   // User ID in appointment app
    appointment_company_id?: string; // Company ID in appointment app
    action?: CrossLoginAction;       // Action to perform after login

    // Standard JWT fields (set automatically)
    iat?: number;  // Issued at
    exp?: number;  // Expiration time
    iss?: string;  // Issuer (appointment-app)
    aud?: string;  // Audience (saas-app)
}
