import { PartialType } from '@nestjs/swagger';
import { EmployeeCreateRequestDto } from './employee.create.request.dto';

/**
 * Update = every create field, all optional. The full field set (basic, job,
 * address, salary, bank, emergency, immigration, RTW, reporting) is declared
 * once on EmployeeCreateRequestDto and inherited here — no duplication.
 */
export class EmployeeUpdateRequestDto extends PartialType(
    EmployeeCreateRequestDto
) {}
