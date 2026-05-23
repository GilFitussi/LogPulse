# Plan: backend cluster resources service

## Context
- Implement a real backend service layer for cluster-scoped Kubernetes/OpenShift resource access on top of the new runtime session foundation.
- Scope is service-only for Task 16: no route implementation in this task.
- Resource access split required by architecture:
  - `oc` for visible OpenShift project/namespace discovery
  - Kubernetes client for deployments, pods, and pod logs
- Must use cluster-specific runtime sessions and avoid global kube context, temp kubeconfig files, and persistence of fetched resources/logs.

## Approach
- Start implementation from `main` using the task’s git flow (outside planning mode only):
  - `git checkout main`
  - `git pull origin main`
  - `git checkout -b feature/backend-cluster-resources-service`
- Add `backend/src/service/clusterResources.service.js`.
- Reuse `clusterSessionRegistry.service.js` / `kubernetesClientFactory.service.js` for cluster-scoped session and client creation.
- Reuse `ocCommand.service.js` for namespace discovery via `oc`, and source the kubeconfig/session explicitly from `clusterSessionRegistry.service.js` for the requested `clusterId` so `oc` never falls back to the machine’s currently active context.
- Normalize responses into frontend-friendly DTOs that use raw timestamps (`createdAt`) instead of humanized `age` values.
- Keep log retrieval simple in this task: return plain text in `{ logs }`.
- Fail clearly when cluster does not exist or no active runtime session exists.

## Files to modify
- `backend/src/service/clusterResources.service.js`
- `backend/test/service/clusterResources.service.test.js`
- `backend/src/service/ocCommand.service.js` *(only if needed to support stdin-backed/cluster-scoped `oc` execution without temp kubeconfig files)*
- `backend/test/service/ocCommand.service.test.js` *(if the helper contract changes)*

## Reuse
- `backend/src/service/clusterSessionRegistry.service.js`
  - `getClusterSession`, `hasClusterSession`
- `backend/src/service/kubernetesClientFactory.service.js`
  - `getCoreV1Api`, `getAppsV1Api`, `getLogClient`
- `backend/src/service/ocCommand.service.js`
  - `runOcCommand`, `getOcErrorMessage`, `isOcNotInstalledError`
- `backend/src/service/clusterManager.service.js`
  - `getClusterById` for invalid-cluster handling pattern
- `backend/src/errors/app.error.js`
  - existing app-level error shape used by login/logout service
- `backend/src/api/cluster-resources.routes.js`
  - existing route surface confirms expected service capabilities for the next task

## Steps
- [ ] Implement shared guards that:
  - verify the cluster exists via `getClusterById(clusterId)` and raise a `Cluster not found` app error for invalid ids
  - verify a runtime session exists and raise a clear `cluster is not connected` error when absent
- [ ] Implement shared normalization helpers:
  - deployment DTO: `{ name, namespace, replicas, readyReplicas, updatedReplicas, createdAt }`
  - pod DTO: `{ name, namespace, status, ready, restarts, createdAt, containers }`
  - log DTO: `{ logs }`
- [ ] Implement namespace discovery via `oc projects -q` (or equivalent) using the runtime session loaded from `clusterSessionRegistry.service.js` for the requested `clusterId`, explicitly avoiding global kube context, active-machine `oc` context, and temp kubeconfig files.
- [ ] Implement deployment listing with `AppsV1Api.listNamespacedDeployment(namespace)` and map Kubernetes metadata/status fields into the normalized DTO.
- [ ] Implement pod listing with `CoreV1Api.listNamespacedPod(namespace)` and normalize:
  - `status`
  - `ready` from container statuses
  - `restarts` as summed restart count
  - `containers` as container names
  - `createdAt` from `metadata.creationTimestamp`
- [ ] Implement deployment-scoped pod lookup by reusing pod listing with the deployment selector derived from the deployment spec/selector labels, preserving cluster isolation.
- [ ] Implement pod log retrieval with Kubernetes `Log` client capture (non-streaming), supporting optional `tailLines`, `sinceSeconds`, and `container`, and returning plain text in `{ logs }`.
- [ ] Add service tests for:
  - missing session
  - invalid cluster
  - namespace discovery
  - deployments normalization
  - pods normalization
  - logs retrieval
  - multi-cluster isolation

## Verification
- Run backend service tests, especially:
  - `backend/test/service/clusterResources.service.test.js`
  - `backend/test/service/kubernetesClientFactory.service.test.js`
  - `backend/test/service/ocCommand.service.test.js` *(if helper behavior changes)*
- Confirm tests cover:
  - missing session
  - invalid cluster
  - namespace discovery via `oc`
  - deployments normalization
  - pods normalization
  - logs retrieval returning `{ logs }`
  - multi-cluster isolation
- Manual review checklist:
  - no global kube context or machine-active `oc` context usage
  - no temp kubeconfig files created by the resource service flow
  - no persistence of namespaces/deployments/pods/logs

## Findings so far
- `clusterSessionRegistry.service.js` stores in-memory sessions keyed by `clusterId` and currently keeps `kubeconfigContent`, `username`, and `connectedAt`; this is the authoritative runtime session source the new service should use for both Kubernetes clients and `oc` namespace discovery.
- `kubernetesClientFactory.service.js` already builds `CoreV1Api`, `AppsV1Api`, and `Log` clients from per-cluster `kubeconfigContent` and throws `No active cluster session found for clusterId X` when missing.
- `clusterOcLogin.service.js` creates a temp kubeconfig only during login, stores kubeconfig content in memory, then deletes the temp directory. That fits the new task constraint as long as the new resource service itself does not create temp kubeconfig files.
- `@kubernetes/client-node` exposes enough kubeconfig data (`getCurrentCluster()`, `getCurrentUser()`) to support cluster-specific `oc` execution decisions if the implementation needs to derive server/auth/TLS inputs from the stored kubeconfig content.
- The Kubernetes `Log` client is stream-oriented; service implementation will need to capture that output into memory and return `{ logs }` without streaming.
- Placeholder routes already exist in `backend/src/api/cluster-resources.routes.js`, but they are explicitly out of scope for this task.
