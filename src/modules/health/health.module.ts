import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';





@Module({
    providers: [],
    exports: [
        TerminusModule,
    ],
    imports: [
        TerminusModule.forRoot({
            gracefulShutdownTimeoutMs: 1000,
        }),
    ],
})
export class HealthModule {}
