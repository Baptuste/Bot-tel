# Graph Report - Bot-tel  (2026-09-02)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 746 nodes · 1970 edges · 28 communities (24 shown, 2 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 29 edges (avg confidence: 0.86)
- Token cost: 1,088 input · 327 output

## Graph Freshness
- Built from commit: `17f1157d`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Shop and Cart Routing
- Order and Route Management
- Telegram Bot Features
- Customer Loyalty and Referrals
- Client Checkout and Catalog UI
- Authentication and Admin Middleware
- Catalog CRUD API
- Project Development Dependencies
- Admin Dashboard Web Components
- Package Dependencies and Scripts
- Integration and Smoke Tests
- Frontend TypeScript Configuration
- Admin UI Actions and State
- Backend TypeScript Configuration
- Product and Catalog Editors
- Order Detail and Feature Context
- Delivery Route Management UI
- Telegram Mini App Entrypoints
- Bot Client and Server API
- Bot Daily Workflow Simulation
- Driver and Route Assignment UI
- Project Documentation and Architecture
- Catalog State Management
- Client Preview Environment
- Mini App UI Rendering
- Scripts Documentation

## God Nodes (most connected - your core abstractions)
1. `alertDialog()` - 27 edges
2. `confirmDialog()` - 23 edges
3. `shopRouter()` - 21 edges
4. `requireAdmin()` - 20 edges
5. `features` - 19 edges
6. `getOrder()` - 18 edges
7. `routesRouter()` - 18 edges
8. `safeSend()` - 18 edges
9. `scripts` - 18 edges
10. `esc()` - 17 edges

## Surprising Connections (you probably didn't know these)
- `load()` --indirect_call--> `userId()`  [INFERRED]
  web/src/CustomerDetail.tsx → src/context.ts
- `patch()` --indirect_call--> `userId()`  [INFERRED]
  web/src/CustomerDetail.tsx → src/context.ts
- `main()` --indirect_call--> `localDate()`  [INFERRED]
  scripts/smoke.mts → web/src/types.ts
- `shopRouter()` --indirect_call--> `requireUser()`  [INFERRED]
  src/api/shop.ts → src/api/auth.ts
- `ordersRouter()` --indirect_call--> `requireAdmin()`  [INFERRED]
  src/api/orders.ts → src/api/auth.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Documentation Principale du Projet** — docs_cadrage_md, docs_avancement_md, docs_coeur_et_modules_md, docs_feuille_de_route_md, docs_mini_app_client_md, docs_deploiement_md [EXTRACTED 1.00]

## Communities (28 total, 2 thin omitted)

### Community 0 - "Shop and Cart Routing"
Cohesion: 0.05
Nodes (86): cartDto(), clientConfig(), shopRouter(), CALLBACK_PATTERN, CB, parseCallback(), ParsedCallback, addToCart() (+78 more)

### Community 1 - "Order and Route Management"
Cohesion: 0.06
Nodes (83): now, ordersRouter(), toDto(), parseCapacity(), parseDriverId(), routesRouter(), resolveMenuItems(), Driver (+75 more)

### Community 2 - "Telegram Bot Features"
Cohesion: 0.06
Nodes (52): sent, telegram, isAdmin(), registerAdmin(), purgeCarts(), activeRoutesStmt(), DashboardData, getOverduePendingIds() (+44 more)

### Community 3 - "Customer Loyalty and Referrals"
Cohesion: 0.07
Nodes (42): sent, telegram, customersRouter(), Customer, CustomerRow, CustomerSummary, getCustomer(), listCustomers() (+34 more)

### Community 4 - "Client Checkout and Catalog UI"
Cohesion: 0.13
Nodes (35): request(), shop, Cart(), Props, Catalog(), Props, Checkout(), Props (+27 more)

### Community 5 - "Authentication and Admin Middleware"
Cohesion: 0.12
Nodes (34): Express, isAdminUser(), readInitData(), Request, requireAdmin(), requireUser(), TgUser, verifyInitData() (+26 more)

### Community 6 - "Catalog CRUD API"
Cohesion: 0.14
Nodes (32): catalogRouter(), resolveImage(), Category, createCategory(), createProduct(), createVariant(), deleteCategory(), deleteProduct() (+24 more)

### Community 7 - "Project Development Dependencies"
Cohesion: 0.06
Nodes (34): devDependencies, tsx, @types/better-sqlite3, @types/express, @types/node, typescript, typescript, react (+26 more)

### Community 8 - "Admin Dashboard Web Components"
Cohesion: 0.12
Nodes (26): api, Props, Dashboard(), Props, Props, Props, Addable, Props (+18 more)

### Community 9 - "Package Dependencies and Scripts"
Cohesion: 0.06
Nodes (32): better-sqlite3, dotenv, express, dependencies, better-sqlite3, dotenv, express, telegraf (+24 more)

### Community 10 - "Integration and Smoke Tests"
Cohesion: 0.11
Nodes (19): admin, ADMIN_ID, call(), check(), env, main(), stranger, today (+11 more)

### Community 11 - "Frontend TypeScript Configuration"
Cohesion: 0.09
Nodes (21): DOM, DOM.Iterable, vite.config.ts, compilerOptions, esModuleInterop, isolatedModules, jsx, lib (+13 more)

### Community 12 - "Admin UI Actions and State"
Cohesion: 0.15
Nodes (17): CustomerDetail(), load(), patch(), Customers(), Drivers(), add(), run(), MessageTemplates() (+9 more)

### Community 13 - "Backend TypeScript Configuration"
Cohesion: 0.12
Nodes (16): compilerOptions, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution, noUncheckedIndexedAccess, outDir (+8 more)

### Community 14 - "Product and Catalog Editors"
Cohesion: 0.18
Nodes (12): Editing, fileToResizedDataUrl(), ProductForm(), pickImage(), ProductValues, Props, ProductVariants(), run() (+4 more)

### Community 15 - "Order Detail and Feature Context"
Cohesion: 0.24
Nodes (14): FeaturesContext, NON_TERMINAL, useFeatures(), useFlow(), OrderDetail(), apply(), onStatusClick(), errorMessage() (+6 more)

### Community 16 - "Delivery Route Management UI"
Cohesion: 0.23
Nodes (14): Props, RouteOrderRow(), markDelivered(), reportProblem(), Routes(), createRoute(), finish(), guard() (+6 more)

### Community 17 - "Telegram Mini App Entrypoints"
Cohesion: 0.21
Nodes (10): AdminApp(), Tab, App(), State, initData, initTelegram(), tg, TgWebApp (+2 more)

### Community 18 - "Bot Client and Server API"
Cohesion: 0.17
Nodes (8): AUTH, env, flat, listener, menu, sent, server, telegram

### Community 19 - "Bot Daily Workflow Simulation"
Cohesion: 0.21
Nodes (8): check(), log(), runRoute(), sent, Sim, telegram, TODAY, ItemRef

### Community 20 - "Driver and Route Assignment UI"
Cohesion: 0.44
Nodes (6): Props, DriverSelect(), Props, Props, Driver, RouteTemplate

### Community 21 - "Project Documentation and Architecture"
Cohesion: 0.31
Nodes (8): Journal d'avancement, Document de cadrage, Architecture Cœur + Modules, Cœur commun + modules, Mise en production (Oracle Cloud), Feuille de route évolutions & refactoring, Mini App Client & Panier Partagé, Mini App client — plan du chantier

### Community 22 - "Catalog State Management"
Cohesion: 0.52
Nodes (7): Catalog(), addCategory(), guard(), removeCategory(), removeProduct(), saveProduct(), toggleAvailable()

### Community 23 - "Client Preview Environment"
Cohesion: 0.40
Nodes (3): env, ID, index

## Knowledge Gaps
- **208 isolated node(s):** `ParsedCallback`, `WizardData`, `CartRow`, `CreateClientOrderInput`, `CreateClientOrderResult` (+203 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 245 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `userId()` connect `Shop and Cart Routing` to `Telegram Bot Features`, `Admin UI Actions and State`?**
  _High betweenness centrality (0.220) - this node is a cross-community bridge._
- **Why does `patch()` connect `Admin UI Actions and State` to `Shop and Cart Routing`?**
  _High betweenness centrality (0.188) - this node is a cross-community bridge._
- **Why does `alertDialog()` connect `Admin UI Actions and State` to `Client Checkout and Catalog UI`, `Admin Dashboard Web Components`, `Product and Catalog Editors`, `Order Detail and Feature Context`, `Delivery Route Management UI`, `Telegram Mini App Entrypoints`, `Driver and Route Assignment UI`, `Catalog State Management`?**
  _High betweenness centrality (0.182) - this node is a cross-community bridge._
- **Are the 8 inferred relationships involving `requireAdmin()` (e.g. with `catalogRouter()` and `customersRouter()`) actually correct?**
  _`requireAdmin()` has 8 INFERRED edges - model-reasoned connections that need verification._
- **What connects `ParsedCallback`, `WizardData`, `CartRow` to the rest of the system?**
  _208 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Shop and Cart Routing` be split into smaller, more focused modules?**
  _Cohesion score 0.0547022932884494 - nodes in this community are weakly interconnected._
- **Should `Order and Route Management` be split into smaller, more focused modules?**
  _Cohesion score 0.055921855921855924 - nodes in this community are weakly interconnected._