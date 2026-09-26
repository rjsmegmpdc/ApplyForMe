import { describe, expect, it } from 'vitest';
import { isAdminRequest, timingSafeEqual } from './admin-auth';

function req(auth?: string): Request {
  return new Request('https://app.test/api/admin/probe', { method: 'POST', headers: auth ? { authorization: auth } : {} });
}

describe('isAdminRequest', () => {
  it('unconfigured without a token, unauthorized on mismatch/missing, ok on exact match', () => {
    expect(isAdminRequest(req('Bearer abc'), {})).toBe('unconfigured');
    expect(isAdminRequest(req(), { ADMIN_TOKEN: 'abc' })).toBe('unauthorized');
    expect(isAdminRequest(req('Bearer abd'), { ADMIN_TOKEN: 'abc' })).toBe('unauthorized');
    expect(isAdminRequest(req('Basic abc'), { ADMIN_TOKEN: 'abc' })).toBe('unauthorized');
    expect(isAdminRequest(req('Bearer abc'), { ADMIN_TOKEN: 'abc' })).toBe('ok');
  });
  it('timingSafeEqual compares bytes', () => {
    expect(timingSafeEqual('a', 'a')).toBe(true);
    expect(timingSafeEqual('a', 'ab')).toBe(false);
    expect(timingSafeEqual('é', 'e')).toBe(false);
  });
});
