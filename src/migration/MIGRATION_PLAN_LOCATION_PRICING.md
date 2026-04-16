# Plan Location-Based Pricing Migration

## Overview

This migration updates the Plan schema to support location-based pricing, allowing plans to have different prices based on the number of locations (1, 3, 5, 10, etc.).

## What Changes?

### 1. Location Pricing

**Before:**
```typescript
{
  platform_price: 100  // Single price for platform
}
```

**After:**
```typescript
{
  platform_price: 100,  // DEPRECATED - kept for backward compatibility
  location_pricing: [
    {
      locations: 1,
      monthly_price: 100,
      yearly_price: 1200,
      platform_fee: 10
    },
    {
      locations: 3,
      monthly_price: 250,
      yearly_price: 2500,
      platform_fee: 25
    }
    // ... more tiers
  ]
}
```

### 2. Tool Pricing

**Before:**
```typescript
{
  tools: [
    {
      _id: "...",
      name: "Security Tool",
      price: 50
    }
  ]
}
```

**After:**
```typescript
{
  tools: [
    {
      _id: "...",
      name: "Security Tool",
      price: 50,  // DEPRECATED - kept for backward compatibility
      base_price: 50,
      pricing_mode: "fixed" | "multiplier",
      location_multiplier: 1.0  // Used when pricing_mode is "multiplier"
    }
  ]
}
```

## Pricing Modes

### FIXED
Price remains the same regardless of number of locations.
- Example: base_price = $50, location_multiplier = N/A
- Cost for 1 location: $50
- Cost for 5 locations: $50 (same price)

### MULTIPLIER
Price scales with number of locations using a multiplier.
- Example: base_price = $50, location_multiplier = 0.8
- Cost for 1 location: $50 × 1 = $50
- Cost for 5 locations: $50 × 5 × 0.8 = $200
- The multiplier (0.8) gives a 20% discount per additional location

## How to Run

### Migrate to New Schema

```bash
# Using yarn
yarn migrate:plan-location-pricing

# Using npm
npm run migrate:plan-location-pricing

# Direct command
nestjs-command migrate:plan-location-pricing
```

### Rollback to Old Schema

```bash
# Using yarn
yarn rollback:plan-location-pricing

# Using npm
npm run rollback:plan-location-pricing

# Direct command
nestjs-command rollback:plan-location-pricing
```

## What the Migration Does

### Forward Migration (`migrate:plan-location-pricing`)

1. **Finds all existing plans** in the database
2. **Converts `platform_price` to `location_pricing`**:
   - Creates a single tier with 1 location
   - Sets monthly_price to the old platform_price
   - Sets yearly_price to monthly_price × 12
   - Sets platform_fee to 0
3. **Converts each tool's pricing**:
   - Copies `price` to `base_price`
   - Sets `pricing_mode` to "fixed"
   - Sets `location_multiplier` to 1.0
4. **Preserves deprecated fields** for backward compatibility

### Rollback (`rollback:plan-location-pricing`)

1. **Finds all plans** with the new structure
2. **Converts `location_pricing` back to `platform_price`**:
   - Uses the monthly_price from the first location tier
   - Removes the location_pricing array
3. **Converts tool pricing back**:
   - Copies `base_price` to `price`
   - Removes `pricing_mode`
   - Removes `location_multiplier`

## Safety

- **Idempotent**: Can be run multiple times safely
- **Skips already migrated plans**: Won't duplicate data
- **Preserves old fields**: Deprecated fields remain for backward compatibility
- **Detailed logging**: Shows exactly what's being changed
- **Migration summary**: Reports how many plans were migrated vs skipped

## Important Notes

⚠️ **Before Running Migration:**
1. **Backup your database** - Always backup before running migrations
2. **Test in development** - Run in dev/staging environment first
3. **Check plan data** - Review your existing plans to understand what will change

⚠️ **After Running Migration:**
1. **Verify plan data** - Check that location_pricing arrays were created correctly
2. **Update frontend** - Frontend code needs to use new location_pricing fields
3. **Test payment flows** - Ensure subscription creation works with new pricing

⚠️ **Rollback Warning:**
- Rolling back will **remove all location pricing tiers except the first one**
- Any custom location pricing configurations will be lost
- Only use rollback if you need to revert to the old pricing model

## Example Output

```
=== Plan Location-Based Pricing Migration ===

This migration updates the plan schema to support location-based pricing:

CHANGES:
  1. Convert platform_price → location_pricing array (1 location tier)
  2. Convert tool.price → tool.base_price
  3. Add tool.pricing_mode (default: FIXED)
  4. Add tool.location_multiplier (default: 1.0)

Found 3 plans to migrate...

  ✓ Plan "Basic": Converting platform_price ($100) to location_pricing
  ✓ Plan "Basic": Migrating 2 tool(s) to new pricing structure
  ✓ Plan "Professional": Converting platform_price ($200) to location_pricing
  ✓ Plan "Professional": Migrating 5 tool(s) to new pricing structure
  ✓ Plan "Enterprise": Converting platform_price ($500) to location_pricing
  ✓ Plan "Enterprise": Migrating 8 tool(s) to new pricing structure

=== Migration Summary ===
✓ Total plans processed: 3
✓ Plans migrated: 3
✓ Plans skipped (already migrated): 0

Migration completed successfully!
```

## Troubleshooting

### Migration fails with "Cannot find module"
- Run `yarn install` or `npm install` to ensure dependencies are up to date
- Make sure you're in the `node` directory

### Plans not being migrated
- Check if plans already have `location_pricing` field - migration skips already migrated plans
- Check console output for specific error messages

### Need to re-run migration
- Migration is idempotent - safe to run multiple times
- If a plan is already migrated, it will be skipped

## Related Files

- Migration Script: `src/migration/seeds/migration.plan-location-pricing.seed.ts`
- Plan Entity: `src/modules/plan/repository/entities/plan.entity.ts`
- Plan DTOs: `src/modules/plan/dtos/`
- Plan Enums: `src/modules/plan/enums/plan.enum.ts`
