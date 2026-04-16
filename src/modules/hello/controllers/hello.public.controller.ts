import { Controller, Get, Post, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { HelperDateService } from '@common/helper/services/helper.date.service';
import { Response } from '@common/response/decorators/response.decorator';
import { IResponse } from '@common/response/interfaces/response.interface';
import { HelloDoc } from '@modules/hello/docs/hello.doc';
import { HelloResponseDto } from '@modules/hello/dtos/response/hello.response.dto';
import { NodemailerService } from '@modules/email/services/nodemailer.service';

@ApiTags('modules.public.hello')
@Controller({
    version: VERSION_NEUTRAL,
    path: '/hello',
})
export class HelloPublicController {
    constructor(
        private readonly helperDateService: HelperDateService,
        private readonly nodemailerService: NodemailerService,
    ) {}

    @HelloDoc()
    @Response('hello.hello', {
        cached: true,
    })
    @Get('/')
    async hello(): Promise<IResponse<HelloResponseDto>> {
        const today = this.helperDateService.create();

        return {
            data: {
                date: today,
                format: this.helperDateService.formatToIso(today),
                timestamp: this.helperDateService.getTimestamp(today),
            },
        };
    }

    @Post('send-dummy-email')
    async sendDummyEmail(): Promise<string> {
        await this.nodemailerService.sendEmail(
            'fefosod376@iotrama.com',
            'Test Subject',
            'This is a test email from the NestJS application.',
        );
        return 'Dummy email sent!';
    }
}

