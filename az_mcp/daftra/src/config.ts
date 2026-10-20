import dotenv from 'dotenv';
dotenv.config();

export const config = {
  domain: process.env.DAFTRA_SUBDOMAIN || process.env.DAFTRA_DOMAIN || '',
  apiKey: process.env.DAFTRA_API_KEY || process.env.API_KEY || '',
  clientId: process.env.CLIENT_ID || '',
  clientSecret: process.env.CLIENT_SECRET || '',
};

export function getBaseUrl(): string {
  let domain = config.domain.trim();
  if (!domain.startsWith('http://') && !domain.startsWith('https://')) {
    domain = `https://${domain}.daftra.com`;
  }
  return domain;
}
