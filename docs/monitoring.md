# Monitoring & Alerting

## Health Checks

- `GET /api/health` checks app + DB connectivity.

## Logging

- API routes log errors to stdout/stderr (container logs).
- Workers log stream processing and failures to stdout/stderr.

## Suggested Integrations

- Error tracking: Sentry
- Metrics: Grafana/Prometheus or a hosted APM
- Uptime checks: Pingdom/UptimeRobot hitting `/api/health`

