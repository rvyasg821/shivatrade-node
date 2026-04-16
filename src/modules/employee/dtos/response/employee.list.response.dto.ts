import { ApiProperty } from '@nestjs/swagger';
import { EmployeeGetResponseDto } from './employee.get.response.dto';

export class EmployeeListResponseDto extends EmployeeGetResponseDto {
    @ApiProperty({
        required: false,
        type: Object,
        description: 'Populated location information',
    })
    location?: {
        _id: string;
        location_name: string;
        location_code: string;
        city?: string;
        country?: string;
    };

}
