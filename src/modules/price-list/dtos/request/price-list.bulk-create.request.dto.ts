import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, ValidateNested } from 'class-validator';

import { PriceListCreateRequestDto } from './price-list.create.request.dto';

/**
 * Bulk price-list create — used by the "Manage Vendor Pricing by Product" grid
 * to save several vendor rows in one request. Each item is a full create row;
 * the service inserts them as new versioned entries (versioning by
 * effective_date), so editing a vendor's price = a new item with a newer date.
 */
export class PriceListBulkCreateRequestDto {
    @IsArray()
    @ArrayMinSize(1)
    @ValidateNested({ each: true })
    @Type(() => PriceListCreateRequestDto)
    items: PriceListCreateRequestDto[];
}
