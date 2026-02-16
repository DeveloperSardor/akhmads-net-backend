//src/config.env.js
import Joi from 'joi';
import logger from '../utils/logger.js';

/**
 * Environment Variables Validation
 * Ensures all required env vars are present and valid
 */
const envSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().default(3000),
  APP_URL: Joi.string().uri().required(),
  FRONTEND_URL: Joi.string().uri().required(),

  DATABASE_URL: Joi.string().required(),

  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().default(6379),
  REDIS_PASSWORD: Joi.string().allow('').optional(),
  REDIS_DB: Joi.number().default(0),

  JWT_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_EXPIRY: Joi.string().default('15m'),
  JWT_REFRESH_EXPIRY: Joi.string().default('7d'),

  ENCRYPTION_KEY: Joi.string().length(64).required(),
  ENCRYPTION_IV: Joi.string().length(32).required(),

  TELEGRAM_BOT_TOKEN: Joi.string().required(),
  TELEGRAM_BOT_USERNAME: Joi.string().required(),

  S3_ENDPOINT: Joi.string().uri().required(),
  S3_REGION: Joi.string().default('us-east-1'),
  S3_ACCESS_KEY: Joi.string().required(),
  S3_SECRET_KEY: Joi.string().required(),
  S3_BUCKET: Joi.string().required(),

  LOG_LEVEL: Joi.string()
    .valid('error', 'warn', 'info', 'debug')
    .default('info'),
}).unknown(true); // Allow other env vars

/**
 * Validate environment variables
 */
export function validateEnv() {
  const { error, value } = envSchema.validate(process.env, {
    abortEarly: false,
  });

  if (error) {
    logger.error('❌ Environment validation failed:');
    error.details.forEach((detail) => {
      logger.error(`   - ${detail.message}`);
    });
    process.exit(1);
  }

  logger.info('✅ Environment variables validated');
  return value;
}

export default validateEnv();