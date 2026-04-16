import {
    BadRequestException,
    ConflictException,
    NotFoundException,
} from '@nestjs/common';
import { ENUM_TOOLS_STATUS_CODE_ERROR } from '@modules/tools/enums/tools.status-code.enum';

export class ToolsNotFoundException extends NotFoundException {
    constructor(toolId?: string) {
        super({
            statusCode: ENUM_TOOLS_STATUS_CODE_ERROR.NOT_FOUND,
            message: 'tools.error.notFound',
            _metadata: {
                toolId,
            },
        });
    }
}

export class ToolsAlreadyExistsException extends ConflictException {
    constructor(name: string) {
        super({
            statusCode: ENUM_TOOLS_STATUS_CODE_ERROR.ALREADY_EXISTS,
            message: 'tools.error.alreadyExists',
            _metadata: {
                name,
            },
        });
    }
}

export class ToolsInactiveException extends BadRequestException {
    constructor(toolId: string) {
        super({
            statusCode: ENUM_TOOLS_STATUS_CODE_ERROR.INACTIVE,
            message: 'tools.error.inactive',
            _metadata: {
                toolId,
            },
        });
    }
}

export class ToolsUsedException extends BadRequestException {
    constructor(toolId: string) {
        super({
            statusCode: ENUM_TOOLS_STATUS_CODE_ERROR.USED,
            message: 'tools.error.used',
            _metadata: {
                toolId,
            },
        });
    }
}