// POST /.netlify/functions/razorpay-webhook — see netlify/lib/shop.ts (webhook).
import { shop } from '../lib/shop-instance';

export default (req: Request) => shop.webhook(req);
