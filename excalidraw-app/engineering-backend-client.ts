export type EngineeringBackendErrorDetail = {
  code?: string;
  message?: string;
};

export class EngineeringBackendHttpError extends Error {
  readonly status: number;
  readonly detail?: EngineeringBackendErrorDetail;

  constructor(
    message: string,
    status: number,
    detail?: EngineeringBackendErrorDetail,
  ) {
    super(message);
    this.name = "EngineeringBackendHttpError";
    this.status = status;
    this.detail = detail;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const getErrorDetail = (
  responseBody: unknown,
): EngineeringBackendErrorDetail | undefined => {
  if (!isRecord(responseBody) || !isRecord(responseBody.detail)) {
    return undefined;
  }

  const detail = responseBody.detail;
  const code =
    typeof detail.code === "string" && detail.code.trim().length > 0
      ? detail.code
      : undefined;
  const message =
    typeof detail.message === "string" && detail.message.trim().length > 0
      ? detail.message
      : undefined;

  if (!code && !message) {
    return undefined;
  }

  return {
    code,
    message,
  };
};

const toConfiguredBaseUrl = (value: unknown) => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.replace(/\/+$/, "");
};

export const getConfiguredEngineeringBackendBaseUrl = () => {
  const runtimeBaseUrl = (
    globalThis as typeof globalThis & {
      __EXCALIDRAW_ENGINEERING_BACKEND_BASE_URL__?: unknown;
    }
  ).__EXCALIDRAW_ENGINEERING_BACKEND_BASE_URL__;
  const configuredRuntimeBaseUrl = toConfiguredBaseUrl(runtimeBaseUrl);
  if (configuredRuntimeBaseUrl) {
    return configuredRuntimeBaseUrl;
  }

  // Avoid real network calls in tests unless explicitly injected at runtime.
  if (import.meta.env.MODE === "test") {
    return null;
  }

  return toConfiguredBaseUrl(import.meta.env.VITE_APP_ENGINEERING_BACKEND_URL);
};

export const requestEngineeringBackendJson = async <T>(
  baseUrl: string,
  path: string,
  init?: RequestInit,
): Promise<T> => {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });

  let responseBody: unknown = null;
  try {
    responseBody = await response.json();
  } catch {
    responseBody = null;
  }

  if (!response.ok) {
    const detail = getErrorDetail(responseBody);
    throw new EngineeringBackendHttpError(
      detail?.message || `Engineering backend request failed with ${response.status}`,
      response.status,
      detail,
    );
  }

  return (responseBody ?? {}) as T;
};
