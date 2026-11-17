const DEV_ACCESS_FALLBACK = 'dev_access_secret_hrms_2026_super_secure';
const DEV_REFRESH_FALLBACK = 'dev_refresh_secret_hrms_2026_super_secure';

function resolveJwtSecret(envKey: 'JWT_ACCESS_SECRET' | 'JWT_REFRESH_SECRET', devFallback: string): string {
  const configured = process.env[envKey]?.trim();
  if (configured) {
    return configured;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`${envKey} must be configured when NODE_ENV=production`);
  }
  return devFallback;
}

export function getJwtAccessSecret(): string {
  return resolveJwtSecret('JWT_ACCESS_SECRET', DEV_ACCESS_FALLBACK);
}

export function getJwtRefreshSecret(): string {
  return resolveJwtSecret('JWT_REFRESH_SECRET', DEV_REFRESH_FALLBACK);
}
