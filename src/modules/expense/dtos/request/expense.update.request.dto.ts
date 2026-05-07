import { PartialType } from '@nestjs/swagger';
import { ExpenseCreateRequestDto } from './expense.create.request.dto';

export class ExpenseUpdateRequestDto extends PartialType(ExpenseCreateRequestDto) {}
