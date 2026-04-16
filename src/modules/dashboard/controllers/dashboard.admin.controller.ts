import {
    Controller,
    Get,
    Logger,
    Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
    Response,
} from '@common/response/decorators/response.decorator';
import {
    IResponse,
} from '@common/response/interfaces/response.interface';
import {
    AuthJwtAccessProtected,
} from '@modules/auth/decorators/auth.jwt.decorator';
import { CompanyService } from '@modules/company/services/company.service';
import { SubscriptionService } from '@modules/subscription/services/subscription.service';
import { PaymentService } from '@modules/payment/services/payment.service';
import { UserService } from '@modules/user/services/user.service';
import { ENUM_PAYMENT_STATUS } from '@modules/payment/repository/entities/payment.entity';

export interface IDashboardStats {
    totalCompanies: number;
    activeSubscriptions: number;
    totalRevenue: number;
    newSignups: number;
    // Additional stats
    trialSubscriptions: number;
    expiredSubscriptions: number;
    totalPayments: number;
    revenueThisMonth: number;
}

export interface IRecentActivity {
    type: 'signup' | 'payment' | 'subscription';
    title: string;
    description: string;
    amount?: number;
    date: Date;
    id: string;
}

export interface IChartData {
    revenueByMonth: { month: string; revenue: number }[];
    subscriptionsByMonth: { month: string; active: number; trial: number; expired: number }[];
    signupsByWeek: { week: string; count: number }[];
}

export interface ICompanyWithSubscription {
    _id: string;
    name: string;
    email: string;
    createdAt: Date;
    subscription?: {
        status: boolean;
        trial: boolean;
        plan_name?: string;
        end_date?: Date;
    };
}

@ApiTags('Dashboard')
@Controller({
    version: '1',
    path: '/admin/dashboard',
})
export class DashboardAdminController {
    private readonly logger = new Logger(DashboardAdminController.name);

    constructor(
        private readonly companyService: CompanyService,
        private readonly subscriptionService: SubscriptionService,
        private readonly paymentService: PaymentService,
        private readonly userService: UserService,
    ) {}

    @Response('dashboard.stats')
    @AuthJwtAccessProtected()
    @Get('/stats')
    async getStats(): Promise<IResponse<IDashboardStats>> {
        try {
            this.logger.log('Fetching dashboard statistics...');

            // Get current date info for time-based queries
            const now = new Date();
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            const startOfWeek = new Date(now);
            startOfWeek.setDate(now.getDate() - 7);

            // Fetch all stats in parallel for better performance
            const [
                totalCompanies,
                activeSubscriptions,
                trialSubscriptions,
                expiredSubscriptions,
                totalPayments,
                payments,
                paymentsThisMonth,
                newSignupsThisWeek,
            ] = await Promise.all([
                // Total companies (not soft deleted)
                this.companyService.getTotal({ soft_delete: false }),

                // Active subscriptions
                this.subscriptionService.getTotal({
                    status: true,
                    soft_delete: false,
                }),

                // Trial subscriptions
                this.subscriptionService.getTotal({
                    trial: true,
                    status: true,
                    soft_delete: false,
                }),

                // Expired/Cancelled subscriptions
                this.subscriptionService.getTotal({
                    status: false,
                    soft_delete: false,
                }),

                // Total payments count
                this.paymentService.getTotal({ soft_delete: false }),

                // All completed payments for total revenue
                this.paymentService.findAll({
                    status: ENUM_PAYMENT_STATUS.COMPLETED,
                }),

                // Payments this month for monthly revenue
                this.paymentService.findAll({
                    status: ENUM_PAYMENT_STATUS.COMPLETED,
                    createdAt: { $gte: startOfMonth },
                }),

                // New signups this week (companies created in last 7 days)
                this.companyService.getTotal({
                    soft_delete: false,
                    createdAt: { $gte: startOfWeek },
                }),
            ]);

            // Debug logging for payments
            this.logger.log(`Found ${payments.length} completed payments`);
            if (payments.length > 0) {
                this.logger.log(`Sample payment final_price: ${payments[0]?.final_price}, total: ${payments[0]?.total}`);
            }

            // Calculate total revenue (using final_price field)
            const totalRevenue = payments.reduce((sum, payment) => {
                return sum + (payment.final_price || payment.total || 0);
            }, 0);

            // Calculate revenue this month (using final_price field)
            const revenueThisMonth = paymentsThisMonth.reduce((sum, payment) => {
                return sum + (payment.final_price || payment.total || 0);
            }, 0);

            this.logger.log(`Total revenue calculated: ${totalRevenue}, This month: ${revenueThisMonth}`);

            const stats: IDashboardStats = {
                totalCompanies,
                activeSubscriptions,
                totalRevenue: Math.round(totalRevenue * 100) / 100,
                newSignups: newSignupsThisWeek,
                trialSubscriptions,
                expiredSubscriptions,
                totalPayments,
                revenueThisMonth: Math.round(revenueThisMonth * 100) / 100,
            };

            this.logger.log(`Dashboard stats fetched: ${JSON.stringify(stats)}`);

            return {
                data: stats,
            };
        } catch (error) {
            this.logger.error(`Failed to fetch dashboard stats: ${error.message}`);
            throw error;
        }
    }

    @Response('dashboard.recentActivity')
    @AuthJwtAccessProtected()
    @Get('/recent-activity')
    async getRecentActivity(
        @Query('limit') limit: number = 10,
    ): Promise<IResponse<IRecentActivity[]>> {
        try {
            this.logger.log('Fetching recent activity...');
            const activityLimit = Math.min(Number(limit) || 10, 50);

            // Fetch recent data in parallel
            const [allCompanies, allPayments, allSubscriptions] = await Promise.all([
                // Recent company signups
                this.companyService.findAll({ soft_delete: false }),
                // Recent payments
                this.paymentService.findAll({ status: ENUM_PAYMENT_STATUS.COMPLETED }),
                // Recent subscriptions
                this.subscriptionService.findAll({ soft_delete: false }),
            ]);

            // Sort by createdAt descending and limit results
            const recentCompanies = allCompanies
                .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                .slice(0, activityLimit);
            const recentPayments = allPayments
                .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                .slice(0, activityLimit);
            const recentSubscriptions = allSubscriptions
                .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                .slice(0, activityLimit);

            // Combine and format activities
            const activities: IRecentActivity[] = [];

            // Add company signups
            recentCompanies.forEach((company: any) => {
                activities.push({
                    type: 'signup',
                    title: 'New Company Signup',
                    description: company.name || company.company_name || 'Unknown Company',
                    date: company.createdAt,
                    id: company._id?.toString(),
                });
            });

            // Add payments
            recentPayments.forEach((payment: any) => {
                activities.push({
                    type: 'payment',
                    title: 'Payment Received',
                    description: `Payment #${payment.full_inv_number || payment._id?.toString()?.slice(-6)}`,
                    amount: payment.final_price || payment.total || 0,
                    date: payment.createdAt,
                    id: payment._id?.toString(),
                });
            });

            // Add subscription changes
            recentSubscriptions.forEach((sub: any) => {
                const isNew = new Date(sub.createdAt).getTime() === new Date(sub.updatedAt).getTime();
                activities.push({
                    type: 'subscription',
                    title: isNew ? 'New Subscription' : 'Subscription Updated',
                    description: sub.trial ? 'Trial Subscription' : (sub.status ? 'Active Subscription' : 'Subscription Expired'),
                    date: sub.updatedAt || sub.createdAt,
                    id: sub._id?.toString(),
                });
            });

            // Sort by date descending and limit
            activities.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            const limitedActivities = activities.slice(0, activityLimit);

            this.logger.log(`Fetched ${limitedActivities.length} recent activities`);

            return {
                data: limitedActivities,
            };
        } catch (error) {
            this.logger.error(`Failed to fetch recent activity: ${error.message}`);
            throw error;
        }
    }

    @Response('dashboard.chartData')
    @AuthJwtAccessProtected()
    @Get('/chart-data')
    async getChartData(
        @Query('months') months: number = 6,
    ): Promise<IResponse<IChartData>> {
        try {
            this.logger.log('Fetching chart data...');
            const monthsToFetch = Math.min(Number(months) || 6, 12);

            // Calculate date range for the last N months
            const now = new Date();
            const startDate = new Date(now.getFullYear(), now.getMonth() - monthsToFetch + 1, 1);

            // Fetch all data for the period
            const [payments, subscriptions, companies] = await Promise.all([
                this.paymentService.findAll({
                    status: ENUM_PAYMENT_STATUS.COMPLETED,
                    createdAt: { $gte: startDate },
                }),
                this.subscriptionService.findAll({
                    soft_delete: false,
                    createdAt: { $gte: startDate },
                }),
                this.companyService.findAll(
                    { soft_delete: false, createdAt: { $gte: startDate } }
                ),
            ]);

            // Generate month labels
            const monthLabels: string[] = [];
            for (let i = 0; i < monthsToFetch; i++) {
                const date = new Date(now.getFullYear(), now.getMonth() - monthsToFetch + 1 + i, 1);
                monthLabels.push(date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }));
            }

            // Calculate revenue by month
            const revenueByMonth = monthLabels.map((month, index) => {
                const monthDate = new Date(now.getFullYear(), now.getMonth() - monthsToFetch + 1 + index, 1);
                const nextMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1);

                const monthRevenue = payments
                    .filter((p: any) => {
                        const paymentDate = new Date(p.createdAt);
                        return paymentDate >= monthDate && paymentDate < nextMonth;
                    })
                    .reduce((sum: number, p: any) => sum + (p.final_price || p.total || 0), 0);

                return { month, revenue: Math.round(monthRevenue * 100) / 100 };
            });

            // Calculate subscriptions by month (cumulative active at end of each month)
            const subscriptionsByMonth = monthLabels.map((month, index) => {
                const monthEnd = new Date(now.getFullYear(), now.getMonth() - monthsToFetch + 2 + index, 0);

                const activeCount = subscriptions.filter((s: any) => {
                    const createdAt = new Date(s.createdAt);
                    return createdAt <= monthEnd && s.status === true && !s.trial;
                }).length;

                const trialCount = subscriptions.filter((s: any) => {
                    const createdAt = new Date(s.createdAt);
                    return createdAt <= monthEnd && s.trial === true && s.status === true;
                }).length;

                const expiredCount = subscriptions.filter((s: any) => {
                    const createdAt = new Date(s.createdAt);
                    return createdAt <= monthEnd && s.status === false;
                }).length;

                return { month, active: activeCount, trial: trialCount, expired: expiredCount };
            });

            // Calculate signups by week (last 8 weeks)
            const signupsByWeek: { week: string; count: number }[] = [];
            for (let i = 7; i >= 0; i--) {
                const weekStart = new Date(now);
                weekStart.setDate(now.getDate() - (i * 7) - 6);
                weekStart.setHours(0, 0, 0, 0);

                const weekEnd = new Date(now);
                weekEnd.setDate(now.getDate() - (i * 7));
                weekEnd.setHours(23, 59, 59, 999);

                const weekLabel = `Week ${8 - i}`;
                const count = companies.filter((c: any) => {
                    const createdAt = new Date(c.createdAt);
                    return createdAt >= weekStart && createdAt <= weekEnd;
                }).length;

                signupsByWeek.push({ week: weekLabel, count });
            }

            const chartData: IChartData = {
                revenueByMonth,
                subscriptionsByMonth,
                signupsByWeek,
            };

            this.logger.log('Chart data fetched successfully');

            return {
                data: chartData,
            };
        } catch (error) {
            this.logger.error(`Failed to fetch chart data: ${error.message}`);
            throw error;
        }
    }

    @Response('dashboard.companies')
    @AuthJwtAccessProtected()
    @Get('/companies')
    async getRecentCompanies(
        @Query('limit') limit: number = 10,
    ): Promise<IResponse<ICompanyWithSubscription[]>> {
        try {
            this.logger.log('Fetching recent companies with subscription status...');
            const companyLimit = Math.min(Number(limit) || 10, 50);

            // Fetch recent companies and sort/limit in memory
            const allCompanies = await this.companyService.findAll({ soft_delete: false });
            const companies = allCompanies
                .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                .slice(0, companyLimit);

            // Fetch subscriptions for these companies
            const companyIds = companies.map((c: any) => c._id);
            const subscriptions = await this.subscriptionService.findAll({
                company_id: { $in: companyIds },
                soft_delete: false,
            });

            // Create a map of company_id to subscription
            const subscriptionMap = new Map();
            subscriptions.forEach((sub: any) => {
                const companyId = sub.company_id?.toString();
                // Keep the most recent subscription for each company
                if (!subscriptionMap.has(companyId) ||
                    new Date(sub.createdAt) > new Date(subscriptionMap.get(companyId).createdAt)) {
                    subscriptionMap.set(companyId, sub);
                }
            });

            // Map companies with their subscription info
            const companiesWithSub: ICompanyWithSubscription[] = companies.map((company: any) => {
                const sub = subscriptionMap.get(company._id?.toString());
                return {
                    _id: company._id?.toString(),
                    name: company.name || company.company_name || 'Unknown',
                    email: company.email || company.company_email || '',
                    createdAt: company.createdAt,
                    subscription: sub ? {
                        status: sub.status,
                        trial: sub.trial || false,
                        plan_name: sub.plan_id?.name || sub.plan_name || 'N/A',
                        end_date: sub.end_date,
                    } : undefined,
                };
            });

            this.logger.log(`Fetched ${companiesWithSub.length} companies with subscription status`);

            return {
                data: companiesWithSub,
            };
        } catch (error) {
            this.logger.error(`Failed to fetch companies: ${error.message}`);
            throw error;
        }
    }
}
