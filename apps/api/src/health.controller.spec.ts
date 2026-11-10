import { describe, beforeEach, it, expect } from 'vitest';
import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(() => {
    controller = new HealthController();
  });

  it('should return ok', () => {
    expect(controller.check()).toEqual({ ok: true });
  });
});
