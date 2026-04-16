import { Injectable, NotFoundException, PipeTransform } from '@nestjs/common';
import { ToolsDoc } from '@modules/tools/repository/entities/tools.entity';
import { ToolsService } from '@modules/tools/services/tools.service';

@Injectable()
export class ToolsParsePipe implements PipeTransform {
    constructor(private readonly toolsService: ToolsService) { }

    async transform(value: any): Promise<ToolsDoc> {
        try {
            const tool: ToolsDoc = await this.toolsService.findOneById(value);
            if (!tool) {
                throw new NotFoundException({
                    statusCode: 5001,
                    message: 'tools.error.notFound',
                });
            }

            return tool;
        } catch (err: any) {
            throw new NotFoundException({
                statusCode: 5001,
                message: 'tools.error.notFound',
            });
        }
    }
}