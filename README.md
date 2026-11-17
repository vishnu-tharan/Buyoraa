# Buyora

**Discover More. Shop Better.**

## Phase 1 — Project setup

Buyora is a JavaScript MERN project. This phase sets up the red and yellow welcome screen, the Express API, and a check that tests the MongoDB connection. Shopping and account features come in later phases.

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

- `frontend/src/main.jsx` renders the React screen and uses Axios to call the API when you select **Check connection**.
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
npm.cmd run dev
```

If you already have a `.env` file, keep it and skip the copy command. For Atlas, update `MONGODB_URI` in `backend/.env` before starting the server. Use your database user's credentials and include `buyora` as the database name.

In a second terminal opened at the project root, start the frontend.

```powershell
cd frontend
npm.cmd ci
npm.cmd run dev
```

## Verify the setup

1. Open [Buyora](http://127.0.0.1:5173), select **Check connection**, and confirm the success message.
2. In Postman, send a GET request to `http://127.0.0.1:5000/api/health`. Expect HTTP 200 and the JSON below.

   ```json
   { "status": "ok", "database": "connected" }
   ```

3. From `frontend`, run `npm.cmd run build` to verify the frontend production build.

## Common setup errors

| Message or symptom | What to check |
| --- | --- |
| `MONGODB_URI is missing` | Create `backend/.env` from the example and run the API from `backend`. |
| `MongoDB connection failed` | Start the local MongoDB service or check the Atlas credentials and network access settings. |
| `EADDRINUSE` or a port is already in use | Stop the process already using port 5000 or 5173, then restart the matching Buyora server. |
| The welcome screen reports an unavailable connection | Check the backend terminal and try the API URL directly in Postman. |

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
