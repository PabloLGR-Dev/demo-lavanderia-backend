# Lavandería Rodríguez — Backend

REST API for the Lavandería Rodríguez management system. Built with Express 5, TypeScript, Drizzle ORM, and PostgreSQL.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js |
| Framework | Express 5 |
| Language | TypeScript (ESM) |
| ORM | Drizzle ORM |
| Database | PostgreSQL |
| Auth | JSON Web Tokens + bcrypt |
| Email | Nodemailer |
| Dev server | tsx watch |

---

## Project Structure

```
src/
├── controllers/        # Business logic per resource
├── db/
│   ├── index.ts        # Drizzle client
│   └── schema/         # Table definitions
├── demo/
│   └── store.ts        # In-memory store for demo mode
├── middlewares/
│   └── auth.middleware.ts
├── routes/             # Express routers
├── services/
│   └── email.service.ts
├── index.ts            # Entry point
└── seed-demo.ts        # Database seed script
```

---

## API Routes

| Prefix | Resource |
|---|---|
| `/api/auth` | Authentication (login, refresh, logout, password reset) |
| `/api/dashboard` | Dashboard summary stats |
| `/api/clientes` | Clients |
| `/api/facturas` | Invoices |
| `/api/grupos-facturas` | Invoice groups |
| `/api/pagos` | Payments |
| `/api/gastos` | Expenses |
| `/api/servicios` | Laundry services |
| `/api/prendas` | Garment types |
| `/api/prendasservicios` | Garment–service price assignments |
| `/api/reportes` | Reports and analytics |
| `/api/configuraciones` | System settings |
| `/api/categoriasgastos` | Expense categories |

All routes (except `/api/auth/login`) require a `Bearer` token in the `Authorization` header.

---

## Environment Variables

Create a `.env` file in the project root:

```env
# Database
DATABASE_URL=postgresql://user:password@host:5432/dbname

# Server
PORT=3000
FRONTEND_URL=http://localhost:3001

# Auth
JWT_SECRET=your-jwt-secret
REFRESH_TOKEN_SECRET=your-refresh-token-secret

# Email (Nodemailer)
EMAIL_HOST=smtp.example.com
EMAIL_PORT=587
EMAIL_USER=your@email.com
EMAIL_PASS=your-email-password
EMAIL_FROM=your@email.com

# Demo mode (optional)
DEMO_MODE=false
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL 14+

### Installation

```bash
npm install
```

### Database Setup

```bash
# Push schema to the database
npm run db:push

# Seed with demo data
npm run db:seed
```

### Development

```bash
npm run dev
```

The server starts at `http://localhost:3000` (or the port set in `PORT`).

### Production

```bash
npm run build
npm run start
```

---

## Demo Mode

When `DEMO_MODE=true`, the API operates with a per-user in-memory store layered on top of the database:

- **Read** operations merge database records with the user's in-memory session.
- **Write** operations on demo-owned records (IDs >= 90001) go to the in-memory store — no database writes occur.
- **Write** operations targeting existing database records return `403 Forbidden`.
- Each user session is isolated and cleared on logout.

This allows safe public demos without risk of data corruption.

---

## Database Scripts

| Command | Description |
|---|---|
| `npm run db:generate` | Generate migration files from schema changes |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:push` | Push schema directly to the database (no migration files) |
| `npm run db:pull` | Pull schema from an existing database |
| `npm run db:seed` | Seed the database with demo data |
