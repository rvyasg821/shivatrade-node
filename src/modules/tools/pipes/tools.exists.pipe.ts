import { Injectable, ConflictException, PipeTransform } from '@nestjs/common';
import { ToolsService } from '@modules/tools/services/tools.service';

@Injectable()
export class ToolsExistsPipe implements PipeTransform {
    constructor(private readonly toolsService: ToolsService) { }

    async transform(value: any): Promise<string> {
        const exists: boolean = await this.toolsService.existByName(value);
        if (exists) {
            throw new ConflictException({
                statusCode: 5002,
                message: 'tools.error.alreadyExists',
            });
        }

        return value;
    }
}