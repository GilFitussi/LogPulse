class AppError extends Error {
  constructor(message, { status = 500, details } = {}) {
    super(message);
    this.name = this.constructor.name;
    this.status = status;
    this.details = details;
    this.expose = true;
  }
}

class OpenShiftAuthError extends AppError {
  constructor(details, status = 401) {
    super("OpenShift authentication failed", { status, details });
  }
}

class KubernetesApiError extends AppError {
  constructor(details, status = 502) {
    super("Kubernetes API error", { status, details });
  }

  static from(error) {
    const status = getKubernetesStatus(error);
    const details = getKubernetesMessage(error);

    if (status === 401 || status === 403) {
      return new OpenShiftAuthError(details, status);
    }

    return new KubernetesApiError(details, isHttpStatus(status) ? status : 502);
  }
}

function getKubernetesStatus(error) {
  return error?.response?.statusCode || error?.statusCode || error?.code;
}

function getKubernetesMessage(error) {
  return (
    error?.response?.body?.message ||
    error?.body?.message ||
    error?.message ||
    "Unknown Kubernetes API error"
  );
}

function isHttpStatus(status) {
  return Number.isInteger(status) && status >= 400 && status <= 599;
}

module.exports = {
  AppError,
  KubernetesApiError,
  OpenShiftAuthError,
};
