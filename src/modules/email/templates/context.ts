/**
 * Email Template Context Definitions
 * This file contains TypeScript interfaces for all email template variables
 */

// Base context that might be common across templates
export interface BaseEmailContext {
  name?: string;
  email?: string;
  supportEmail?: string;
  homeUrl?: string;
  homeName?: string;
  domain?: string;
}

// Change Password Template Context
export interface ChangePasswordContext extends BaseEmailContext {
  name: string;
  supportEmail: string;
  homeUrl: string;
  homeName: string;
}

// Customer Subscription Template Context
export interface CustomerSubscriptionContext extends BaseEmailContext {
  name?: string;
  email?: string;
  count?: number;
  is_plural?: boolean;
  content?: string;
}

// Customer Subscription Plan Template Context
export interface CustomerSubscriptionPlanContext extends BaseEmailContext {
  name?: string;
  email?: string;
  transation_id?: string; // Note: typo in original template
  method?: string;
  gateway?: string;
  postDateTime?: string;
  status?: string;
  new_plan?: boolean;
  plan_name?: string;
  plan_type_value?: number;
  plan_type?: string;
  content?: string;
}

// Customer Subscription Recurring Template Context
export interface CustomerSubscriptionRecurringContext extends BaseEmailContext {
  name?: string;
  email?: string;
  transation_id?: string; // Note: typo in original template
  method?: string;
  gateway?: string;
  postDateTime?: string;
  status?: string;
  next_date?: string;
  content?: string;
}

// Error 500 Template Context
export interface Error500Context {
  errorTimestamp: string;
  errorMessage: string;
  requestUrl: string;
  ip: string;
}

// Forgot Password Template Context
export interface ForgotPasswordContext {
  text: {
    name?: string;
    content?: boolean;
    email?: string;
    footer?: boolean;
  };
  link: string;
  expiresIn: number; // in minutes
}

// Payment Failed Template Context
export interface PaymentFailedContext extends BaseEmailContext {
  name?: string;
}

// Recurring Payment Reminder Template Context
export interface RecurringPaymentReminderContext extends BaseEmailContext {
  name?: string;
  email?: string;
  next_date?: string;
  days_left?: number;
  plan_name?: string;
  plan_type?: string;
  plan_price?: string;
  card_last4?: string;
  gateway?: string;
  domain?: string;
}

// Reset Password Template Context
export interface ResetPasswordContext extends BaseEmailContext {
  name: string;
  resetPasswordFrontLink: string;
  text: {
    reset_token: string;
  };
}

// Signup OTP Template Context
export interface SignupOtpContext {
  otp: string;
}

// Welcome Template Context
export interface WelcomeContext extends BaseEmailContext {
  name: string;
  email: string;
  password: string;
  domain: string;
}

// Union type for all possible email contexts
export type EmailTemplateContext =
  | ChangePasswordContext
  | CustomerSubscriptionContext
  | CustomerSubscriptionPlanContext
  | CustomerSubscriptionRecurringContext
  | Error500Context
  | ForgotPasswordContext
  | PaymentFailedContext
  | RecurringPaymentReminderContext
  | ResetPasswordContext
  | SignupOtpContext
  | WelcomeContext;

// Template name to context mapping
export interface TemplateContextMap {
  'change-password.template.hbs': ChangePasswordContext;
  'customer_subscription.hjs': CustomerSubscriptionContext;
  'customer_subscription_plan.hjs': CustomerSubscriptionPlanContext;
  'customer_subscription_recurring.hjs': CustomerSubscriptionRecurringContext;
  'error-500.hjs': Error500Context;
  'forgot_password.hjs': ForgotPasswordContext;
  'payment_failed.hjs': PaymentFailedContext;
  'recurring_payment_reminder.hjs': RecurringPaymentReminderContext;
  'reset_password.hjs': ResetPasswordContext;
  'signup_otp.hjs': SignupOtpContext;
  'welcome.hjs': WelcomeContext;
}

// Helper function to get context type for a template
export function getTemplateContext<T extends keyof TemplateContextMap>(
  templateName: T
): TemplateContextMap[T] {
  // This is a type helper function - implementation would depend on your email service
  throw new Error(`Context for template ${templateName} should be provided by the caller`);
}

// Example usage contexts for each template
export const exampleContexts = {
  'change-password.template.hbs': {
    name: 'John Doe',
    supportEmail: 'support@peoplegem.io',
    homeUrl: 'https://app.peoplegem.io',
    homeName: 'PeopleGem'
  } as ChangePasswordContext,

  'customer_subscription.hjs': {
    name: 'John Doe',
    email: 'john@example.com',
    count: 5,
    is_plural: true,
    content: 'Your subscription is about to expire.'
  } as CustomerSubscriptionContext,

  'customer_subscription_plan.hjs': {
    name: 'John Doe',
    email: 'john@example.com',
    transation_id: 'TXN123456789',
    method: 'Credit Card',
    gateway: 'Stripe',
    postDateTime: '2024-01-15 10:30:00',
    status: 'Completed',
    new_plan: true,
    plan_name: 'Premium Plan',
    plan_type_value: 1,
    plan_type: 'month',
    content: 'Your plan has been successfully activated.'
  } as CustomerSubscriptionPlanContext,

  'customer_subscription_recurring.hjs': {
    name: 'John Doe',
    email: 'john@example.com',
    transation_id: 'TXN123456789',
    method: 'Credit Card',
    gateway: 'Stripe',
    postDateTime: '2024-01-15 10:30:00',
    status: 'Completed',
    next_date: '2024-02-15',
    content: 'Your recurring payment has been processed.'
  } as CustomerSubscriptionRecurringContext,

  'error-500.hjs': {
    errorTimestamp: '2024-01-15 10:30:00',
    errorMessage: 'Internal Server Error: Database connection failed',
    requestUrl: '/api/users/profile',
    ip: '192.168.1.100'
  } as Error500Context,

  'forgot_password.hjs': {
    text: {
      name: 'John Doe',
      content: true,
      email: 'john@example.com',
      footer: true
    },
    link: 'https://app.peoplegem.io/reset-password?token=abc123',
    expiresIn: 30
  } as ForgotPasswordContext,

  'payment_failed.hjs': {
    name: 'John Doe'
  } as PaymentFailedContext,

  'recurring_payment_reminder.hjs': {
    name: 'John Doe',
    email: 'john@example.com',
    next_date: '2024-02-15',
    days_left: 3,
    plan_name: 'Premium Plan',
    plan_type: 'Monthly',
    plan_price: '$29.99',
    card_last4: '1234',
    gateway: 'stripe',
    domain: 'https://app.peoplegem.io'
  } as RecurringPaymentReminderContext,

  'reset_password.hjs': {
    name: 'John Doe',
    resetPasswordFrontLink: 'https://app.peoplegem.io/reset-password',
    text: {
      reset_token: 'abc123def456'
    }
  } as ResetPasswordContext,

  'signup_otp.hjs': {
    otp: '123456'
  } as SignupOtpContext,

  'welcome.hjs': {
    name: 'John Doe',
    email: 'john@example.com',
    password: 'tempPassword123',
    domain: 'https://app.peoplegem.io'
  } as WelcomeContext
};