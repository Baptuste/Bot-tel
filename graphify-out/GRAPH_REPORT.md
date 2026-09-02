# Graph Report - Bot-tel  (2026-09-02)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 735 nodes · 1959 edges · 35 communities
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 27 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `64629fb8`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- server.ts
- ClientApp.tsx
- src/routes.ts
- scripts
- db.ts
- src/catalog.ts
- index.ts
- src/orders.ts
- referral.ts
- shop.ts
- web/src/types.ts
- web/package.json
- checkout.ts
- compilerOptions
- confirmDialog
- src/features.ts
- views.ts
- compilerOptions
- src/Catalog.tsx
- alertDialog
- scenes/support.ts
- orderFlow.ts
- src/api.ts
- OrderDetail.tsx
- client.mts
- journee.mts
- loyalty.ts
- admin.ts
- api/orders.ts
- telegram.ts
- reliability.ts
- Catalog
- client-preview.mts

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
10. `esc()` - 17 edges

## Surprising Connections (you probably didn't know these)
- `main()` --indirect_call--> `localDate()`  [INFERRED]
  scripts/smoke.mts → web/src/types.ts
- `main()` --calls--> `upsertCustomer()`  [EXTRACTED]
  scripts/smoke.mts → src/customers.ts
- `main()` --calls--> `createOrder()`  [EXTRACTED]
  scripts/smoke.mts → src/orders.ts
- `load()` --indirect_call--> `userId()`  [INFERRED]
  web/src/CustomerDetail.tsx → src/context.ts
- `patch()` --indirect_call--> `userId()`  [INFERRED]
  web/src/CustomerDetail.tsx → src/context.ts

## Import Cycles
- None detected.

## Communities (35 total, 0 thin omitted)

### Community 0 - "server.ts"
Cohesion: 0.10
Nodes (38): Express, isAdminUser(), readInitData(), Request, requireAdmin(), requireUser(), TgUser, verifyInitData() (+30 more)

### Community 1 - "ClientApp.tsx"
Cohesion: 0.13
Nodes (35): request(), shop, Cart(), Props, Catalog(), Props, Checkout(), Props (+27 more)

### Community 2 - "src/routes.ts"
Cohesion: 0.12
Nodes (44): parseCapacity(), parseDriverId(), routesRouter(), Driver, driverExists(), detachRouteOrders(), getOrdersByRoute(), moveOrderInRoute() (+36 more)

### Community 3 - "scripts"
Cohesion: 0.05
Nodes (41): better-sqlite3, dotenv, express, dependencies, better-sqlite3, dotenv, express, telegraf (+33 more)

### Community 4 - "db.ts"
Cohesion: 0.07
Nodes (27): now, admin, ADMIN_ID, call(), check(), env, main(), stranger (+19 more)

### Community 5 - "src/catalog.ts"
Cohesion: 0.15
Nodes (31): catalogRouter(), resolveImage(), Category, createCategory(), createProduct(), createVariant(), deleteCategory(), deleteProduct() (+23 more)

### Community 6 - "index.ts"
Cohesion: 0.10
Nodes (23): CALLBACK_PATTERN, CB, parseCallback(), ParsedCallback, seedCatalogIfEmpty(), BotContext, BotSession, CheckoutState (+15 more)

### Community 7 - "src/orders.ts"
Cohesion: 0.08
Nodes (27): assignRoute, clearRouteFromOrders, countByStatus, EDITABLE_IDS, getAssignableOrders(), getLastOrder(), getOrdersByStatus(), hydrate() (+19 more)

### Community 8 - "referral.ts"
Cohesion: 0.15
Nodes (21): customersRouter(), Customer, CustomerRow, CustomerSummary, getCustomer(), listCustomers(), q, toCustomer() (+13 more)

### Community 9 - "shop.ts"
Cohesion: 0.19
Nodes (24): cartDto(), clientConfig(), shopRouter(), addToCart(), cartCount(), CartRow, cartTotal(), clearCart() (+16 more)

### Community 10 - "web/src/types.ts"
Cohesion: 0.13
Nodes (22): Tab, Customers(), Dashboard(), Props, FeaturesContext, NON_TERMINAL, errorMessage(), Filter (+14 more)

### Community 11 - "web/package.json"
Cohesion: 0.08
Nodes (25): typescript, typescript, react, react-dom, @types/react, @types/react-dom, vite, @vitejs/plugin-react (+17 more)

### Community 12 - "checkout.ts"
Cohesion: 0.15
Nodes (23): Slot, askAddress(), CHECKOUT_SCENE_ID, checkoutScene, collectAddress, collectNote, collectPhone, collectSlot (+15 more)

### Community 13 - "compilerOptions"
Cohesion: 0.09
Nodes (21): DOM, DOM.Iterable, vite.config.ts, compilerOptions, esModuleInterop, isolatedModules, jsx, lib (+13 more)

### Community 14 - "confirmDialog"
Cohesion: 0.17
Nodes (21): CustomerDetail(), useFeatures(), useFlow(), OrderDetail(), apply(), onStatusClick(), send(), Props (+13 more)

### Community 15 - "src/features.ts"
Cohesion: 0.13
Nodes (14): sent, telegram, boutiqueDemo, ClientFeatures, DELIVERY_FLOW, OrderFlowConfig, OrderStage, PICKUP_FLOW (+6 more)

### Community 16 - "views.ts"
Cohesion: 0.23
Nodes (18): lineKey(), getMenu(), imagePath(), cartView(), categoriesView(), categoryView(), chunk(), contactView() (+10 more)

### Community 17 - "compilerOptions"
Cohesion: 0.12
Nodes (16): compilerOptions, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution, noUncheckedIndexedAccess, outDir (+8 more)

### Community 18 - "src/Catalog.tsx"
Cohesion: 0.18
Nodes (12): Editing, fileToResizedDataUrl(), ProductForm(), pickImage(), ProductValues, Props, ProductVariants(), run() (+4 more)

### Community 19 - "alertDialog"
Cohesion: 0.27
Nodes (13): Drivers(), add(), run(), Props, DriverSelect(), Props, Props, RouteTemplates() (+5 more)

### Community 20 - "scenes/support.ts"
Cohesion: 0.16
Nodes (9): config, SUPPORT_REPLY_SCENE_ID, SUPPORT_SCENE_ID, supportReplyScene, supportScene, ClientIdentity, relayAdminReply(), relayClientMessage() (+1 more)

### Community 21 - "orderFlow.ts"
Cohesion: 0.22
Nodes (15): alertAdmins(), awardLoyalty(), buildTransitions(), customerFlag(), escHtml(), loyaltyFlag(), notifyNewOrder(), renderOrderText() (+7 more)

### Community 22 - "src/api.ts"
Cohesion: 0.23
Nodes (11): api, Props, Props, Customer, CustomerSummary, LoyaltyStatus, MessageTemplate, ReferralInfo (+3 more)

### Community 23 - "OrderDetail.tsx"
Cohesion: 0.18
Nodes (11): MessageTemplates(), load(), run(), Props, Addable, OrderEdit(), save(), Props (+3 more)

### Community 24 - "client.mts"
Cohesion: 0.17
Nodes (8): AUTH, env, flat, listener, menu, sent, server, telegram

### Community 25 - "journee.mts"
Cohesion: 0.21
Nodes (8): check(), log(), runRoute(), sent, Sim, telegram, TODAY, ItemRef

### Community 26 - "loyalty.ts"
Cohesion: 0.27
Nodes (8): sent, telegram, awardForOrder(), buildStatements(), getPoints(), LoyaltyStatus, q(), redeemReward()

### Community 27 - "admin.ts"
Cohesion: 0.38
Nodes (10): isAdmin(), registerAdmin(), changeStatus(), orderKeyboard(), getOpenOrders(), getStatusCounts(), updateOrderStatus(), orderStages() (+2 more)

### Community 28 - "api/orders.ts"
Cohesion: 0.38
Nodes (10): ordersRouter(), toDto(), resolveMenuItems(), getReliability(), nextStatuses(), EDITABLE_STATUSES, getOrder(), getRecentOrders() (+2 more)

### Community 29 - "telegram.ts"
Cohesion: 0.29
Nodes (7): AdminApp(), App(), State, initData, initTelegram(), TgWebApp, Window

### Community 30 - "reliability.ts"
Cohesion: 0.25
Nodes (8): listReliability(), OPEN_IDS, openPlaceholders, q, Reliability, ReliabilitySummary, withRate(), openStatusIds()

### Community 31 - "Catalog"
Cohesion: 0.52
Nodes (7): Catalog(), addCategory(), guard(), removeCategory(), removeProduct(), saveProduct(), toggleAvailable()

### Community 32 - "client-preview.mts"
Cohesion: 0.40
Nodes (3): env, ID, index

## Knowledge Gaps
- **202 isolated node(s):** `Request`, `TgUser`, `DriverRow`, `Screen`, `Props` (+197 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 239 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `userId()` connect `index.ts` to `admin.ts`, `checkout.ts`, `scenes/support.ts`?**
  _High betweenness centrality (0.227) - this node is a cross-community bridge._
- **Why does `patch()` connect `index.ts` to `alertDialog`, `confirmDialog`?**
  _High betweenness centrality (0.194) - this node is a cross-community bridge._
- **Why does `alertDialog()` connect `alertDialog` to `ClientApp.tsx`, `index.ts`, `confirmDialog`, `src/Catalog.tsx`, `src/api.ts`, `OrderDetail.tsx`, `telegram.ts`, `Catalog`?**
  _High betweenness centrality (0.187) - this node is a cross-community bridge._
- **Are the 8 inferred relationships involving `requireAdmin()` (e.g. with `catalogRouter()` and `customersRouter()`) actually correct?**
  _`requireAdmin()` has 8 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Request`, `TgUser`, `DriverRow` to the rest of the system?**
  _202 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `server.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.10175763182238667 - nodes in this community are weakly interconnected._
- **Should `ClientApp.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.1267345050878816 - nodes in this community are weakly interconnected._