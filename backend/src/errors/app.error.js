class AppError extends Error {
  constructor(message, { status = 500, details, code, action } = {}) {
    super(message);
    this.name = this.constructor.name;
    this.status = status;
    this.details = details;
    this.code = code;
    this.action = action;
    this.expose = true;
  }
}

class OcCliNotFoundError extends AppError {
  constructor(details = "The OpenShift CLI (oc) is not installed or not available in PATH") {
    super("OpenShift CLI is not available", {
      status: 500,
      details,
      code: "OC_NOT_INSTALLED",
      action: "Install the OpenShift CLI and ensure the oc command is available in PATH.",
    });
  }
}

class OpenShiftAuthError extends AppError {
  constructor(details = "Run oc login and try again", status = 401) {
    super("OpenShift authentication failed", {
      status,
      details,
      code: "AUTH_REQUIRED",
      action: "Run oc login in a terminal, then refresh LogPulse.",
    });
  }
}

class KubernetesPermissionError extends AppError {
  constructor(details = "Your OpenShift user does not have permission for this resource") {
    super("OpenShift permission denied", {
      status: 403,
      details,
      code: "KUBERNETES_PERMISSION_DENIED",
      action: "Ask a cluster administrator for access or choose another project/pod.",
    });
  }
}

class PodNotFoundError extends AppError {
  constructor(details = "The selected pod could not be found") {
    super("Pod not found", {
      status: 404,
      details,
      code: "POD_NOT_FOUND",
      action: "Refresh the pod list and select a pod that still exists.",
    });
  }
}

class KubernetesApiError extends AppError {
  constructor(details, status = 502) {
    super("Kubernetes API error", {
      status,
      details,
      code: "KUBERNETES_API_ERROR",
      action: "Check your cluster connection and try again.",
    });
  }

  static from(error) {
    if (error instanceof AppError) {
      return error;
    }

    if (error?.code === "ENOENT") {
      return new OcCliNotFoundError();
    }

    const status = getKubernetesStatus(error);
    const details = getKubernetesMessage(error);

    if (status === 401) {
      return new OpenShiftAuthError(details);
    }

    if (status === 403) {
      return new KubernetesPermissionError(details);
    }

    if (status === 404) {
      return new PodNotFoundError(details);
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
  KubernetesPermissionError,
  OcCliNotFoundError,
  OpenShiftAuthError,
  PodNotFoundError,
};
