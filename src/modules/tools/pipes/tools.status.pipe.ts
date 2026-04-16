import { Injectable, BadRequestException, PipeTransform } from '@nestjs/common';
import { ToolsDoc } from '@modules/tools/repository/entities/tools.entity';
import { ENUM_TOOLS_STATUS } from '@modules/tools/enums/tools.enum';

@Injectable()
export class ToolsStatusPipe implements PipeTransform {
    async transform(value: ToolsDoc): Promise<ToolsDoc> {
        if (value.status !== ENUM_TOOLS_STATUS.ACTIVE) {
            throw new BadRequestException({
                statusCode: 5003,
                message: 'tools.error.inactive',
            });
        }

        return value;
    }
}