"""
Utility modules for ApplyPilot.

Core:
- auth: JWT token validation and user authentication
- database: PostgreSQL async database connection
- redis_client: Redis connection management

Security:
- security: XSS sanitization utilities
- encryption: API key encryption (BYOK)
- error_responses: Standardized error response format

LLM:
- llm_client: Gemini API client with retries
- llm_parsing: JSON parsing for LLM responses

Caching:
- cache: Redis caching, rate limiting, account lockout

Email:
- email_service: Gmail SMTP for transactional emails

Parsing:
- resume_parser: AI-powered resume parsing

Logging:
- logging_config: Structured JSON/text logging

Middleware:
- request_middleware: Request ID correlation, slow request detection
- maintenance: Maintenance mode utilities

Other:
- json_utils: JSON serialization helpers
- text_processing: Text processing utilities
- bcrypt_patch: bcrypt compatibility patch
"""
