export interface ICronService {
    checkCustomerSubscription(): Promise<void>;
    deductCustomerRecurringCharge(): Promise<void>;
    checkAndStartNewCustomerPlan(): Promise<void>;
}