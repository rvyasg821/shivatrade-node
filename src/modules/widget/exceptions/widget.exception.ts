import { HttpException, HttpStatus } from '@nestjs/common';

export class WidgetNotFoundException extends HttpException {
    constructor(widgetId?: string) {
        const message = widgetId 
            ? `Widget with ID ${widgetId} not found`
            : 'Widget not found';
        
        super(
            {
                statusCode: HttpStatus.NOT_FOUND,
                message,
                error: 'Widget Not Found',
            },
            HttpStatus.NOT_FOUND
        );
    }
}

export class WidgetAccessDeniedException extends HttpException {
    constructor(widgetId?: string) {
        const message = widgetId 
            ? `Access denied to widget ${widgetId}`
            : 'Access denied to widget';
        
        super(
            {
                statusCode: HttpStatus.FORBIDDEN,
                message,
                error: 'Widget Access Denied',
            },
            HttpStatus.FORBIDDEN
        );
    }
}

export class WidgetValidationException extends HttpException {
    constructor(message: string = 'Widget validation failed') {
        super(
            {
                statusCode: HttpStatus.BAD_REQUEST,
                message,
                error: 'Widget Validation Error',
            },
            HttpStatus.BAD_REQUEST
        );
    }
}

export class ToolNotAvailableException extends HttpException {
    constructor(toolSlug?: string) {
        const message = toolSlug 
            ? `Tool ${toolSlug} is not available`
            : 'Tool is not available';
        
        super(
            {
                statusCode: HttpStatus.BAD_REQUEST,
                message,
                error: 'Tool Not Available',
            },
            HttpStatus.BAD_REQUEST
        );
    }
}

export class WidgetOwnershipException extends HttpException {
    constructor(widgetIds: string[]) {
        const message = `Access denied to widgets: ${widgetIds.join(', ')}`;
        
        super(
            {
                statusCode: HttpStatus.FORBIDDEN,
                message,
                error: 'Widget Ownership Error',
            },
            HttpStatus.FORBIDDEN
        );
    }
}

export class WidgetProvisioningException extends HttpException {
    constructor(message: string = 'Widget provisioning failed') {
        super(
            {
                statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
                message,
                error: 'Widget Provisioning Error',
            },
            HttpStatus.INTERNAL_SERVER_ERROR
        );
    }
}