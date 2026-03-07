import type { EngineeringData, EngineeringDataContext } from "./engineeringData";

export type EngineeringDataListener = (context: EngineeringDataContext) => void;

type EngineeringDataChannelOptions = {
  createContext: (
    data: EngineeringData | EngineeringData[],
  ) => EngineeringDataContext;
  createMockFrame: (tick: number) => EngineeringData[];
  mockQueryParam: string;
};

type EngineeringDataDevTools = {
  getSnapshot: () => EngineeringData[];
  publish: (data: EngineeringData | EngineeringData[]) => void;
  startMock: (intervalMs?: number) => () => void;
  stopMock: () => void;
};

const asWindowWithEngineeringData = (
  value: Window,
): Window & { __EXCALIDRAW_ENGINEERING_DATA__?: EngineeringDataDevTools } =>
  value as Window & { __EXCALIDRAW_ENGINEERING_DATA__?: EngineeringDataDevTools };

export const createEngineeringDataChannel = ({
  createContext,
  createMockFrame,
  mockQueryParam,
}: EngineeringDataChannelOptions) => {
  let engineeringDataSnapshot: EngineeringData[] = [];
  let engineeringExternalDataSnapshot: EngineeringData[] = [];
  let engineeringDomainDataSnapshot: EngineeringData[] = [];
  let engineeringDataContext = createContext([]);
  const listeners = new Set<EngineeringDataListener>();
  let mockTimerId: number | null = null;

  const emitEngineeringData = () => {
    listeners.forEach((listener) => listener(engineeringDataContext));
  };

  const rebuildEngineeringDataContext = () => {
    engineeringDataSnapshot = [
      ...engineeringDomainDataSnapshot,
      ...engineeringExternalDataSnapshot,
    ];
    engineeringDataContext = createContext(engineeringDataSnapshot);
  };

  const publishExternalData = (data: EngineeringData | EngineeringData[]) => {
    engineeringExternalDataSnapshot = Array.isArray(data) ? data : [data];
    rebuildEngineeringDataContext();
    emitEngineeringData();
  };

  const publishDomainData = (data: EngineeringData | EngineeringData[]) => {
    engineeringDomainDataSnapshot = Array.isArray(data) ? data : [data];
    rebuildEngineeringDataContext();
    emitEngineeringData();
  };

  const subscribe = (
    listener: EngineeringDataListener,
    options?: {
      emitCurrent?: boolean;
    },
  ) => {
    listeners.add(listener);
    if (options?.emitCurrent !== false) {
      listener(engineeringDataContext);
    }

    return () => {
      listeners.delete(listener);
    };
  };

  const stopMockFeed = () => {
    if (mockTimerId !== null) {
      window.clearInterval(mockTimerId);
      mockTimerId = null;
    }
  };

  const startMockFeed = (intervalMs = 1000) => {
    if (typeof window === "undefined") {
      return () => {};
    }

    stopMockFeed();

    let tick = 0;
    publishExternalData(createMockFrame(tick));

    mockTimerId = window.setInterval(() => {
      tick += 1;
      publishExternalData(createMockFrame(tick));
    }, intervalMs);

    return () => {
      stopMockFeed();
    };
  };

  const maybeStartMockFromUrl = () => {
    if (typeof window === "undefined" || !import.meta.env.DEV) {
      return () => {};
    }

    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get(mockQueryParam) !== "1") {
      return () => {};
    }

    return startMockFeed();
  };

  const registerDevTools = () => {
    if (typeof window === "undefined") {
      return;
    }

    asWindowWithEngineeringData(window).__EXCALIDRAW_ENGINEERING_DATA__ = {
      getSnapshot: () => engineeringDataSnapshot.slice(),
      publish: publishExternalData,
      startMock: startMockFeed,
      stopMock: stopMockFeed,
    };
  };

  const resetForTests = () => {
    stopMockFeed();
    engineeringExternalDataSnapshot = [];
    engineeringDomainDataSnapshot = [];
    engineeringDataSnapshot = [];
    engineeringDataContext = createContext([]);
    listeners.clear();

    if (typeof window !== "undefined") {
      delete asWindowWithEngineeringData(window)
        .__EXCALIDRAW_ENGINEERING_DATA__;
    }
  };

  return {
    publishExternalData,
    publishDomainData,
    subscribe,
    stopMockFeed,
    startMockFeed,
    maybeStartMockFromUrl,
    registerDevTools,
    resetForTests,
    getSnapshot: () => engineeringDataSnapshot.slice(),
  };
};
