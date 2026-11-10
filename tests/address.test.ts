import { describe, expect, it } from 'vitest';
import { addressProblem, composeAddress, emptyAddress, parseAddress } from '../src/lib/address';

const full = { line1: '12, Sri Ram Nagar', line2: 'Main Road, Thirukokarnam', landmark: 'Near bus stand', city: 'Pudukkottai', pincode: '622001', stateCode: '33' };

describe('delivery address fields', () => {
  it('joins the fields into the stored address text', () => {
    expect(composeAddress(full)).toBe('12, Sri Ram Nagar\nMain Road, Thirukokarnam\nLandmark: Near bus stand\nPudukkottai, Tamil Nadu - 622001');
    expect(composeAddress({ ...full, landmark: '  ' })).toBe('12, Sri Ram Nagar\nMain Road, Thirukokarnam\nPudukkottai, Tamil Nadu - 622001');
  });

  it('splits it back into the same fields', () => {
    expect(parseAddress(composeAddress(full))).toEqual(full);
    expect(parseAddress(composeAddress({ ...full, landmark: '' }))).toEqual({ ...full, landmark: '' });
  });

  it('keeps the state chosen elsewhere and copes with no state in the text', () => {
    expect(parseAddress('A\nB\nTrichy - 620001', '33')).toEqual({ line1: 'A', line2: 'B', landmark: '', city: 'Trichy', pincode: '620001', stateCode: '33' });
  });

  it('puts an old one-box address into the first lines', () => {
    expect(parseAddress('No 5, Big Street, Pudukkottai')).toEqual({ ...emptyAddress(), line1: 'No 5, Big Street, Pudukkottai' });
    expect(parseAddress('No 5\nBig Street\nNear temple')).toMatchObject({ line1: 'No 5', line2: 'Big Street, Near temple', city: '', pincode: '' });
    expect(parseAddress('')).toEqual(emptyAddress());
  });

  it('says what is missing', () => {
    expect(addressProblem(full)).toBe('');
    expect(addressProblem({ ...full, line1: '' })).toMatch(/house/);
    expect(addressProblem({ ...full, line2: '' })).toMatch(/area/);
    expect(addressProblem({ ...full, city: '' })).toMatch(/city/);
    expect(addressProblem({ ...full, pincode: '6220' })).toMatch(/pincode/);
    expect(addressProblem({ ...full, stateCode: '' })).toMatch(/state/);
    expect(addressProblem({ ...full, landmark: '' })).toBe('');
  });
});
