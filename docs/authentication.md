# Overview

This document covers the authentication system, including JWT authentication, API key authentication, social authentication, and session management. 

This documentation explains the features and usage of:
- **Auth Module**: Located at `src/modules/auth`

- **Session Module**: Located at `src/modules/session`

# Table of Contents
- [Overview](#overview)
- [Table of Contents](#table-of-contents)
  - [JWT Authentication](#jwt-authentication)
    - [JWT Overview](#jwt-overview)
    - [JWT Structure](#jwt-structure)
    - [JWT Token Types](#jwt-token-types)
    - [JWT Configuration](#jwt-configuration)
    - [JWT Generate Keys](#jwt-generate-keys)
    - [JWT Usage](#jwt-usage)
  
  - [Social Authentication](#social-authentication)
    - [Google Authentication](#google-authentication)
    - [Google Authentication Overview](#google-authentication-overview)
      - [Google Authentication Configuration](#google-authentication-configuration)
      - [Google Authentication Endpoints](#google-authentication-endpoints)
      - [Google Authentication Token Payload](#google-authentication-token-payload)
      - [Google Authentication Usage](#google-authentication-usage)
    - [Apple Authentication](#apple-authentication)
    - [Apple Authentication Overview](#apple-authentication-overview)
      - [Apple Authentication Configuration](#apple-authentication-configuration)
      - [Apple Authentication Endpoints](#apple-authentication-endpoints)
      - [Apple Authentication Token Payload](#apple-authentication-token-payload)
      - [Apple Authentication Usage](#apple-authentication-usage)
  - [Session Management](#session-management)
    - [Session Overview](#session-overview)
    - [Session Structure](#session-structure)
    - [Session Management](#session-management-1)
      - [User Session Endpoints](#user-session-endpoints)
      - [Admin Session Endpoints](#admin-session-endpoints)
    - [Session Cache](#session-cache)
    - [Session Configuration](#session-configuration)
    - [Session Usage](#session-usage)

## JWT Authentication

The JWT (JSON Web Token) authentication system provides a secure, stateless method for authenticating users and managing sessions.

### JWT Overview

JWT authentication in this boilerplate uses ES512 (ECDSA using P-521 and SHA-512) algorithm for signing tokens with separate key pairs for access tokens and refresh tokens.

### JWT Structure

A JWT consists of three parts:
1. **Header**: Contains the algorithm and token type
2. **Payload**: Contains claims (user information and metadata)
3. **Signature**: Ensures the token hasn't been tampered with

The JWT payload in this boilerplate contains the following claims:

**Access Token Payload**:
```json
{
  "loginDate": "2023-01-01T00:00:00Z",   // When the user logged in
  "loginFrom": "MOBILE",                 // Login source (MOBILE, WEB, etc.)
  "user": "123e4567-e89b-12d3-a456-426614174000",    // User ID
  "email": "user@example.com",           // User email
  "session": "550e8400-e29b-41d4-a716-446655440000", // Session ID
  "role": "f47ac10b-58cc-4372-a567-0e02b2c3d479",    // Role ID
  "type": "ADMIN",                       // Role type (ADMIN, USER, etc.)
  "iat": 1625097600,                     // Issued At timestamp
  "exp": 1625184000,                     // Expiration timestamp
  "aud": "https://example.com",          // Audience
  "iss": "nestjs-boilerplate",           // Issuer
  "sub": "123e4567-e89b-12d3-a456-426614174000",     // Subject (user identifier)
  "kid": "access-token-key-id"           // Key ID used for signing
}
```

**Refresh Token Payload**:
```json
{
  "loginDate": "2023-01-01T00:00:00Z",   // When the user logged in
  "loginFrom": "MOBILE",                 // Login source (MOBILE, WEB, etc.)
  "user": "123e4567-e89b-12d3-a456-426614174000",    // User ID
  "session": "550e8400-e29b-41d4-a716-446655440000", // Session ID
  "iat": 1625097600,                     // Issued At timestamp
  "exp": 1627689600,                     // Expiration timestamp (longer than access token)
  "aud": "https://example.com",          // Audience
  "iss": "nestjs-boilerplate",           // Issuer
  "sub": "123e4567-e89b-12d3-a456-426614174000",     // Subject (user identifier)
  "kid": "refresh-token-key-id"          // Key ID used for signing
}
```

The payload structure is defined in the `IAuthJwtAccessTokenPayload` and `IAuthJwtRefreshTokenPayload` interfaces in the auth module.

### JWT Token Types

1. **Access Token**: Short-lived token used for API access
   - Default expiration: Configurable, typically 15-30 minutes
   - Used for authenticating requests to protected endpoints

2. **Refresh Token**: Longer-lived token used to get new access tokens
   - Default expiration: Configurable, typically days or weeks
   - Used only with the token refresh endpoint

### JWT Configuration

JWT configuration is managed in `auth.config.ts`:

```typescript
jwt: {
  accessToken: {
    kid: process.env.AUTH_JWT_ACCESS_TOKEN_KID,
    privateKeyPath: process.env.AUTH_JWT_ACCESS_TOKEN_PRIVATE_KEY_PATH,
    publicKeyPath: process.env.AUTH_JWT_ACCESS_TOKEN_PUBLIC_KEY_PATH,
    expirationTime: ms(process.env.AUTH_JWT_ACCESS_TOKEN_EXPIRED as ms.StringValue) / 1000,
  },
  refreshToken: {
    kid: process.env.AUTH_JWT_REFRESH_TOKEN_KID,
    privateKeyPath: process.env.AUTH_JWT_REFRESH_TOKEN_PRIVATE_KEY_PATH,
    publicKeyPath: process.env.AUTH_JWT_REFRESH_TOKEN_PUBLIC_KEY_PATH,
    expirationTime: ms(process.env.AUTH_JWT_REFRESH_TOKEN_EXPIRED as ms.StringValue) / 1000,
  },
  algorithm: 'ES512',
  jwksUri: process.env.AUTH_JWT_JWKS_URI,
  audience: process.env.AUTH_JWT_AUDIENCE,
  issuer: process.env.AUTH_JWT_ISSUER,
  header: 'Authorization',
  prefix: 'Bearer',
}
```

### JWT Generate Keys

The boilerplate includes a script for generating ES512 key pairs:

```bash
# Generate JWT keys
yarn run generate:keys
```

This script creates:
- Public and private keys for access tokens
- Public and private keys for refresh tokens
- A JWKS file containing the public keys for token verification

All generated keys will be stored in the `/keys` directory of your project and the generated key IDs (kids) will be automatically updated in your `.env` file (if it does not exist, it will be created by copying from `.env.example`).

### JWT Usage

Protect your routes with JWT authentication using decorators:

```typescript
// For endpoints requiring authentication
@AuthJwtAccessProtected()
async yourProtectedEndpoint() {
  // Your endpoint code
}

// Get the payload/
async endpoint(
  @AuthJwtPayload()
  payload: IAuthJwtAccessTokenPayload
){
  // ...
}


// Get the raw token
async endpoint(
  @AuthJwtToken()
  token: string
){
  // ...
}


// For refresh token endpoints
@AuthJwtRefreshProtected()
async refreshTokenEndpoint() {
  // Your refresh logic
}
```

Here are examples of actual endpoint implementations:

```typescript
@Get('someEndpoint')
@AuthJwtAccessProtected()
async someEndpoint(
  @AuthJwtPayload() payload: IAuthJwtAccessTokenPayload, 
  @AuthJwtPayload('user') userId: string,
  @AuthJwtToken() token: string
) {
  // Your endpoint code
}

@Post('refreshToken')
@AuthJwtRefreshProtected()
async refreshToken(
  @AuthJwtPayload() payload: IAuthJwtRefreshTokenPayload,
  @AuthJwtToken() refreshToken: string
) {
  // Your refresh logic
}
```



## Social Authentication

This boilerplate provides built-in support for social authentication, allowing users to log in using their Google or Apple accounts. Each authentication provider has its own implementation and configuration details.

### Google Authentication

### Google Authentication Overview

Google authentication uses OAuth 2.0 and OpenID Connect to verify user identities:

- Implements Google's secure sign-in flow
- Validates tokens through Google's verification APIs
- Extracts user profile information from the ID token
- Provides a convenient way for users to sign in with their Google accounts

#### Google Authentication Configuration

Google authentication is configured in `auth.config.ts`:

```typescript
google: {
  header: 'Authorization',                                        // HTTP header for Google auth
  prefix: 'Bearer',                                               // Prefix for Google auth token
  clientId: process.env.AUTH_SOCIAL_GOOGLE_CLIENT_ID,             // Google OAuth client ID
  clientSecret: process.env.AUTH_SOCIAL_GOOGLE_CLIENT_SECRET,     // Google OAuth client secret
}
```

#### Google Authentication Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/auth/login/social/google` | POST | Login with Google ID token |

#### Google Authentication Token Payload

When validating Google tokens, the system extracts the following information:

```typescript
interface IAuthSocialGooglePayload {
  email: string;          // User's email address
  emailVerified: boolean; // Whether email is verified
  name: string;           // User's full name
  photo: string;          // URL to user's profile photo
}
```

#### Google Authentication Usage

The system provides guards and decorators to protect routes for Google authentication:

```typescript
// Google authentication guard
@AuthSocialGoogleProtected()
@Post('/login/social/google')
async loginWithGoogle(
  @AuthSocialGooglePayload() googlePayload: IAuthSocialGooglePayload,
  @AuthSocialGooglePayload('email') email: string
) {
  // Your login logic using the Google payload
  return this.authService.loginWithGoogle(googlePayload);
}
```

### Apple Authentication

### Apple Authentication Overview

Apple authentication follows OAuth 2.0 and OpenID Connect standards to provide a secure sign-in mechanism:

- Complies with Apple's strict privacy and security requirements
- Uses Apple's identity services to verify users
- Supports Sign in with Apple feature for iOS and web applications
- Provides privacy-focused authentication with minimal data collection

#### Apple Authentication Configuration

Apple authentication is configured in `auth.config.ts`:

```typescript
apple: {
  header: 'Authorization',                                        // HTTP header for Apple auth
  prefix: 'Bearer',                                               // Prefix for Apple auth token
  clientId: process.env.AUTH_SOCIAL_APPLE_CLIENT_ID,              // Apple OAuth client ID
  signInClientId: process.env.AUTH_SOCIAL_APPLE_SIGN_IN_CLIENT_ID,// Apple Sign In client ID
}
```

#### Apple Authentication Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/auth/login/social/apple` | POST | Login with Apple ID token |

#### Apple Authentication Token Payload

When validating Apple tokens, the system extracts the following information:

```typescript
interface IAuthSocialApplePayload {
  email: string;          // User's email address (may be private relay)
  emailVerified: boolean; // Whether email is verified
}
```

#### Apple Authentication Usage

The system provides guards and decorators to protect routes for Apple authentication:

```typescript
// Apple authentication guard
@AuthSocialAppleProtected()
@Post('/login/social/apple')
async loginWithApple(
  @AuthSocialApplePayload() applePayload: IAuthSocialApplePayload,
  @AuthSocialApplePayload('email') email: string
) {
  // Your login logic using the Apple payload
  return this.authService.loginWithApple(applePayload);
}
```

## Session Management

The Session Management system provides tracking and management of active user sessions, integrated with the JWT authentication system.

### Session Overview

Each time a user logs in, a new session is created and linked to their account. The session system:
- Tracks active login sessions for refresh tokens only
- Provides session revocation capabilities
- Integrates with JWT authentication
- Supports multiple simultaneous sessions per user
- Enforces session expiration

Key features:
- Session tracking with device and access information
- Session revocation (logout)
- Automatic session expiration
- Session listing for users and administrators
- Redis-backed caching for performance

Note that sessions are only stored and tracked for refresh tokens, not for access tokens. This approach ensures better security and efficient session management while allowing for session revocation when needed.

### Session Structure

Each session contains detailed information about the login:

```json
{
  "_id": "c8b2a97d-b9a8-4c84-9c7d-f5f2a3b1e0d9",     // Session ID
  "user": "123e4567-e89b-12d3-a456-426614174000",     // User ID
  "status": "ACTIVE",                     // Status (ACTIVE, REVOKED)
  "expiredAt": "2023-01-15T00:00:00Z",    // Expiration date
  "revokeAt": null,                       // Revocation date (if revoked)
  "hostname": "example.com",              // Client hostname
  "ip": "192.168.1.1",                    // Client IP address
  "protocol": "https",                    // Protocol used
  "userAgent": "Mozilla/5.0...",          // User agent string
  "originalUrl": "/auth/login",           // Original URL accessed
  "method": "POST",                       // HTTP method used
  "xForwardedFor": "10.0.0.1",            // X-Forwarded-For header
  "xForwardedHost": "api.example.com",    // X-Forwarded-Host header
  "xForwardedPorto": "443"                // X-Forwarded-Proto header
}
```

### Session Management

The system provides APIs for managing sessions:

#### User Session Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/session/list` | GET | List all active sessions for the current user |
| `/session/revoke/:session` | DELETE | Revoke a specific session (logout) |

#### Admin Session Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/session/:user/list` | GET | List all sessions for a specific user |
| `/session/:user/revoke/:session` | DELETE | Revoke a specific session for a user |

### Session Cache

Sessions are cached in Redis for performance:
- Session ID is used as the key with a prefix
- Cache expiration matches refresh token expiration
- Session expiration is handled automatically via Redis TTL

### Session Configuration

Session configuration is derived from JWT settings:

```typescript
// Session expiration matches refresh token expiration via Redis TTL
this.refreshTokenExpiration = this.configService.get<number>(
    'auth.jwt.refreshToken.expirationTime'
);

// This TTL value is passed to Redis cache when setting login session
await this.cacheManager.set(
    key,
    { user: user._id },
    this.refreshTokenExpiration
);
```

### Session Usage

The session management system in this boilerplate is designed to work seamlessly with JWT authentication, focusing specifically on refresh token management while allowing access tokens to function independently.

Sessions naturally expire from Redis cache based on the configured TTL (Time To Live) value, which matches the refresh token expiration time. This ensures that session data is automatically cleaned up without requiring background jobs or processors.

> **Important Note**: Since access tokens have a short lifespan (typically 15-30 minutes) while sessions may be revoked at any time, there is an intentional security gap where a recently revoked session's access token might still work until it expires. This is a standard security trade-off that balances security with performance.
