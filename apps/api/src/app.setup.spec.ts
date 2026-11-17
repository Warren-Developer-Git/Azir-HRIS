import { describe, expect, it, vi } from 'vitest';
import { configureApp } from './app.setup.js';

describe('configureApp', () => {
  it('sets Express trust proxy to 1 hop and wires security middleware', () => {
    const setMock = vi.fn();
    const useMock = vi.fn();
    const enableCorsMock = vi.fn();
    const useGlobalPipesMock = vi.fn();

    const fakeApp = {
      use: useMock,
      enableCors: enableCorsMock,
      useGlobalPipes: useGlobalPipesMock,
      getHttpAdapter: () => ({
        getInstance: () => ({ set: setMock }),
      }),
    };

    configureApp(fakeApp as any);

    expect(setMock).toHaveBeenCalledWith('trust proxy', 1);
    expect(useMock).toHaveBeenCalledTimes(3);
    expect(enableCorsMock).toHaveBeenCalledTimes(1);
    expect(useGlobalPipesMock).toHaveBeenCalledTimes(1);
  });
});
