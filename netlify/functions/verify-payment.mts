// POST /.netlify/functions/verify-payment — see netlify/lib/shop.ts (verifyPayment).
import { shop } from '../lib/shop-instance';

export default (req: Request) => shop.verifyPayment(req);
