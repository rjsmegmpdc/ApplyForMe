import { describe, expect, it } from 'vitest';
import { workersDevRedirect } from './host-redirect';

const APP = 'https://app.applyforme.dev';
const DEV = 'https://applyforme.onlinemyassistant.workers.dev';

describe('workersDevRedirect', () => {
  it('sends browser pages on workers.dev to the same path and query on the app domain', () => {
    const res = workersDevRedirect(new Request(`${DEV}/profile?tab=roles`), APP)!;
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe(`${APP}/profile?tab=roles`);
    expect(workersDevRedirect(new Request(`${DEV}/`), APP)!.headers.get('Location')).toBe(`${APP}/`);
  });
  it('leaves the app domain, admin routes, non-GET requests and a bad base URL alone', () => {
    expect(workersDevRedirect(new Request(`${APP}/profile`), APP)).toBeNull();
    expect(workersDevRedirect(new Request(`${DEV}/api/admin/run-url`), APP)).toBeNull();
    expect(workersDevRedirect(new Request(`${DEV}/api/runs/1/submitted`, { method: 'POST' }), APP)).toBeNull();
    expect(workersDevRedirect(new Request(`${DEV}/profile`), undefined)).toBeNull();
    expect(workersDevRedirect(new Request(`${DEV}/profile`), DEV)).toBeNull();
  });
});
