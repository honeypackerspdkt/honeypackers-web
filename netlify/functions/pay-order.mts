// POST /.netlify/functions/pay-order — see netlify/lib/shop.ts (payOrder).
import { shop } from '../lib/shop-instance';

export default (req: Request) => shop.payOrder(req);
