import { describe, expect, it, vi } from 'vitest';
import { enquiryRow, saveEnquiry } from '../netlify/lib/enquiry';

const event = (data: Record<string, unknown>, form = 'enquiry') => JSON.stringify({ payload: { form_name: form, data, created_at: '2026-11-08T10:00:00Z' } });
const env = { SUPABASE_URL: 'https://db.test/', SUPABASE_SERVICE_ROLE_KEY: 'service', SHOP_ORG_ID: 'org-1' };

describe('website enquiry → Supabase', () => {
  it('maps the contact form to an enquiries row', () => {
    expect(enquiryRow(event({ name: ' Selvi ', phone: '90000 00000', company: 'Selvi Foods', pincode: '622001', details: '5 ply 400×300×300, 1000 pcs', consent: 'yes', subject: 'Website enquiry' }), 'org-1')).toEqual({
      org_id: 'org-1',
      name: 'Selvi',
      phone: '90000 00000',
      email: '',
      message: '5 ply 400×300×300, 1000 pcs\n\nCompany: Selvi Foods\nPincode: 622001',
      page: 'Website enquiry',
      consent: true,
    });
  });
  it('ignores other forms, bots (honeypot) and empty submissions', () => {
    expect(enquiryRow(event({ name: 'x' }, 'newsletter'), 'o')).toBeNull();
    expect(enquiryRow(event({ name: 'x', company_website: 'spam.example' }), 'o')).toBeNull();
    expect(enquiryRow(event({ details: 'hi' }), 'o')).toBeNull();
    expect(enquiryRow('not json', 'o')).toBeNull();
  });
  it('saves with the service key; does nothing when not configured', async () => {
    const f = vi.fn(async () => new Response(null, { status: 201 }));
    expect(await saveEnquiry(env, event({ name: 'Selvi', phone: '9000000000' }), f as unknown as typeof fetch)).toEqual({ saved: true });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://db.test/rest/v1/enquiries');
    expect((init.headers as Record<string, string>).apikey).toBe('service');
    expect(JSON.parse(String(init.body))).toMatchObject({ org_id: 'org-1', name: 'Selvi' });
    expect(await saveEnquiry({ ...env, SUPABASE_SERVICE_ROLE_KEY: '' }, event({ name: 'x' }), f as unknown as typeof fetch)).toEqual({ saved: false, reason: 'not configured' });
    await expect(saveEnquiry(env, event({ name: 'x' }), (async () => new Response('denied', { status: 401 })) as unknown as typeof fetch)).rejects.toThrow(/401/);
  });
});
