# Architecture

The platform has four backend services and one MySQL database. Each service exposes an independent API and has its own AWS SAM template.

1. The router authenticates credentials against `Users`, creates JWT-backed `AuthSessions`, and forwards protected requests by role.
2. The admin API handles organization-wide records and text chat for administrators.
3. The employee API handles records belonging to the signed-in user, company policies, leave requests, and text chat.
4. The voice API transcribes audio, sends the transcript through the router's admin or employee chat route, and synthesizes the text answer into audio.

The router forwards `/admin/*` to the admin service's `/api/*` endpoints and `/user/*` to the employee service's `/api/*` endpoints. The admin and employee services validate the JWT again. Database queries are parameterized and scoped with IDs from the verified token. Chat classification chooses a supported intent; it cannot supply SQL.

`Organizations`, `Users`, `LeaveBalances`, `CompanyPolicies`, and `PayrollData` hold HR data. `AuthSessions` stores login sessions. `LeaveRequests` stores leave applications and decisions. Use `database/schema.sql` for a new database and `npm run schema:check` to inspect the tables and columns needed by the services in an existing database.
