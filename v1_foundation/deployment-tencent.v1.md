# Tencent Cloud Deployment Blueprint V1

## 1. Infrastructure layers

1. Static site
- COS bucket for static assets
- CDN acceleration and cache policy

2. API runtime
- Containerized monolith service
- CLB (load balancer) in front of API service

3. Data storage
- MySQL/PostgreSQL for content and metadata
- Redis for cache/session snapshot index
- COS for large assets and media references

4. Observability
- Unified structured logs
- Error collection and alerting
- Basic performance dashboards for homepage interaction

5. Delivery strategy
- Blue/green or canary rollout for API service
- Versioned static asset paths
- Rollback runbook with data compatibility checks

## 2. Environment model

- `dev`: rapid iteration, test data
- `staging`: release candidate validation
- `prod`: public traffic

## 3. Security and policy

- HTTPS enforced end-to-end
- CORS policy scoped to frontend domain(s)
- API rate limit on event ingestion endpoint
- Input validation on all public query parameters

## 4. Key operational checks

1. Cache invalidation after taxonomy/unit updates
2. Daily seed generation at UTC+8 00:00
3. API schema compatibility with frontend public types
4. Event ingestion backlog and retry health
