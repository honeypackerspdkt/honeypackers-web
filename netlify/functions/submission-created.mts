// Netlify event function: runs after each accepted form submission (Netlify Forms). Saves enquiries to Supabase
// so they appear in the BoxBook app's Inbox. The submission is already stored by Netlify, so failures only log.
import { saveEnquiry } from '../lib/enquiry';
import { shopEnv } from '../lib/shop';

export const handler = async (event: { body?: string | null }) => {
  try {
    const r = await saveEnquiry(shopEnv((k) => process.env[k]), event.body || '');
    return { statusCode: 200, body: JSON.stringify(r) };
  } catch (e) {
    console.error(e);
    return { statusCode: 200, body: JSON.stringify({ saved: false }) };
  }
};
