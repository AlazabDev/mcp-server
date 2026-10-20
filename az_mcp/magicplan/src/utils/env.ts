import 'dotenv/config';

const env = {
  OPEN_WEATHER_API_KEY: process.env.OPEN_WEATHER_API_KEY,
};

export const getEnv = (key: keyof typeof env): string => {
  const value = env[key];
  if (!value) {
    throw new Error(`Environment variable ${key} is not set`);
  }
  return value;
};
