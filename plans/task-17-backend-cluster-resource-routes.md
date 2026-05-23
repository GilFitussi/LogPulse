# Task 17 — Backend cluster resource routes

## Context
Wire the existing cluster-scoped backend routes to the real `backend/src/service/clusterResources.service.js` implementation so the placeholder `501` responses are replaced by working cluster-scoped resource endpoints.

## Approach
Wire each cluster resource route directly to the matching `clusterResources.service.js` function and keep the route layer limited to parsing/validation plus response shaping (`{ namespaces }`, `{ deployments }`, `{ pods }`, `{ logs }`). Reuse existing Koa error middleware for service-level `AppError` handling instead of re-implementing resource logic in the routes. For the pod logs endpoint, validate `tailLines` and `sinceSeconds` as optional positive integers, trim `container`, ignore it if empty after trim, and forward it as `container` only when non-empty. Do not add streaming in this task.

## Files to modify
- `backend/src/api/cluster-resources.routes.js`
- `backend/test/api/cluster-resources.routes.test.js`

## Reuse
- `backend/src/service/clusterResources.service.js`
  - `listClusterNamespaces(clusterId)`
  - `listClusterDeployments(clusterId, namespace)`
  - `listClusterPods(clusterId, namespace)`
  - `listClusterPodsForDeployment(clusterId, namespace, deployment)`
  - `getClusterPodLogs(clusterId, namespace, podName, options)`
- `backend/src/middleware/error.middleware.js` for exposed `AppError` responses
- Validation style and `parseClusterId` pattern from `backend/src/api/clusters.route.js`

## Steps
- [ ] Add route-level validation helpers/schemas for cluster resource params and pod log query params (`container`, `tailLines`, `sinceSeconds`), rejecting invalid numeric values with `400`, trimming `container`, and omitting `container` when it is empty after trim.
- [ ] Replace `501` placeholder handlers in `backend/src/api/cluster-resources.routes.js` with thin async handlers that:
  - parse/validate `clusterId`
  - keep cluster existence behavior consistent
  - call the matching service function
  - shape responses as `{ namespaces }`, `{ deployments }`, `{ pods }`, `{ logs }`
  - for pod logs, pass `{ container, tailLines, sinceSeconds }` only when valid/provided, with `container` forwarded only if non-empty after trim
- [ ] Ensure invalid inputs and service-thrown errors surface consistently through existing route/error middleware patterns.
- [ ] Update `backend/test/api/cluster-resources.routes.test.js` to cover successful service wiring plus representative error cases (missing cluster, disconnected cluster, route-level query validation, and forwarding valid pod log options).
- [ ] Run `npm test` in `backend/` before commit.

## Verification
- Run: `cd backend && npm test`
- Verify route tests assert:
  - each endpoint calls the correct `clusterResources.service.js` function with the expected args
  - responses use the required JSON envelope only
  - `404` cluster-not-found behavior remains consistent
  - service `AppError` responses (for example `409 CLUSTER_NOT_CONNECTED`) pass through the error middleware correctly
  - pod log query params reject invalid numeric values with `400`, trim `container`, ignore empty trimmed `container`, and forward valid `container` / `tailLines` / `sinceSeconds` options to the service
