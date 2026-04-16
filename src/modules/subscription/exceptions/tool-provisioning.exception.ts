import { HttpException, HttpStatus } from '@nestjs/common';
import { ENUM_SUBSCRIPTION_STATUS_CODE_ERROR } from '../enums/subscription.enum';

export class ToolProvisioningException extends HttpException {
    constructor(subscriptionId: string, message?: string) {
        super(
            {
                statusCode: ENUM_SUBSCRIPTION_STATUS_CODE_ERROR.TOOL_PROVISIONING_FAILED,
                message: message || `Tool provisioning failed for subscription ${subscriptionId}`,
                error: 'Tool Provisioning Failed',
            },
            HttpStatus.INTERNAL_SERVER_ERROR
        );
    }
}

export class TenantConnectionException extends HttpException {
    constructor(tenantId: string, message?: string) {
        super(
            {
                statusCode: ENUM_SUBSCRIPTION_STATUS_CODE_ERROR.TENANT_CONNECTION_FAILED,
                message: message || `Failed to connect to tenant database for tenant ${tenantId}`,
                error: 'Tenant Connection Failed',
            },
            HttpStatus.SERVICE_UNAVAILABLE
        );
    }
}

export class ToolDataValidationException extends HttpException {
    constructor(toolId: string, validationErrors: string[]) {
        super(
            {
                statusCode: ENUM_SUBSCRIPTION_STATUS_CODE_ERROR.TOOL_DATA_VALIDATION_FAILED,
                message: `Tool data validation failed for tool ${toolId}: ${validationErrors.join(', ')}`,
                error: 'Tool Data Validation Failed',
                details: validationErrors,
            },
            HttpStatus.BAD_REQUEST
        );
    }
}

export class ProvisioningRollbackException extends HttpException {
    constructor(subscriptionId: string, originalError: string, rollbackError?: string) {
        const message = rollbackError 
            ? `Provisioning failed for subscription ${subscriptionId} and rollback also failed. Original error: ${originalError}. Rollback error: ${rollbackError}`
            : `Failed to rollback provisioning for subscription ${subscriptionId}. Original error: ${originalError}`;

        super(
            {
                statusCode: ENUM_SUBSCRIPTION_STATUS_CODE_ERROR.PROVISIONING_ROLLBACK_FAILED,
                message,
                error: 'Provisioning Rollback Failed',
                originalError,
                rollbackError,
            },
            HttpStatus.INTERNAL_SERVER_ERROR
        );
    }
}