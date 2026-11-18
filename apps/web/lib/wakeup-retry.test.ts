import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  canRetryWakeupRequest,
  fetchWithWakeupRetry,
} from './wakeup-retry.ts';

describe('canRetryWakeupRequest', () => {
  it('allows retries on GET/HEAD and /auth/login or /auth/refresh only', () => {
    assert.equal(canRetryWakeupRequest('/dashboard', 'GET'), true);
    assert.equal(canRetryWakeupRequest('/health', 'HEAD'), true);
    assert.equal(canRetryWakeupRequest('/api/auth/login', 'POST'), true);
    assert.equal(canRetryWakeupRequest('/api/auth/refresh', 'POST'), true);
    assert.equal(canRetryWakeupRequest('/api/leave/requests', 'POST'), false);
    assert.equal(canRetryWakeupRequest('/api/me/profile', 'PATCH'), false);
  });
});

describe('fetchWithWakeupRetry', () => {
  it('retries transient 502/503/504 and network errors for eligible requests', async () => {
    let calls = 0;
    let wakingCallbacks = 0;

    const res = await fetchWithWakeupRetry(
      async () => {
        calls += 1;
        if (calls === 1) {
          throw new TypeError('fetch failed');
        }
        if (calls === 2) {
          return new Response('Gateway Timeout', { status: 504 });
        }
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      },
      {
        path: '/api/auth/login',
        method: 'POST',
        maxRetries: 2,
        delayMs: 1,
        onWakingUp: () => {
          wakingCallbacks += 1;
        },
      },
    );

    assert.equal(calls, 3);
    assert.equal(wakingCallbacks, 2);
    assert.equal(res.status, 200);
  });

  it('does not retry 401/400 or non-idempotent POST requests', async () => {
    let authCalls = 0;
    const authRes = await fetchWithWakeupRetry(
      async () => {
        authCalls += 1;
        return new Response('Unauthorized', { status: 401 });
      },
      { path: '/api/auth/login', method: 'POST', maxRetries: 2, delayMs: 1 },
    );
    assert.equal(authCalls, 1);
    assert.equal(authRes.status, 401);

    let postCalls = 0;
    const mutationRes = await fetchWithWakeupRetry(
      async () => {
        postCalls += 1;
        return new Response('Timeout', { status: 504 });
      },
      { path: '/api/leave/requests', method: 'POST', maxRetries: 2, delayMs: 1 },
    );
    assert.equal(postCalls, 1);
    assert.equal(mutationRes.status, 504);
  });

  it('returns last gateway response or rethrows once maxRetries is exhausted', async () => {
    let calls = 0;
    const res = await fetchWithWakeupRetry(
      async () => {
        calls += 1;
        return new Response('Bad Gateway', { status: 502 });
      },
      { path: '/api/dashboard', method: 'GET', maxRetries: 2, delayMs: 1 },
    );
    assert.equal(calls, 3);
    assert.equal(res.status, 502);

    await assert.rejects(
      () =>
        fetchWithWakeupRetry(
          async () => {
            throw new TypeError('network down');
          },
          { path: '/api/dashboard', method: 'GET', maxRetries: 1, delayMs: 1 },
        ),
      /network down/,
    );
  });
});
