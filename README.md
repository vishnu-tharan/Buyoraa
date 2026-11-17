# Buyora

**Discover More. Shop Better.**

## Phase 1 — Project setup

Buyora is a JavaScript MERN project. It includes a red and yellow storefront, Cash on Delivery checkout, and an admin dashboard for the catalog, inventory, customers, and orders.

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

## Phase 4 — Shopping features

```text
backend/
├── controllers/
│   ├── catalogController.js
│   └── cartController.js
└── routes/
    └── wishlistRoutes.js
frontend/src/
├── CartContext.jsx
└── pages/
    ├── Catalog.jsx
    ├── Cart.jsx
    └── Wishlist.jsx
```

The catalog form keeps search, category, price range, and sort in the URL. Express applies the filters before paginating. The cart stores product IDs and quantities in the current browser. When you open the cart or change a quantity, Express reads current stock and prices from MongoDB. Delivery is a flat LKR 350 for a cart with available items. The summary excludes unavailable lines and identifies which quantities need to change.

The wishlist belongs to the signed-in account and lives in MongoDB. Moving a saved product to the cart keeps any quantity already there. Cart estimates leave inventory untouched.

### Run and verify

Start MongoDB, the backend, and the frontend using **Run locally on Windows**. Open [Buyora](http://127.0.0.1:5173). Phase 4 uses the existing packages and environment settings.

1. Open **Shop**, enter a product name, select a category, and apply a price range and sort. Price fields take rupees, such as `4500.50`.
2. Open an in-stock product and add it to the cart. Change its quantity, verify the subtotal and delivery, and reload to confirm the quantity survives.
3. Sign in, save a product, and open **Wishlist**. Reload it, then remove the item or move it to the cart.

A fresh catalog shows empty states. To try a single product before catalog seeding is added, insert a category in MongoDB Compass with a name and slug. Insert a product with `name`, `description`, `price` in cents, `stock`, `images` as an array of HTTPS URLs, and `category` as the category's ObjectId.

### Phase 4 API routes

| Method and path | What it does |
| --- | --- |
| `GET /api/products?q=phone&minPrice=1000&maxPrice=9000&sort=price-asc` | Searches by name and applies price limits and sorting. Supports existing category, featured, and page parameters. |
| `POST /api/cart/quote` | Takes `items`, an array of objects with `productId` and `quantity`, and returns current stock and estimated totals. |
| `GET /api/wishlist` | Returns the signed-in account's saved products. |
| `PUT /api/wishlist/:productId` | Saves the product once, even when the request is repeated. |
| `DELETE /api/wishlist/:productId` | Removes the product from the signed-in account's wishlist. |

### Commit Phase 4

Run these commands from the project root.

```powershell
git add -- backend frontend README.md
git diff --cached --stat
git commit -m "Add shopping features"
```

## Phase 5 — Checkout and orders

```text
backend/
├── controllers/orderController.js
├── routes/orderRoutes.js
├── routes/userRoutes.js
└── utils/address.js
frontend/src/
├── components/AddressFields.jsx
├── components/OrderSummary.jsx
├── pages/Checkout.jsx
└── pages/Orders.jsx
```

To place an order, sign in, open the cart, and select **Continue to checkout**. Enter a delivery address or choose one saved in **My account**. Confirm the items and amount, then select **Place order**. **My orders** shows the order status, delivery address, payment status, and original item prices. Cash on Delivery starts with payment pending.

Express recalculates the total from MongoDB and asks the shopper to review any price change. It saves the order and reduces stock in one transaction. Retrying the same checkout returns the original order. The browser remembers the checkout attempt in the current tab until it receives a receipt.

### Run checkout locally

Order placement uses a MongoDB replica set so a failed order cannot leave a partial stock deduction. A transaction-capable Atlas cluster also works with its usual connection string. Browsing, account settings, and cart quotes also work with a standalone MongoDB server. [MongoDB development replica sets](https://www.mongodb.com/docs/manual/tutorial/deploy-replica-set-for-testing/)

For local Windows development, run a second MongoDB instance with its own data folder. This keeps existing data on port 27017 separate. Adjust the `mongod.exe` path if yours uses a different version.

```powershell
$buyoraReplicaPath = Join-Path $env:LOCALAPPDATA 'Buyora\mongodb'
New-Item -ItemType Directory -Path $buyoraReplicaPath -Force | Out-Null
& 'C:\Program Files\MongoDB\Server\8.0\bin\mongod.exe' --dbpath $buyoraReplicaPath --port 27018 --bind_ip 127.0.0.1 --replSet buyora-rs
```

Keep that terminal open. Open another terminal at the project root, install the backend packages if needed, and initialize the replica set once.

```powershell
cd backend
npm.cmd ci
node --input-type=module -e "import mongoose from 'mongoose'; const client = new mongoose.mongo.MongoClient('mongodb://127.0.0.1:27018/?directConnection=true'); try { await client.db('admin').command({ replSetInitiate: { _id: 'buyora-rs', members: [{ _id: 0, host: 'localhost:27018' }] } }); } finally { await client.close(); }"
```

After the replica set elects its primary, set `MONGODB_URI` in `backend/.env` to the connection string below and keep your existing `JWT_SECRET`. Run `npm.cmd run dev` from `backend`, then start the frontend as before.

```dotenv
MONGODB_URI=mongodb://127.0.0.1:27018/buyora?replicaSet=buyora-rs
```

This local replica starts with its own empty catalog. Create a test product using the Phase 4 instructions in the replica's database before trying checkout.

### Verify Phase 5

1. Register or sign in. In **My account**, update your phone number and add a delivery address. Edit or remove an address there.
2. Add an in-stock product and place a Cash on Delivery order using the saved address. Confirm that the cart clears, stock decreases, and the order is in **My orders**.
3. In Postman, use a signed-in cookie to test `GET /api/orders` and `GET /api/orders/:id`. For `POST /api/orders`, send `items` with a `productId` and `quantity` per line. Include `shippingAddress` with `name`, `phone`, `street`, `city`, `postalCode`, and `country`. Take `expectedTotal` in cents from `POST /api/cart/quote` and generate `checkoutKey` as a UUID. Submitting the same body twice returns 201 and then 200 with the same order ID.
4. If the order says it needs a replica set, check the backend's `MONGODB_URI` and restart the backend after updating it.

### Commit Phase 5

When earlier changes are already committed, run these commands from the project root.

```powershell
git add -- backend frontend README.md
git diff --cached --stat
git commit -m "Add checkout and orders"
```

## Phase 6 — Admin dashboard

```text
backend/
├── controllers/
│   ├── adminController.js
│   ├── adminCatalogController.js
│   └── adminOrdersController.js
├── routes/adminRoutes.js
└── utils/query.js
frontend/src/pages/
├── Admin.jsx
├── AdminCategories.jsx
├── AdminOrders.jsx
└── AdminProducts.jsx
```

The React admin pages call `/api/admin`. Express checks the session and the user's current MongoDB role on every request. The dashboard shows active products, customer accounts, total orders, recent orders, and collected sales in LKR. Collected sales include delivery fees from delivered and paid orders.

Create categories before adding products. The price field takes rupees. Add 1 to 8 image URLs, one per line. Removing a product hides it from the store, cart quotes, and wishlists while preserving the inventory record behind past orders. Move or remove a category's active products before deleting the category. If stock changes while a product is open for editing, reload the product before saving.

An order progresses from **Pending** to **Confirmed**, **Shipped**, and **Delivered**. An admin can cancel a pending or confirmed order and restore its stock. Marking an order delivered records the Cash on Delivery payment as paid.

### Run and verify

Use the MongoDB replica set or Atlas connection from Phase 5. Product saves, category deletion, and status updates use transactions. Start both servers with `npm.cmd run dev` in their respective folders. Sign in with an admin account in your current database using the Phase 2 setup, then open **My account** and select **Admin area**.

1. Create a category and add a product with stock and an image URL. Edit the price or quantity. Verify the change in the public catalog.
2. Try deleting the category while it has an active product. Remove the product and try again.
3. Place an order as a customer. In the admin account, open the order, review its items and delivery details, and confirm it. Cancel it and verify that its stock was restored. Process another order through shipping and delivery, then verify the collected sales total.
4. Search **Customers** by name or email. Sign in as a customer and verify that `/admin` is restricted. In Postman, verify that a customer session receives HTTP 403 from `GET /api/admin/overview`.

### Commit Phase 6

Run these commands from the project root.

```powershell
git add -- backend frontend README.md
git diff --cached --stat
git commit -m "Add admin dashboard"
```
