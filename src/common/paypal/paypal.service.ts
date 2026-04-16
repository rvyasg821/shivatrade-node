import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { v4 as uuidv4 } from 'uuid';
import * as querystring from 'querystring';
import { HelperStringService } from '@common/helper/services/helper.string.service';

interface AccessTokenPayload {
    _id?: string;
    lang?: string;
    apiUrl?: string;
    mode?: string;
    currency?: string;
    client_id: string;
    secret_key: string;
}

interface PayPalCredentials {
    apiUrl: string;
    mode: string;
    currency: string;
    client_id: string;
    secret_key: string;
}

@Injectable()
export class PayPalService {
    private readonly payPalLive: string = 'https://api.paypal.com';
    private readonly payPalSandbox: string = 'https://api-m.sandbox.paypal.com';
    private apiUrl = '';
    private readonly http: AxiosInstance;
    private companyName = '';

    constructor(
        private readonly configService: ConfigService,
        private readonly helperStringService: HelperStringService
    ) {
        this.http = axios.create();
        this.companyName = this.configService.get<string>('app.name', 'PeopleGem');
    }

    async getPayPalCredentials(payload = null): Promise<PayPalCredentials> {
        try {
            const paypalMode = this.configService.get<string>('paypal.mode', 'sandbox');
            const paypalCurrency = this.configService.get<string>('paypal.currency', 'USD');
            const paypalClientId = this.configService.get<string>('paypal.clientId');
            const paypalSecretKey = this.configService.get<string>('paypal.secretKey');

            if (!paypalMode || !paypalClientId || !paypalSecretKey) {
                throw new HttpException(
                    'PayPal credentials not found in configuration',
                    HttpStatus.INTERNAL_SERVER_ERROR
                );
            }

            if (paypalMode === 'sandbox') {
                this.apiUrl = this.payPalSandbox;
            }
            if (paypalMode === 'live') {
                this.apiUrl = this.payPalLive;
            }

            return {
                apiUrl: this.apiUrl,
                mode: paypalMode,
                currency: paypalCurrency,
                client_id: paypalClientId,
                secret_key: paypalSecretKey,
            };
        } catch (error) {
            console.error('getPayPalCredentials error:', error);
            throw new HttpException(
                'Failed to get PayPal credentials',
                HttpStatus.INTERNAL_SERVER_ERROR
            );
        }
    }

    async getAccessToken(payload: AccessTokenPayload): Promise<string> {
        if (!payload?.client_id) {
            throw new HttpException(
                'PayPal client ID is required',
                HttpStatus.BAD_REQUEST
            );
        }

        if (!payload?.secret_key) {
            throw new HttpException(
                'PayPal secret key is required',
                HttpStatus.BAD_REQUEST
            );
        }

        const { client_id, secret_key } = payload;
        const credentials = Buffer.from(
            `${client_id}:${secret_key}`,
            'utf8',
        ).toString('base64');
        const url = `${this.apiUrl}/v1/oauth2/token`;

        const headers = {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${credentials}`,
        };

        const data = new URLSearchParams({ grant_type: 'client_credentials' });

        try {
            const response = await this.http.post(url, data.toString(), { headers });
            if (response.data?.access_token) {
                return response.data.access_token;
            } else {
                const errorMessage = response.data?.error_description || response.data?.error || 'Failed to get access token';
                throw new HttpException(errorMessage, HttpStatus.INTERNAL_SERVER_ERROR);
            }
        } catch (error) {
            console.error('getAccessToken error:', error);
            const errorMessage = error.response?.data?.message || error.message || 'Unexpected error getting access token';
            throw new HttpException(errorMessage, HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    async getSaveCardToken(accessToken = '', payload = null): Promise<any> {
        if (!accessToken) {
            throw new HttpException(
                'PayPal access token is required',
                HttpStatus.UNAUTHORIZED
            );
        }

        if (!payload) {
            throw new HttpException(
                'PayPal payload is required',
                HttpStatus.BAD_REQUEST
            );
        }

        const payPalRequestId = uuidv4();

        const headers = {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
            'PayPal-Request-Id': payPalRequestId,
        };

        const cardNumber = payload?.card_number || '';
        const name = payload?.holder_name || '';
        let month = payload?.expiry_month || '';
        const year = payload?.expiry_year || '';
        let expiry = '';

        if (month.length === 1) {
            month = `0${month}`;
        }
        if (year) {
            expiry = `${year}-`;
        }
        if (month) {
            expiry += month;
        }
        const newCardNumber = cardNumber.replaceAll(' ', '').replaceAll('_', "");
        const data = {
            payment_source: {
                card: {
                    number: newCardNumber,
                    expiry,
                    name,
                    ...(payload?.cvv && { security_code: payload.cvv }),
                },
            },
        };

        try {
            const url = `${this.apiUrl}/v3/vault/setup-tokens`;

            const response = await this.http.post(url, data, { headers });
            if (response?.data && response.data?.id) {
                return response.data;
            }

            const errorMessage = response.data?.error_description || response.data?.error || 'Failed to save card token';
            throw new HttpException(errorMessage, HttpStatus.BAD_REQUEST);
        } catch (error) {
            const errorMessage = error.response?.data?.message || error.response?.data?.name || error.message || 'Unexpected error saving card token';
            console.error('getSaveCardToken error:', JSON.stringify(error));
            throw new HttpException(errorMessage, HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    async getCardPaymentToken(accessToken = '', payload = null): Promise<any> {
        const setupTokenId = payload?.setup_token_id || '';
        if (!accessToken) {
            throw new HttpException(
                'PayPal access token is required',
                HttpStatus.UNAUTHORIZED
            );
        }

        if (!setupTokenId) {
            throw new HttpException(
                'PayPal setup token ID is required',
                HttpStatus.BAD_REQUEST
            );
        }

        const payPalRequestId = uuidv4();
        const url = `${this.apiUrl}/v3/vault/payment-tokens`;

        const headers = {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
            'PayPal-Request-Id': payPalRequestId,
        };

        const data = {
            payment_source: {
                token: {
                    id: setupTokenId,
                    type: 'SETUP_TOKEN',
                },
            },
        };

        try {
            const response = await this.http.post(url, data, { headers });
            console.log('getCardPaymentToken response:', response?.data, data);

            if (response?.data && response.data?.id) {
                return response.data;
            }

            const errorMessage = response.data?.error_description || response.data?.error || 'Failed to get card payment token';
            throw new HttpException(errorMessage, HttpStatus.BAD_REQUEST);
        } catch (error) {
            const errorMessage = error.response?.data?.message || error.response?.data?.name || error.message || 'Unexpected error getting card payment token';
            console.error('getCardPaymentToken error:', error);
            throw new HttpException(errorMessage, HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    async checkoutPaymentOrder(accessToken = '', payload = null): Promise<any> {
        if (!accessToken) {
            throw new HttpException(
                'PayPal access token is required',
                HttpStatus.UNAUTHORIZED
            );
        }

        const currency = payload?.currency || '';
        const amount = payload?.total || 0;
        const cardTokenId = payload?.card_token_id || '';
        const payPalRequestId = uuidv4();

        if (!cardTokenId) {
            throw new HttpException(
                'PayPal card token ID is required',
                HttpStatus.BAD_REQUEST
            );
        }
        const paypalMode = this.configService.get<string>('paypal.mode', 'sandbox');
        if (paypalMode === 'sandbox') {
            this.apiUrl = this.payPalSandbox;
        }
        if (paypalMode === 'live') {
            this.apiUrl = this.payPalLive;
        }

        const url = `${this.apiUrl}/v2/checkout/orders`;

        const headers = {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
            'PayPal-Request-Id': payPalRequestId,
        };

        let returnUrl = 'http://localhost.com/success';
        let cancelUrl = 'http://localhost.com/cancel';
        if (payload?.redirect_url) {
            const queryObjData: any = {
                state: 'paypal',
                request_id: payPalRequestId,
            };

            if (payload?.type) {
                queryObjData['type'] = payload.type;
            }
            if (payload?._id) {
                queryObjData['payment_id'] = payload._id?.toString();
            }
            const queryStringData = querystring.stringify(queryObjData);

            returnUrl = `${payload.redirect_url}?${queryStringData}&action=success`;
            cancelUrl = `${payload.redirect_url}?${queryStringData}&action=cancel`;
        }

        const data = {
            intent: 'CAPTURE',
            purchase_units: [
                {
                    soft_descriptor: `${this.companyName} subscription`,
                    amount: {
                        currency_code: currency,
                        value: parseFloat(amount.toString()).toFixed(2)
                    }
                }
            ],
            payment_source: {
                card: {
                    vault_id: cardTokenId,
                    stored_credential: {
                        payment_initiator: 'MERCHANT',
                        payment_type: 'RECURRING',
                        usage: 'DERIVED'
                    }
                }
            },
            application_context: {
                return_url: returnUrl,
                cancel_url: cancelUrl
            }
        };

        try {
            const response = await this.http.post(url, data, { headers });
            if (response.data && response.data.id) {
                return { ...response.data, request_id: payPalRequestId };
            }

            const errorMessage = response.data?.error_description || response.data?.error || 'Failed to create checkout order';
            throw new HttpException(errorMessage, HttpStatus.BAD_REQUEST);
        } catch (error) {
            const errorMessage = error.response?.data?.message || error.response?.data?.name || error.message || 'Unexpected error creating checkout order';
            throw new HttpException(errorMessage, HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    async checkoutOrderCapture(accessToken = '', payload = null): Promise<any> {
        try {
            const orderId = payload?.charge_id || '';
            const payPalRequestId = uuidv4();

            if (!accessToken) {
                throw new HttpException(
                    'PayPal access token is required',
                    HttpStatus.BAD_REQUEST
                );
            }

            if (!orderId) {
                throw new HttpException(
                    'PayPal order ID is required',
                    HttpStatus.BAD_REQUEST
                );
            }

            const url = `${this.apiUrl}/v2/checkout/orders/${orderId}/capture`;
            const headers = {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${accessToken}`,
                'PayPal-Request-Id': payPalRequestId,
            };

            const response = await axios
                .post(url, {}, { headers })
                .then((res) => res.data)
                .catch((error) => {
                    const errorData = error.response?.data;
                    const message = errorData?.error_description || errorData?.message || errorData?.name || 'Failed to capture order';
                    throw new HttpException(
                        message,
                        error.response?.status || HttpStatus.BAD_REQUEST,
                    );
                });

            if (response?.id) {
                return response;
            }

            throw new HttpException('Failed to capture order - no response', HttpStatus.BAD_REQUEST);
        } catch (error) {
            const errorMessage = error.response?.data?.message || error.response?.data?.name || error.message || 'Unexpected error capturing order';
            console.error('checkoutOrderCapture error:', error);
            throw new HttpException(errorMessage, HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    async getOrderDetail(accessToken = '', payload = null): Promise<any> {
        try {
            const orderId = payload.charge_id;

            if (!accessToken) {
                throw new HttpException(
                    'PayPal access token is required',
                    HttpStatus.BAD_REQUEST
                );
            }

            if (!orderId) {
                throw new HttpException(
                    'PayPal order ID is required',
                    HttpStatus.BAD_REQUEST
                );
            }

            const url = `${this.apiUrl}/v2/checkout/orders/${orderId}`;
            const headers = {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${accessToken}`,
            };

            const apiResponse = await axios
                .get(url, { headers })
                .then((res) => res.data)
                .catch((error) => {
                    const errorData = error.response?.data;
                    const message = errorData?.error_description || errorData?.message || errorData?.name || 'Failed to fetch order details';
                    throw new HttpException(
                        message,
                        error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
                    );
                });

            if (apiResponse?.id) {
                return apiResponse;
            }

            throw new HttpException('Order details not found', HttpStatus.BAD_REQUEST);
        } catch (error) {
            const errorMessage = error.response?.data?.message || error.response?.data?.name || error.message || 'Unexpected error getting order details';
            console.error('getOrderDetail error:', error);
            throw new HttpException(errorMessage, HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    async chargePayPalCard(payload = null, cardService = null): Promise<any> {
        try {
            if (!payload || Object.keys(payload).length === 0) {
                throw new HttpException(
                    'PayPal payload is required',
                    HttpStatus.BAD_REQUEST
                );
            }

            const userId = payload?.user_id?._id || payload?.user_id || '';
            const last4 = this.getLast4Digit(payload?.card_number) || '';
            const holderName = payload?.holder_name || '';
            let year = '';
            let month = '';

            if (payload?.expiry_year) {
                year = payload.expiry_year;
            }
            if (payload?.expiry_month) {
                month = payload.expiry_month;
            }
            if (month && month.toString().length === 1) {
                month = `0${month}`;
            }

            // Prepare card query for database lookup
            const cardQuery = {
                user_id: userId,
                last4: last4,
                expiry_month: month,
                expiry_year: year,
                gateway: 'paypal',
                soft_delete: false,
            };

            // Prepare payload data for PayPal interaction
            const payloadData = {
                _id: payload?._id || '',
                holder_name: payload?.holder_name || '',
                number: payload?.card_number || '',
                month: payload?.expiry_month || '',
                year: payload?.expiry_year || '',
                cvv: payload?.card_cvv || '',
                lang: payload?.lang || '',
            };

            // Extract additional user information if present
            if (payload?.user_id?._id) {
                payload.name = payload.user_id?.name || '';
                payload.email = payload.user_id?.email || '';
                payload.mobile = payload.user_id?.mobile || '';
            }

            // Fetch card from database if cardService is provided
            let card = null;
            if (cardService) {
                card = await cardService.findOneSort(cardQuery, 'createdAt', -1);
            }

            // Retrieve PayPal credentials and access token
            const payPalConfig = await this.getPayPalCredentials(payloadData);
            const accessToken = await this.getAccessToken({
                _id: payload?._id,
                lang: payload?.lang,
                ...payPalConfig,
            });

            if (accessToken) {
                // Save card token if no card exists or it lacks a `card_id`
                if (!card || !card?.card_id) {
                    const createdCard = await this.getSaveCardToken(accessToken, payload);

                    if (createdCard && createdCard?.id) {
                        // Save card to the database if it doesn't exist and cardService is provided
                        if (cardService && (!card || !card?._id)) {
                            card = await cardService.create({
                                user_id: userId,
                                response: createdCard,
                                gateway: 'paypal',
                                card_id: createdCard.id,
                                holder_name: holderName,
                                last4: last4?.toString(),
                                expiry_month: month,
                                expiry_year: year,
                                is_default: true,
                                status: true,
                            });

                            if (card?._id) {
                                await cardService.updateManyCards(
                                    { _id: { $ne: card._id }, user_id: userId },
                                    { is_default: false }
                                );
                            }
                        }
                    }
                }

                // Generate payment token if card exists and lacks a `token_id`
                if (card && card?.card_id && !card?.token_id) {
                    const createCardToken = await this.getCardPaymentToken(accessToken, {
                        setup_token_id: card.card_id,
                        lang: payload?.lang,
                    });
                    console.log("card", createCardToken);

                    if (createCardToken && createCardToken.id && cardService) {
                        card = await cardService.update(card._id.toString(), {
                            response: createCardToken,
                            token_id: createCardToken.id,
                        }, { new: true });
                    }
                }

                // Proceed with payment if `token_id` exists
                if (card?.token_id) {
                    try {
                        payload.card_token_id = card.token_id;
                        payload.currency = payPalConfig?.currency || '';
                        const paymentOrder = await this.checkoutPaymentOrder(
                            accessToken,
                            payload,
                        );

                        if (paymentOrder?.id) {
                            return paymentOrder;
                        }
                    } catch (error) { }
                }
            }

            return null;
        } catch (error) {
            console.error('chargePayPalCard error:', error);
            throw new HttpException(
                error.message || 'PayPal payment processing error',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    async getCheckoutOrderDetail(payload = null): Promise<any> {
        try {
            const chargeId = payload?.charge_id;

            if (!chargeId) {
                throw new HttpException(
                    'PayPal order ID is required',
                    HttpStatus.BAD_REQUEST
                );
            }

            // Retrieve PayPal credentials and access token
            const payPalConfig = await this.getPayPalCredentials(payload);
            const accessToken = await this.getAccessToken({
                _id: payload?._id,
                lang: payload?.lang,
                ...payPalConfig,
            });

            if (accessToken) {
                // Fetch the order details
                const orderDetail = await this.getOrderDetail(accessToken, payload);
                if (orderDetail?.id) {
                    return orderDetail;
                }
            }

            return null;
        } catch (error) {
            console.error('getCheckoutOrderDetail catch >>>', error.message);
            throw new HttpException(
                error.message || 'Unexpected error getting checkout order details',
                error.status || HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    async getCaptureCheckoutOrder(payload = null): Promise<any> {
        try {
            const chargeId = payload?.charge_id;

            if (!chargeId) {
                throw new HttpException(
                    'PayPal order ID is required',
                    HttpStatus.BAD_REQUEST
                );
            }

            // Retrieve PayPal credentials and access token
            const payPalConfig = await this.getPayPalCredentials(payload);
            const accessToken = await this.getAccessToken({
                _id: payload?._id,
                lang: payload?.lang,
                ...payPalConfig,
            });

            if (accessToken) {
                // Capture the checkout order
                const captureOrder = await this.checkoutOrderCapture(
                    accessToken,
                    payload,
                );
                if (captureOrder?.id) {
                    return captureOrder;
                }
            }

            return null;
        } catch (error) {
            console.error('getCaptureCheckoutOrder catch >>>', error.message);
            throw new HttpException(
                error.message || 'Unexpected error capturing checkout order',
                error.status || HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    // Helper methods
    private getLast4Digit(cardNumber: string): string {
        if (!cardNumber) return '';
        const cleanNumber = cardNumber.replace(/\D/g, '');
        return cleanNumber.slice(-4);
    }

    // Helper method to get card brand
    getCardBrand(cardNumber: string): string {
        const cleanNumber = cardNumber.replace(/\D/g, '');

        if (/^4/.test(cleanNumber)) return 'VISA';
        if (/^5[1-5]/.test(cleanNumber)) return 'MASTERCARD';
        if (/^3[47]/.test(cleanNumber)) return 'AMEX';
        if (/^6(?:011|5)/.test(cleanNumber)) return 'DISCOVER';

        return 'UNKNOWN';
    }

    // Helper method to validate card number (basic Luhn algorithm)
    validateCardNumber(cardNumber: string): boolean {
        const cleanNumber = cardNumber.replace(/\D/g, '');
        let sum = 0;
        let isEven = false;

        for (let i = cleanNumber.length - 1; i >= 0; i--) {
            let digit = parseInt(cleanNumber.charAt(i), 10);

            if (isEven) {
                digit *= 2;
                if (digit > 9) {
                    digit -= 9;
                }
            }

            sum += digit;
            isEven = !isEven;
        }

        return sum % 10 === 0;
    }
}