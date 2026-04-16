import { Injectable, Logger } from '@nestjs/common';
import { SubscriptionDoc } from '@modules/subscription/repository/entities/subscription.entity';
import { IRecalculatedPricing } from '../interfaces/tool-deletion-job.interface';

@Injectable()
export class PricingRecalculationService {

    async recalculateSubscriptionPrice(
        subscription: SubscriptionDoc,
        removedToolPrice: number
    ): Promise<IRecalculatedPricing> {
        console.log(
            `Recalculating pricing for subscription ${subscription._id}, removing tool price: ${removedToolPrice}`
        );

        // Store original values
        const originalToolsPrice = subscription.tools_price;
        const originalSubtotal = subscription.subtotal;
        const originalFinalPrice = subscription.final_price;

        // Calculate new tools price
        const newToolsPrice = Math.max(0, originalToolsPrice - removedToolPrice);

        // Calculate new subtotal (plan_price + tools)
        const subtotal = subscription.plan_price + newToolsPrice;

        // Use stored tax rate or calculate from original values
        let taxRate = subscription.tax_rate || 0;
        if (!taxRate && originalSubtotal > 0) {
            taxRate = (subscription.tax_price / originalSubtotal) * 100;
        }

        // Calculate new tax value
        const taxValue = this.applyTaxCalculation(subtotal, taxRate / 100);

        // Calculate new final price
        const finalPrice = subtotal + taxValue;

        const recalculatedPricing: IRecalculatedPricing = {
            originalToolsPrice,
            newToolsPrice,
            platformPrice: subscription.plan_price,
            totalPrice: subtotal,
            taxValue,
            finalPrice,
        };

        console.log(
            `Pricing recalculated for subscription ${subscription._id}: ` +
            `tools_price: ${originalToolsPrice} -> ${newToolsPrice}, ` +
            `subtotal: ${originalSubtotal} -> ${subtotal}, ` +
            `final_price: ${originalFinalPrice} -> ${finalPrice}`
        );

        return recalculatedPricing;
    }

    applyTaxCalculation(totalPrice: number, taxRate: number): number {
        if (totalPrice < 0) {
            console.warn(`Negative total price detected: ${totalPrice}, returning 0 tax`);
            return 0;
        }

        if (taxRate < 0 || taxRate > 1) {
            console.warn(`Invalid tax rate detected: ${taxRate}, using 0`);
            return 0;
        }

        const taxValue = totalPrice * taxRate;
        
        return Math.round(taxValue * 100) / 100;
    }

    validatePricing(pricing: IRecalculatedPricing): boolean {
        // Check that tools price is non-negative
        if (pricing.newToolsPrice < 0) {
            console.error(`Invalid tools price: ${pricing.newToolsPrice}`);
            return false;
        }

        // Check that total price equals platform + tools
        const expectedTotal = pricing.platformPrice + pricing.newToolsPrice;
        if (Math.abs(pricing.totalPrice - expectedTotal) > 0.01) {
            console.error(
                `Total price mismatch: expected ${expectedTotal}, got ${pricing.totalPrice}`
            );
            return false;
        }

        // Check that final price equals total + tax
        const expectedFinal = pricing.totalPrice + pricing.taxValue;
        if (Math.abs(pricing.finalPrice - expectedFinal) > 0.01) {
            console.error(
                `Final price mismatch: expected ${expectedFinal}, got ${pricing.finalPrice}`
            );
            return false;
        }

        return true;
    }
}
