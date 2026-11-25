import { describe, expect, it } from 'vitest';
import { privacyRedirectTarget } from './privacy-redirect';

describe('privacyRedirectTarget', () => {
  it('sends a 403 privacy response to the accept page', () => {
    expect(privacyRedirectTarget(403, { privacy: true }, '/runs')).toBe('/privacy/accept');
  });
  it('ignores other errors and other bodies', () => {
    expect(privacyRedirectTarget(403, { error: 'x' }, '/runs')).toBeNull();
    expect(privacyRedirectTarget(401, { privacy: true }, '/runs')).toBeNull();
    expect(privacyRedirectTarget(200, { privacy: true }, '/runs')).toBeNull();
    expect(privacyRedirectTarget(403, null, '/runs')).toBeNull();
  });
  it('never loops on the privacy pages', () => {
    expect(privacyRedirectTarget(403, { privacy: true }, '/privacy/accept')).toBeNull();
    expect(privacyRedirectTarget(403, { privacy: true }, '/privacy')).toBeNull();
  });
});
