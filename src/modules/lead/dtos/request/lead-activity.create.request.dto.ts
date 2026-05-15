import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * Public note submission. The body is the only field — `type` is always
 * `note` for user-submitted activities; system events are inserted from
 * within the service layer.
 */
export class LeadActivityCreateRequestDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(5000)
    body: string;
}
