# Graph Report - Bot-tel  (2026-09-02)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 810 nodes · 2029 edges · 40 communities (33 shown, 4 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 29 edges (avg confidence: 0.86)
- Token cost: 1,738 input · 451 output

## Graph Freshness
- Built from commit: `d6e1f268`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Shopping Cart Management
- Driver Route Management
- Order Management API
- Customer Telegram Bot
- Client Shop Frontend
- Authentication Middleware
- Catalog and Order Routing
- Frontend Web Dependencies
- Admin Dashboard API
- Backend Dependencies
- Admin Bot Session Tests
- Web TypeScript Configuration
- Order Editing Interface
- Backend TypeScript Configuration
- Product Catalog Management
- Admin UI Frontend
- Route Delivery Actions
- Client App Entrypoint
- Telegram Integration Server
- Graphify Specification
- Driver and Route UI
- Project Documentation
- Catalog Mutation Operations
- Client Preview Integration
- Bot State and Callbacks
- Checkout Flow Steps
- Bot UI Views and Keyboards
- Support Scenes and Config
- Graphify Export Formats
- Graphify Query Reference
- Graphify Watch Mode
- Graphify Git Integration
- Graphify Incremental Updates
- Graphify GitHub Merge
- Graphify Audio Transcription
- Claude Configuration
- Extraction Subagent Spec

## God Nodes (most connected - your core abstractions)
1. `alertDialog()` - 27 edges
2. `confirmDialog()` - 23 edges
3. `shopRouter()` - 21 edges
4. `requireAdmin()` - 20 edges
5. `features` - 19 edges
6. `routesRouter()` - 18 edges
7. `safeSend()` - 18 edges
8. `getOrder()` - 18 edges
9. `scripts` - 18 edges
10. `q()` - 17 edges

## Surprising Connections (you probably didn't know these)
- `load()` --indirect_call--> `userId()`  [INFERRED]
  web/src/CustomerDetail.tsx → src/context.ts
- `patch()` --indirect_call--> `userId()`  [INFERRED]
  web/src/CustomerDetail.tsx → src/context.ts
- `main()` --calls--> `createOrder()`  [EXTRACTED]
  scripts/smoke.mts → src/orders.ts
- `main()` --indirect_call--> `localDate()`  [INFERRED]
  scripts/smoke.mts → web/src/types.ts
- `scripts/ README` --references--> `Cœur commun + modules`  [EXTRACTED]
  scripts/README.md → docs/coeur-et-modules.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Documentation Principale du Projet** — docs_cadrage_md, docs_avancement_md, docs_coeur_et_modules_md, docs_feuille_de_route_md, docs_mini_app_client_md, docs_deploiement_md [EXTRACTED 1.00]

## Communities (40 total, 4 thin omitted)

### Community 0 - "Shopping Cart Management"
Cohesion: 0.18
Nodes (25): cartDto(), clientConfig(), shopRouter(), addToCart(), cartCount(), CartRow, cartTotal(), clearCart() (+17 more)

### Community 1 - "Driver Route Management"
Cohesion: 0.13
Nodes (42): parseCapacity(), parseDriverId(), routesRouter(), Driver, detachRouteOrders(), getAssignableOrders(), getOrdersByRoute(), moveOrderInRoute() (+34 more)

### Community 2 - "Order Management API"
Cohesion: 0.06
Nodes (67): isAdmin(), registerAdmin(), ordersRouter(), toDto(), resolveMenuItems(), OrderFlowConfig, StageRole, loyaltyStatus (+59 more)

### Community 3 - "Customer Telegram Bot"
Cohesion: 0.05
Nodes (50): sent, telegram, now, sent, telegram, customersRouter(), Customer, CustomerRow (+42 more)

### Community 4 - "Client Shop Frontend"
Cohesion: 0.13
Nodes (34): request(), shop, Cart(), Props, Catalog(), Props, Checkout(), Props (+26 more)

### Community 5 - "Authentication Middleware"
Cohesion: 0.11
Nodes (37): Express, isAdminUser(), readInitData(), Request, requireAdmin(), requireUser(), TgUser, verifyInitData() (+29 more)

### Community 6 - "Catalog and Order Routing"
Cohesion: 0.09
Nodes (40): check(), log(), runRoute(), sent, Sim, telegram, TODAY, catalogRouter() (+32 more)

### Community 7 - "Frontend Web Dependencies"
Cohesion: 0.08
Nodes (24): react, react-dom, @types/react, @types/react-dom, vite, @vitejs/plugin-react, dependencies, react (+16 more)

### Community 8 - "Admin Dashboard API"
Cohesion: 0.15
Nodes (19): Props, Dashboard(), Props, Props, Customer, CustomerSummary, Dashboard, LoyaltyStatus (+11 more)

### Community 9 - "Backend Dependencies"
Cohesion: 0.05
Nodes (43): better-sqlite3, dotenv, express, dependencies, better-sqlite3, dotenv, express, telegraf (+35 more)

### Community 10 - "Admin Bot Session Tests"
Cohesion: 0.08
Nodes (27): admin, ADMIN_ID, call(), check(), env, main(), stranger, today (+19 more)

### Community 11 - "Web TypeScript Configuration"
Cohesion: 0.09
Nodes (21): DOM, DOM.Iterable, vite.config.ts, compilerOptions, esModuleInterop, isolatedModules, jsx, lib (+13 more)

### Community 12 - "Order Editing Interface"
Cohesion: 0.20
Nodes (10): MessageTemplates(), load(), run(), Props, Addable, OrderEdit(), save(), Props (+2 more)

### Community 13 - "Backend TypeScript Configuration"
Cohesion: 0.12
Nodes (16): compilerOptions, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution, noUncheckedIndexedAccess, outDir (+8 more)

### Community 14 - "Product Catalog Management"
Cohesion: 0.18
Nodes (13): Editing, useFeatures(), fileToResizedDataUrl(), ProductForm(), pickImage(), ProductValues, Props, ProductVariants() (+5 more)

### Community 15 - "Admin UI Frontend"
Cohesion: 0.14
Nodes (21): AdminApp(), Tab, CustomerDetail(), load(), patch(), Customers(), FeaturesContext, NON_TERMINAL (+13 more)

### Community 16 - "Route Delivery Actions"
Cohesion: 0.23
Nodes (14): Props, RouteOrderRow(), markDelivered(), reportProblem(), Routes(), createRoute(), finish(), guard() (+6 more)

### Community 17 - "Client App Entrypoint"
Cohesion: 0.27
Nodes (8): App(), State, ClientApp(), haptic(), initData, initTelegram(), TgWebApp, Window

### Community 18 - "Telegram Integration Server"
Cohesion: 0.17
Nodes (8): AUTH, env, flat, listener, menu, sent, server, telegram

### Community 19 - "Graphify Specification"
Cohesion: 0.08
Nodes (24): For /graphify add and --watch, For /graphify query, For the commit hook and native CLAUDE.md integration, For --update and --cluster-only, /graphify, Honesty Rules, Interpreter guard for subcommands, Part A - Structural extraction for code files (+16 more)

### Community 20 - "Driver and Route UI"
Cohesion: 0.26
Nodes (14): api, Drivers(), add(), run(), Props, DriverSelect(), Props, Props (+6 more)

### Community 21 - "Project Documentation"
Cohesion: 0.33
Nodes (10): Journal d'avancement, Document de cadrage, Chantier rendu (Mini App + expérience bot), Architecture Cœur + Modules, Cœur commun + modules, Mise en production (Oracle Cloud), Feuille de route évolutions & refactoring, Mini App Client & Panier Partagé (+2 more)

### Community 22 - "Catalog Mutation Operations"
Cohesion: 0.52
Nodes (7): Catalog(), addCategory(), guard(), removeCategory(), removeProduct(), saveProduct(), toggleAvailable()

### Community 23 - "Client Preview Integration"
Cohesion: 0.40
Nodes (3): env, ID, index

### Community 25 - "Bot State and Callbacks"
Cohesion: 0.12
Nodes (19): CALLBACK_PATTERN, CB, parseCallback(), ParsedCallback, BotContext, CheckoutState, QuantityState, userId() (+11 more)

### Community 26 - "Checkout Flow Steps"
Cohesion: 0.16
Nodes (23): Slot, askAddress(), collectAddress, collectNote, collectPhone, collectSlot, confirmStep, FLOW (+15 more)

### Community 28 - "Bot UI Views and Keyboards"
Cohesion: 0.21
Nodes (18): getMenu(), imagePath(), AnyView, categoriesView(), categoryView(), chunk(), contactView(), esc() (+10 more)

### Community 29 - "Support Scenes and Config"
Cohesion: 0.16
Nodes (9): config, SUPPORT_REPLY_SCENE_ID, SUPPORT_SCENE_ID, supportReplyScene, supportScene, ClientIdentity, relayAdminReply(), relayClientMessage() (+1 more)

### Community 30 - "Graphify Export Formats"
Cohesion: 0.22
Nodes (8): graphify reference: extra exports and benchmark, Step 6b - Wiki (only if --wiki flag), Step 7 - Neo4j export (only if --neo4j or --neo4j-push flag), Step 7a - FalkorDB export (only if --falkordb or --falkordb-push flag), Step 7b - SVG export (only if --svg flag), Step 7c - GraphML export (only if --graphml flag), Step 7d - MCP server (only if --mcp flag), Step 8 - Token reduction benchmark (only if total_words > 5000)

### Community 31 - "Graphify Query Reference"
Cohesion: 0.33
Nodes (5): For /graphify explain, For /graphify path, graphify reference: query, path, explain, Step 0 — Constrained query expansion (REQUIRED before traversal), Step 1 — Traversal

### Community 32 - "Graphify Watch Mode"
Cohesion: 0.50
Nodes (3): For /graphify add, For --watch, graphify reference: add a URL and watch a folder

### Community 33 - "Graphify Git Integration"
Cohesion: 0.50
Nodes (3): For git commit hook, For native CLAUDE.md integration, graphify reference: commit hook and native CLAUDE.md integration

### Community 34 - "Graphify Incremental Updates"
Cohesion: 0.50
Nodes (3): For --cluster-only, For --update (incremental re-extraction), graphify reference: incremental update and cluster-only

## Knowledge Gaps
- **250 isolated node(s):** `CartRow`, `CreateClientOrderInput`, `CreateClientOrderResult`, `RouteStatus`, `TemplateRow` (+245 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 298 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `userId()` connect `Bot State and Callbacks` to `Order Management API`, `Checkout Flow Steps`, `Support Scenes and Config`, `Admin UI Frontend`?**
  _High betweenness centrality (0.187) - this node is a cross-community bridge._
- **Why does `patch()` connect `Admin UI Frontend` to `Bot State and Callbacks`, `Driver and Route UI`?**
  _High betweenness centrality (0.160) - this node is a cross-community bridge._
- **Why does `alertDialog()` connect `Driver and Route UI` to `Client Shop Frontend`, `Admin Dashboard API`, `Order Editing Interface`, `Product Catalog Management`, `Admin UI Frontend`, `Route Delivery Actions`, `Client App Entrypoint`, `Catalog Mutation Operations`?**
  _High betweenness centrality (0.154) - this node is a cross-community bridge._
- **Are the 8 inferred relationships involving `requireAdmin()` (e.g. with `catalogRouter()` and `customersRouter()`) actually correct?**
  _`requireAdmin()` has 8 INFERRED edges - model-reasoned connections that need verification._
- **What connects `CartRow`, `CreateClientOrderInput`, `CreateClientOrderResult` to the rest of the system?**
  _250 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Driver Route Management` be split into smaller, more focused modules?**
  _Cohesion score 0.1321353065539112 - nodes in this community are weakly interconnected._
- **Should `Order Management API` be split into smaller, more focused modules?**
  _Cohesion score 0.0640503517215846 - nodes in this community are weakly interconnected._