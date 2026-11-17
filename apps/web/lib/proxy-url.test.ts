import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveApiProxyTarget } from './proxy-url.ts';

describe('resolveApiProxyTarget', () => {
  it('defaults to http://localhost:4000 when API_URL is omitted or blank', () => {
    assert.equal(resolveApiProxyTarget(undefined), 'http://localhost:4000');
    assert.equal(resolveApiProxyTarget('   '), 'http://localhost:4000');
  });

  it('trims whitespace and trailing slashes from configured API_URL', () => {
    assert.equal(
      resolveApiProxyTarget(' https://azir-hris-api.onrender.com/// '),
      'https://azir-hris-api.onrender.com',
    );
  });

  it('throws on non-http(s) API_URL values', () => {
    assert.throws(() => resolveApiProxyTarget('ftp://invalid.example.com'));
    assert.throws(() => resolveApiProxyTarget('not-a-url'));
  });
});
