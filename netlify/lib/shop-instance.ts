// One shop instance per function container, configured from Netlify environment variables (see .env.example).
import { createShop, shopEnv } from './shop';

export const shop = createShop({ env: shopEnv((k) => process.env[k]), fetch, log: (m) => console.error(m) });
