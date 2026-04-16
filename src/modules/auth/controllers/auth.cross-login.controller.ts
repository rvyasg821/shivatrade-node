import {
    Controller,
    Get,
    Query,
    Res,
    Req,
    Logger,
    BadRequestException,
    NotFoundException,
    HttpException,
    HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '@modules/auth/services/auth.service';
import { UserService } from '@modules/user/services/user.service';
import { SessionService } from '@modules/session/services/session.service';
import { CompanyService } from '@modules/company/services/company.service';
import { SubscriptionService } from '@modules/subscription/services/subscription.service';
import {
    AuthCrossLoginRequestDto,
    CrossLoginAction,
    ICrossLoginTokenPayload,
} from '@modules/auth/dtos/request/auth.cross-login.request.dto';
import {
    AuthJwtAccessProtected,
    AuthJwtPayload,
} from '@modules/auth/decorators/auth.jwt.decorator';
import { UserParsePipe } from '@modules/user/pipes/user.parse.pipe';
import { UserDoc } from '@modules/user/repository/entities/user.entity';

/**
 * Controller for handling cross-app authentication
 * Allows users from the appointment app to auto-login to the SaaS app
 */
@Controller({
    version: '1',
    path: '/auth/cross-login',
})
export class AuthCrossLoginController {
    private readonly logger = new Logger(AuthCrossLoginController.name);
    private readonly frontendUrl: string;
    private readonly appointmentAppUrl: string;
    private readonly appointmentAppApiUrl: string;

    constructor(
        private readonly authService: AuthService,
        private readonly userService: UserService,
        private readonly sessionService: SessionService,
        private readonly companyService: CompanyService,
        private readonly subscriptionService: SubscriptionService,
        private readonly configService: ConfigService
    ) {
        this.frontendUrl = this.configService.get('FRONT_URL') || process.env.FRONT_URL || 'http://localhost:3000';
        this.appointmentAppUrl = this.configService.get<string>('APPOINTMENT_APP_URL') || process.env.APPOINTMENT_APP_URL || 'http://localhost:4200';
        // API URL for the Express backend (different from Angular frontend) - runs on port 3008
        this.appointmentAppApiUrl = this.configService.get<string>('APPOINTMENT_APP_API_URL') || process.env.APPOINTMENT_APP_API_URL || 'http://localhost:3008';
    }

    /**
     * Handle cross-login from appointment app
     * Validates the token, creates a session, and redirects to the subscription page
     *
     * @example GET /api/v1/auth/cross-login?token=eyJhbGc...&action=upgrade_plan
     */
    @Get()
    async crossLogin(
        @Req() request: Request,
        @Query() query: AuthCrossLoginRequestDto,
        @Res() res: Response
    ): Promise<void> {
        try {
            this.logger.log('Cross-login request received');

            // Validate the token
            const payload: ICrossLoginTokenPayload = this.authService.validateCrossLoginToken(query.token);

            // Find the user in SaaS database
            const user = await this.userService.findOneById(payload.saas_user_id);
            if (!user) {
                this.logger.error(`User not found for cross-login: ${payload.saas_user_id}`);
                throw new NotFoundException('User not found');
            }

            // Verify company exists
            const company = await this.companyService.findOneById(payload.saas_company_id);
            if (!company) {
                this.logger.error(`Company not found for cross-login: ${payload.saas_company_id}`);
                throw new NotFoundException('Company not found');
            }

            // Get user with role joined
            const userWithRole = await this.userService.join(user);

            // Create a new session
            const session = await this.sessionService.create(request, {
                user: String(user._id),
            });

            // Set login session
            await this.sessionService.setLoginSession(userWithRole, session);

            // Create tokens for the user
            const tokens = await this.authService.createToken(
                userWithRole,
                session._id.toString()
            );

            this.logger.log(`Cross-login successful for user: ${user.email}`);

            // Build the final URL with tokens
            // Redirect to cross-login handler which will process tokens and redirect
            const finalUrl = new URL(`${this.frontendUrl}/auth/cross-login`);
            finalUrl.searchParams.set('access_token', tokens.accessToken);
            finalUrl.searchParams.set('refresh_token', tokens.refreshToken);
            finalUrl.searchParams.set('cross_login', 'true');

            if (query.action || payload.action) {
                finalUrl.searchParams.set('action', query.action || payload.action);
            }

            this.logger.log(`Redirecting to: ${finalUrl.toString()}`);

            // Redirect to frontend with tokens
            res.redirect(302, finalUrl.toString());

        } catch (error) {
            this.logger.error(`Cross-login failed: ${error.message}`);

            // Redirect to login page with error
            const errorUrl = new URL(`${this.frontendUrl}/login`);
            errorUrl.searchParams.set('error', 'cross_login_failed');
            errorUrl.searchParams.set('message', error.message || 'Authentication failed');

            res.redirect(302, errorUrl.toString());
        }
    }

    /**
     * Get the redirect path based on the action
     */
    private getRedirectPath(action?: CrossLoginAction | string): string {
        switch (action) {
            case CrossLoginAction.VIEW_SUBSCRIPTION:
            case CrossLoginAction.EDIT_SUBSCRIPTION:
            case CrossLoginAction.CANCEL_SUBSCRIPTION:
                return '/apps/profile';

            case CrossLoginAction.UPGRADE_PLAN:
            case CrossLoginAction.REPURCHASE_PLAN:
                return '/apps/profile/subscription/upgrade';

            case CrossLoginAction.MANAGE_BILLING:
                return '/apps/profile';

            default:
                return '/apps/profile';
        }
    }

    /**
     * Health check endpoint for cross-login
     * Can be used to verify the cross-login endpoint is working
     */
    @Get('/health')
    healthCheck(): { status: string; timestamp: Date } {
        return {
            status: 'ok',
            timestamp: new Date(),
        };
    }

    /**
     * Get cross-app configuration
     * Returns non-sensitive configuration for debugging/setup
     * In production, do not expose the secret
     */
    @Get('/config')
    getConfig(): {
        issuer: string;
        audience: string;
        expirationTime: number;
        frontendUrl: string;
    } {
        const config = this.authService.getCrossAppConfig();
        return {
            issuer: config.issuer,
            audience: config.audience,
            expirationTime: config.expirationTime,
            frontendUrl: this.frontendUrl,
        };
    }

    /**
     * Generate cross-login URL for redirecting to Appointment App
     * Only available for company admins with active subscription
     *
     * @example GET /api/v1/auth/cross-login/appointment-app
     * @returns { url: string, hasActiveSubscription: boolean }
     */
    @Get('/appointment-app')
    @AuthJwtAccessProtected()
    async getAppointmentAppCrossLoginUrl(
        @AuthJwtPayload() jwtPayload: any
    ): Promise<{ url: string; hasActiveSubscription: boolean; appointmentAppUrl: string }> {
        try {
            const userId = jwtPayload.user;
            this.logger.log(`Generating appointment app cross-login URL for user ID: ${userId}`);

            // Get user from database
            const user = await this.userService.findOneById(userId);
            if (!user) {
                throw new HttpException(
                    'User not found',
                    HttpStatus.NOT_FOUND
                );
            }

            this.logger.log(`Found user: ${user.email}`);

            // Get user's company
            const company = await this.companyService.findOneByUserId(user._id);
            if (!company) {
                throw new HttpException(
                    'Company not found for user',
                    HttpStatus.NOT_FOUND
                );
            }

            this.logger.log(`Found company: ${company._id}`);

            // Check if user has active subscription
            const subscription = await this.subscriptionService.findActiveByUserId(user._id.toString());
            const hasActiveSubscription = !!subscription;

            this.logger.log(`Has active subscription: ${hasActiveSubscription}`);

            if (!hasActiveSubscription) {
                return {
                    url: '',
                    hasActiveSubscription: false,
                    appointmentAppUrl: this.appointmentAppUrl,
                };
            }

            // Generate cross-login token for appointment app
            const token = this.authService.createCrossLoginToken({
                saas_user_id: user._id.toString(),
                saas_company_id: company._id.toString(),
                action: 'access_dashboard',
            });

            // Build the cross-login URL for appointment app API (Express backend)
            const crossLoginUrl = new URL(`${this.appointmentAppApiUrl}/v1/auth/saas-cross-login`);
            crossLoginUrl.searchParams.set('token', token);

            this.logger.log(`Generated appointment app cross-login URL for user: ${user.email}`);
            this.logger.log(`Cross-login URL: ${crossLoginUrl.toString()}`);

            return {
                url: crossLoginUrl.toString(),
                hasActiveSubscription: true,
                appointmentAppUrl: this.appointmentAppUrl,
            };
        } catch (error) {
            this.logger.error(`Failed to generate appointment app cross-login URL: ${error.message}`);
            this.logger.error(error.stack);
            throw new HttpException(
                error.message || 'Failed to generate cross-login URL',
                error.status || HttpStatus.INTERNAL_SERVER_ERROR
            );
        }
    }

    /**
     * Redirect directly to Appointment App with cross-login
     * This endpoint redirects the user directly instead of returning a URL
     *
     * @example GET /api/v1/auth/cross-login/appointment-app/redirect
     */
    @Get('/appointment-app/redirect')
    @AuthJwtAccessProtected()
    async redirectToAppointmentApp(
        @AuthJwtPayload('user', UserParsePipe) user: UserDoc,
        @Res() res: Response
    ): Promise<void> {
        try {
            this.logger.log(`Redirecting user to appointment app: ${user.email}`);

            // Get user's company
            const company = await this.companyService.findOneByUserId(user._id);
            if (!company) {
                throw new HttpException(
                    'Company not found for user',
                    HttpStatus.NOT_FOUND
                );
            }

            // Check if user has active subscription
            const subscription = await this.subscriptionService.findActiveByUserId(user._id.toString());
            if (!subscription) {
                // Redirect to subscription page if no active subscription
                res.redirect(302, `${this.frontendUrl}/apps/profile/subscription/upgrade`);
                return;
            }

            // Generate cross-login token for appointment app
            const token = this.authService.createCrossLoginToken({
                saas_user_id: user._id.toString(),
                saas_company_id: company._id.toString(),
                action: 'access_dashboard',
            });

            // Build the cross-login URL for appointment app API (Express backend)
            const crossLoginUrl = new URL(`${this.appointmentAppApiUrl}/v1/auth/saas-cross-login`);
            crossLoginUrl.searchParams.set('token', token);

            this.logger.log(`Redirecting to appointment app: ${crossLoginUrl.toString()}`);

            res.redirect(302, crossLoginUrl.toString());
        } catch (error) {
            this.logger.error(`Failed to redirect to appointment app: ${error.message}`);

            // Redirect to error page
            const errorUrl = new URL(`${this.frontendUrl}/apps/dashboard`);
            errorUrl.searchParams.set('error', 'appointment_redirect_failed');
            errorUrl.searchParams.set('message', error.message || 'Failed to redirect');

            res.redirect(302, errorUrl.toString());
        }
    }
}
