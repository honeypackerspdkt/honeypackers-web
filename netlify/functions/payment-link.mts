// POST /.netlify/functions/payment-link — see netlify/lib/shop.ts (paymentLink).
import { shop } from '../lib/shop-instance';

export default (req: Request) => shop.paymentLink(req);
