import { OmitType } from '@nestjs/swagger';
import { LocationGetResponseDto } from './location.get.response.dto';

export class LocationListResponseDto extends OmitType(LocationGetResponseDto, [
    'business_hours', // Exclude business hours from list view for performance
] as const) {}
