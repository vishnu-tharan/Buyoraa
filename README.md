# Buyora

**Discover More. Shop Better.**

## Phase 1 — Project setup

Buyora is a JavaScript MERN project. Phase 1 set up the local development environment. Phase 2 added the database models and authentication APIs. Phase 3 connects the red and yellow storefront to those APIs.

The original Phase 1 layout

```text
Buyora/
├── .gitignore
├── README.md
├── backend/
│   ├── .env.example
│   ├── package.json
│   ├── package-lock.json
│   └── server.js
└── frontend/
    ├── index.html
    ├── package.json
    ├── package-lock.json
    ├── vite.config.js
    └── src/
        ├── index.css
        └── main.jsx
```

- `frontend/src/main.jsx` starts React and React Router.
- `frontend/src/index.css` loads Tailwind CSS and defines Buyora's colors.
- `frontend/vite.config.js` sends browser requests starting with `/api` to Express on port 5000.
- `backend/server.js` reads the MongoDB connection string using dotenv, connects through Mongoose, and answers `GET /api/health` by pinging MongoDB.

The browser talks to Express. Express talks to MongoDB. The connection string stays on the backend.

## Run locally on Windows

Use Node.js 22.12 or later, npm, and either MongoDB Community Server or a MongoDB Atlas database. For a local Windows installation configured as a service, start MongoDB in the Windows **Services** app. [MongoDB Windows setup](https://www.mongodb.com/docs/v8.0/tutorial/install-mongodb-on-windows/)

In a PowerShell terminal opened at the project root, start the backend.

```powershell
cd backend
npm.cmd ci
Copy-Item .env.example .env
```

If you already have a `.env` file, keep it and skip the copy command. For Atlas, update `MONGODB_URI` in `backend/.env` with your database user's credentials and include `buyora` as the database name.

Generate a signing secret from the backend terminal and paste the output after `JWT_SECRET=` in `backend/.env`. The same file holds `FRONTEND_ORIGIN`, which defaults to `http://127.0.0.1:5173`.

```powershell
node -p "require('node:crypto').randomBytes(32).toString('hex')"
```

After saving the secret in `.env`, start the backend.

```powershell
npm.cmd run dev
```

In a second terminal opened at the project root, start the frontend.

```powershell
cd frontend
npm.cmd ci
npm.cmd run dev
```

## Verify the setup

1. Open [Buyora](http://127.0.0.1:5173) and verify that the storefront opens.
2. In Postman, send a GET request to `http://127.0.0.1:5000/api/health`. Expect HTTP 200 and the JSON below.

   ```json
   { "status": "ok", "database": "connected" }
   ```

3. From `frontend`, run `npm.cmd run build` to verify the frontend production build.

## Common setup errors

| Message or symptom | What to check |
| --- | --- |
| `MONGODB_URI is missing` | Create `backend/.env` from the example and run the API from `backend`. |
| `MongoDB setup failed` | Start the local MongoDB service or check the Atlas credentials and network access settings. |
| `Set JWT_SECRET to a random value` | Generate a secret using the command above and save it in `backend/.env`. |
| `This request origin is not allowed` | Open the frontend at `http://127.0.0.1:5173` or set `FRONTEND_ORIGIN` to the exact frontend origin. |
| `EADDRINUSE` or a port is already in use | Stop the process already using port 5000 or 5173, then restart the matching Buyora server. |
| The store cannot load products or categories | Check the backend terminal and try `/api/health` in Postman. |

## Commit Phase 1

From the project root, initialize Git and commit the setup. The `.gitignore` keeps the real `.env`, installed packages, and build output out of the commit.

```powershell
git init -b main
git add .
git status --short
git commit -m "Set up Buyora MERN project"
```

To publish your commit, create an empty GitHub repository, then substitute your repository URL below.

```powershell
git remote add origin https://github.com/YOUR-USERNAME/Buyora.git
git push -u origin main
```

## Phase 2 — Backend foundation

```text
backend/
├── config/
│   └── database.js
├── controllers/
│   ├── authController.js
│   └── catalogController.js
├── middleware/
│   ├── auth.js
│   └── errors.js
├── models/
│   ├── Category.js
│   ├── Order.js
│   ├── Product.js
│   ├── User.js
│   └── Wishlist.js
├── routes/
│   ├── adminRoutes.js
│   ├── authRoutes.js
│   └── catalogRoutes.js
├── utils/
│   └── session.js
├── .env.example
├── package.json
├── package-lock.json
└── server.js
```

Express sends requests to the route handlers. The controllers validate input and use the Mongoose models to read or write MongoDB. Registration hashes passwords with bcrypt. Registration and login set an HTTP-only session cookie that expires after one day. On later requests, the middleware verifies the cookie and loads the current account and role from MongoDB.

The frontend calls these routes through the Vite proxy. You can also test the routes directly in Postman. Product prices and order amounts are integers in the currency's smallest unit. For example, `250000` represents `Rs. 2,500.00`.

### Test the API in Postman

Start MongoDB and run `npm.cmd run dev` from `backend`. Use `http://127.0.0.1:5000` for every request so Postman can reuse the session cookie.

| Method and path | Expected result |
| --- | --- |
| `POST /api/auth/register` | Send a JSON object with `name`, `email`, and `password`. Expect 201 and a customer account. Reusing the email returns 409. |
| `GET /api/auth/me` | Returns the signed-in account. A request without a session returns 401. |
| `POST /api/auth/logout` | Clears the session cookie and returns 204. |
| `POST /api/auth/login` | Send the email and password as JSON. Expect 200 and a session cookie, or 401 for incorrect credentials. |
| `GET /api/admin/users?page=1` | Returns customer accounts for an admin. A signed-in customer receives 403. |
| `GET /api/categories` | Returns the category list. |
| `GET /api/products?page=1` | Returns up to 24 products and the total count. |
| `GET /api/products/:id` | Returns a product by MongoDB ID. An unknown ID returns 404. |

On a fresh database, the catalog lists are empty. The storefront displays items from MongoDB as they become available.

To test admin access locally, register a second account. In MongoDB Compass, open the `users` collection in your Buyora database, find that account by email, and set its `role` to `admin`. Log in using that account and retry the admin request. The public registration API always creates customers.

### Commit Phase 2

Run these commands from the project root.

```powershell
git add -- backend README.md
git diff --cached --stat
git commit -m "Add backend foundation"
```

To publish the commit to the configured GitHub repository, run `git push origin main`.

## Phase 3 — Frontend foundation

```text
frontend/
├── index.html
├── package.json
├── package-lock.json
├── vite.config.js
└── src/
    ├── api.js
    ├── App.jsx
    ├── AuthContext.jsx
    ├── index.css
    ├── main.jsx
    ├── components/
    │   ├── Feedback.jsx
    │   ├── ProductGrid.jsx
    │   └── StoreLayout.jsx
    └── pages/
        ├── Account.jsx
        ├── Admin.jsx
        ├── Catalog.jsx
        └── Home.jsx
```

`App.jsx` defines the routes and protects the account and admin pages. `StoreLayout.jsx` provides the shared navigation and footer. `api.js` sends Axios requests to `/api`, and Vite forwards them to Express on port 5000. `AuthContext.jsx` checks the session through `/api/auth/me` so signing in survives a page reload. The account token stays in the server-issued HTTP-only cookie.

The homepage, catalog, product details, and read-only admin customer list use live API data. Prices display in Sri Lankan rupees. The store can filter by category or featured status and paginate using `GET /api/products?category=home&featured=true&page=1`. The category value must match a category slug in your database.

### Run and verify

Follow **Run locally on Windows** to start MongoDB and the backend. Run the following in a separate PowerShell terminal at the project root.

```powershell
cd frontend
npm.cmd ci
npm.cmd run dev
```

1. Open [Buyora](http://127.0.0.1:5173). Use **Shop** and **Categories** to navigate. A fresh database shows empty catalog states.
2. Register an account, reload **My account** to verify the session persists, then sign out and sign back in.
3. While signed in as a customer, visit `/admin` to verify access is denied. For the permitted flow, use the admin account setup in Phase 2.
4. From `frontend`, run `npm.cmd run build`. To preview that build, stop the frontend dev server and run `npm.cmd run preview`. Both frontend commands use port 5173 and require the same running backend for API requests.

The home banner uses a photo by Iuliia Pilipeichenko. [Photo on Unsplash](https://unsplash.com/photos/hand-holding-colorful-shopping-bags-against-a-light-wall-6ZgtlGd4RQE)

### Commit Phase 3

Run these commands from the project root.

```powershell
git add -- frontend backend/controllers/catalogController.js README.md
git diff --cached --stat
git commit -m "Build storefront foundation"
```
