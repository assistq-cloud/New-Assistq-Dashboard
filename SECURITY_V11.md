# ASSISTQ Security v11

Security upgrades: CSRF protection for authenticated state-changing requests; stricter browser security headers; existing persistent PostgreSQL sessions; per-client webhook tokens; authentication/role checks; rate limiting; HTTPS/HSTS; sensitive client integration fields omitted from client-facing responses.

Production requirements:
- NODE_ENV=production
- SESSION_SECRET: random 32+ character secret
- ADMIN_PASSWORD: strong password
- WEBHOOK_SECRET: strong secret for legacy/global webhook routes
- CORS_ORIGINS: comma-separated allowlist for approved external frontend origins
- DATABASE_URL: Railway PostgreSQL

CSRF is automatically handled by the dashboard frontend after authentication.
