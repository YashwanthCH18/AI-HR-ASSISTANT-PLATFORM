# AI HR Assistant Platform

A hackathon-built microservice platform for HR self-service. Employees can ask about their profile, leave, payroll, and company policies through text or voice. Administrators can manage organization data and answer organization-wide questions. Requests are routed by role, and all data is stored in MySQL, including Railway-hosted MySQL.

## Features

- **Role-based routing:** one entry point sends admin and employee requests to separate APIs.
- **HR chat:** text questions map to supported HR intents and parameterized database queries. Gemini can optionally classify questions that the built-in rules do not recognize.
- **Employee self-service:** view personal data, submit leave requests, and track their status.
- **Admin operations:** manage users, leave balances, payroll, policies, and leave approvals.
- **Voice interaction:** transcribe an audio question, route it to the appropriate chat service, and return a spoken answer.
- **Independent deployment:** each service has its own AWS SAM template, Lambda function, and API Gateway.

## Architecture

```text
                          ┌──────────────┐
Text client ──────────────→│    Router    │── admin ───→ Admin API ────┐
                          │ auth + roles │                             │
Voice client → Voice API ─→│              │── employee → Employee API ─┤→ MySQL
               ↑          └──────────────┘                             │
               └────── speech response ←──── chat response ───────────┘
```

| Service | Local port | Main responsibility |
| --- | ---: | --- |
| Router | 5000 | Login, JWT sessions, and role-based forwarding |
| Admin | 5001 | Organization-wide HR API and text chat |
| Employee | 5002 | Personal HR API, leave requests, and text chat |
| Voice | 5003 | Speech to text, routed chat, and text to speech |

The router uses MySQL-backed sessions. The admin and employee services validate the same JWT secret and scope queries to the token's organization; employee queries also use the token's user ID. The voice service calls the router and does not connect to MySQL directly. See [Architecture](docs/ARCHITECTURE.md) for the request flow and service boundaries.

## Repository layout

```text
services/
  router/       Authentication and API routing
  admin/        Admin HR endpoints and chat
  employee/     Employee HR endpoints and chat
  voice/        Audio input and spoken responses
shared/         Shared authentication, chat, and database helpers
database/       Fresh database schema, schema check, and migration
tests/          Service and routing tests
docs/           Architecture details
```

## Run locally

**Requirements:** Node.js 22 or later and MySQL. A Sarvam API key is required for voice; a Gemini API key is optional for text intent classification.

1. Install dependencies from the repository root:

   ```powershell
   npm ci
   ```

2. For a **new, empty** MySQL database, import [`database/schema.sql`](database/schema.sql). For an existing database, set its `DB_*` variables in your shell and run `npm run schema:check` first. This read-only command reports missing tables and columns. Review [`database/migrations/001_leave_requests.sql`](database/migrations/001_leave_requests.sql) if the leave-request table is absent.

3. Copy each service's `.env.example` to `.env` and fill in its values. The router, admin, and employee services need database connection details. All four services must use the **same `JWT_SECRET`**. Set the router URLs to `http://localhost:5001/api` and `http://localhost:5002/api`, and set the voice service's `ROUTER_BASE_URL` to `http://localhost:5000`.

4. For a new database, set `ORG_ID`, `ORG_NAME`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` in `services/router/.env`, then create the first admin account:

   ```powershell
   npm --prefix services/router run bootstrap:admin
   ```

5. Start the services in separate terminals from the repository root:

   ```powershell
   npm --prefix services/admin start
   npm --prefix services/employee start
   npm --prefix services/router start
   npm --prefix services/voice start
   ```

Voice can be omitted when using text chat only. Public signup is disabled by default; administrators can create employee and manager accounts through `POST /admin/users`.

### Environment variables

| Service | Required variables | Optional variables |
| --- | --- | --- |
| Router | `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `JWT_SECRET`, `ADMIN_BACKEND_URL`, `USER_BACKEND_URL` | `DB_PORT`, `PORT`, `ALLOWED_ORIGINS`, bootstrap variables |
| Admin | `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `JWT_SECRET` | `DB_PORT`, `PORT`, `GEMINI_API_KEY` |
| Employee | `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `JWT_SECRET` | `DB_PORT`, `PORT`, `GEMINI_API_KEY` |
| Voice | `JWT_SECRET`, `ROUTER_BASE_URL`, `SARVAM_API_KEY` | `PORT` |

Admin and employee also accept `DATABASE_URL` in place of separate `DB_*` variables. Keep `.env` files and API keys out of Git.

## API

Call text and HR endpoints through the **router** at `http://localhost:5000`. Log in with `POST /auth/login` using `email` and `password`; the response includes a JWT. Send it on protected requests as `Authorization: Bearer <token>`.

| Method | Router path | Purpose |
| --- | --- | --- |
| `POST` | `/auth/login` | Log in |
| `POST` | `/auth/logout` | End the current session |
| `GET` | `/auth/me`, `/auth/verify-token` | Inspect or verify a session |
| `GET`, `POST` | `/admin/users` | List or create users |
| `GET`, `POST` | `/admin/leave-balances` | List or set leave balances |
| `GET` | `/admin/payroll` | View organization payroll |
| `PUT` | `/admin/payroll/:userId` | Set a user's payroll |
| `GET` | `/admin/company-policies` | View policies |
| `POST` | `/admin/company-policy` | Create or update a policy |
| `GET` | `/admin/leave-requests` | View organization leave requests |
| `PATCH` | `/admin/leave-requests/:id` | Approve or reject a request |
| `POST` | `/admin/ai-query` | Admin text chat |
| `GET` | `/user/profile`, `/user/leave-balance`, `/user/payroll` | View personal HR data |
| `GET` | `/user/company-policies`, `/user/leave-requests` | View policies and own requests |
| `POST` | `/user/leave-apply` | Submit a leave request |
| `POST` | `/user/ai-query` | Employee text chat |

Text chat accepts JSON such as `{"prompt":"How many casual leaves do I have left?"}`. Admin chat can answer organization-level questions; employee chat returns only the signed-in user's data. Chat supports profile, users, leave, payroll, policies, and leave-request intents as permitted by role. It does not execute SQL generated by a model.

Leave applications use `leave_type`, `start_date`, `end_date`, and optional `reason`. Days are reserved while a request is pending; approval marks them used, while rejection releases them. Dates count calendar days.

### Voice API

Call the voice service directly at `http://localhost:5003/api/voice-query` with the same Bearer token and a multipart `audio` file (maximum 4 MB). The service transcribes speech to English text with Sarvam, calls the role-appropriate router chat endpoint, and uses Sarvam to synthesize an English WAV response. The JSON response includes `transcript`, `intent`, `message`, `data`, and `audio.base64`.

## AWS SAM

Each service has a standalone template at `services/<service>/template.yaml`. The templates use the Node.js 22 Lambda runtime and create separate API Gateway and Lambda resources. From the repository root, validate and build all four:

```powershell
foreach ($service in @('admin', 'employee', 'router', 'voice')) {
  sam validate --template-file "services/$service/template.yaml" --lint
  sam build --template-file "services/$service/template.yaml" --build-dir ".aws-sam/$service"
}
```

For deployment, use four different CloudFormation stack names. Deploy admin and employee first. Set the router's `AdminBackendUrl` and `EmployeeBackendUrl` parameters to their API outputs with `/api` appended. Deploy voice last and set `RouterBaseUrl` to the router's API output. Supply the same `JwtSecret` to all four stacks, plus database parameters to the three DB-backed stacks and `SarvamApiKey` to voice. Ensure the Lambda network configuration can reach the MySQL host. Do not commit deployment secrets.

The SAM templates expose an `ApiUrl` output for each stack. The router receives `/admin/*` and `/user/*`; voice receives `/api/voice-query` on its own API. API Gateway and Lambda payload limits apply to audio uploads and responses.

## Checks

```powershell
npm test
npm run check
npm run schema:check   # requires a configured MySQL connection
```

`npm test` covers role routing, data scoping, leave requests, text chat, and the voice request flow with mocked external APIs. `npm run check` checks JavaScript syntax. The schema check reads database metadata and does not modify data.
