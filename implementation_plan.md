# Voice Command Coverage Pass — Implementation Plan

## Scope

Extend the existing voice system across 4 files to provide complete, reliable voice-command coverage for every important button and feature visible in VoxBill. No full rewrite — only surgical additions, trigger tightening, and cleanup.

### Files Modified

| File | Role | Changes |
|------|------|---------|
| [voice_script.js](file:///d:/VoxBill/frontend/public/js/voice_script.js) | Waiter voice flow | Tighten triggers, add missing commands |
| [shared.js](file:///d:/VoxBill/frontend/public/js/shared.js) | Manager global voice ([initManagerVoice](file:///d:/VoxBill/frontend/public/js/shared.js#695-3106)) | Wake word cleanup, tighten nav/status triggers, add settings/billing/search/staff commands |
| [script.js](file:///d:/VoxBill/frontend/public/js/script.js) | Legacy duplicate parser | Disable [detectVoiceCommand()](file:///d:/VoxBill/frontend/public/js/script.js#445-490) to prevent double-processing |
| [voice.html](file:///d:/VoxBill/frontend/public/pages/voice.html) | Waiter voice page UI | Update subtitle help text |

### Codebase API Audit Results

The following APIs are **confirmed available** in [api.js](file:///d:/VoxBill/frontend/public/js/api.js) and backend routes:

| API Method | Frontend Function | Backend Route | Notes |
|------------|------------------|---------------|-------|
| Settle order | `VoxAPI.settleOrder(id, data)` | `PATCH /orders/:id/pay` | ✅ Works |
| Update order | `VoxAPI.updateOrder(id, data)` | `PATCH /orders/:id` | Supports `status`, `waiterName`, `discountAmt`, `gst`, `total`, `notes`, `customerName` |
| Get orders | `VoxAPI.getOrders(range)` | `GET /orders?range=today\|7` | Supports `table` and `status` query params |
| Get tables status | `VoxAPI.getTablesStatus()` | `GET /orders/tables/status` | Returns tables 1–20 |
| Get analytics | `VoxAPI.getAnalytics(days)` | `GET /analytics?days=N` | ✅ Works |
| Get staff | `VoxAPI.getStaff()` | `GET /staff` | Manager only |
| Create staff | `VoxAPI.createStaff(data)` | `POST /staff` | Requires `name`, `username`, `password` |
| Delete staff | `VoxAPI.deleteStaff(id)` | `DELETE /staff/:id` | Manager only |
| Add menu item | `VoxAPI.addMenuItem(item)` | `POST /menu` | Requires `name`, `category`, `price` |
| Update menu item | `VoxAPI.updateMenuItem(id, data)` | `PUT /menu/:id` | Supports `price`, `disabled`, `name`, `category` |
| Delete menu item | `VoxAPI.deleteMenuItem(id)` | `DELETE /menu/:id` | Manager only |
| Clear all orders | `VoxAPI.clearAllOrders()` | `DELETE /orders/all` | Manager only |
| Clear all menu | `VoxAPI.clearAllMenu()` | `DELETE /menu/all` | Manager only |
| Save settings | `VoxAPI.saveSettings(obj)` | `POST /settings` | ✅ Works |
| Print invoice | `window.printInvoice(order, settings)` | Frontend-only ([invoice.js](file:///d:/VoxBill/frontend/public/js/invoice.js)) | Requires `order` object + `settings` |
| WhatsApp bill | `window.generateWhatsAppMessage(order, settings)` | Frontend-only ([invoice.js](file:///d:/VoxBill/frontend/public/js/invoice.js)) | Requires `order` object + `settings` |
| CSV export | [exportOrdersToCSV()](file:///d:/VoxBill/frontend/public/pages/orders.html#614-661) | Frontend-only ([orders.html](file:///d:/VoxBill/frontend/public/pages/orders.html)) | Page-local function |

> [!IMPORTANT]
> **Order schema enum** is `['open', 'ordering', 'ready_for_billing', 'paid']` — no `cancelled`. The `PATCH /orders/:id` route sets `status` freely, so cancellation works at runtime but isn't in the Mongoose enum. This means cancelled orders may cause validation warnings in strict mode. For now, we treat this as "works but fragile" and use it as-is.

> [!WARNING]
> **[speak()](file:///d:/VoxBill/frontend/public/js/voice_script.js#59-79) scope**: [voice_script.js](file:///d:/VoxBill/frontend/public/js/voice_script.js) has its own [speak()](file:///d:/VoxBill/frontend/public/js/voice_script.js#59-79) inside a closure. [shared.js](file:///d:/VoxBill/frontend/public/js/shared.js) has a separate [speak()](file:///d:/VoxBill/frontend/public/js/voice_script.js#59-79) inside [initManagerVoice()](file:///d:/VoxBill/frontend/public/js/shared.js#695-3106). These are **independent** — neither file can call the other's [speak()](file:///d:/VoxBill/frontend/public/js/voice_script.js#59-79). No refactoring needed since each voice system uses its own copy.

---

## Phase 1: Frontend-Safe Changes (No Backend Work)

### 1.1 Wake Word Cleanup ([shared.js](file:///d:/VoxBill/frontend/public/js/shared.js))

**In `wakeRecognition.onresult` (line ~865) and `wakeWords` strip array (line ~1020):**

Keep only:
```
hey vb, ok vb, vb (word-boundary match), hey voxbill, ok voxbill, voxbill, assistant
```

Remove:
```
suno
```

**Why keep `assistant`**: User explicitly listed it as a primary wake word.

---

### 1.2 Stop Command Cleanup ([shared.js](file:///d:/VoxBill/frontend/public/js/shared.js))

**In [handleCommand](file:///d:/VoxBill/frontend/public/js/shared.js#1125-3105) stop block (line ~1244) and `wakeRecognition.onresult` stop block (line ~849):**

Keep: [stop](file:///d:/VoxBill/frontend/public/js/shared.js#830-837), `ruko`, `bas karo`, `chup`, `quiet`, `silence`, `band karo`

Remove: lone `bas` (too broad — triggers on normal Hindi speech like "bas ek aur")

---

### 1.3 Navigation Trigger Tightening ([shared.js](file:///d:/VoxBill/frontend/public/js/shared.js))

| Page | Keep | Remove |
|------|------|--------|
| Dashboard | `dashboard`, `open dashboard`, `home page`, `back to home`, `go to dashboard`, `main page` | `overview`, `wapas jao`, `ghar jao` |
| Analytics | `open analytics`, `analytics page`, `go to analytics`, `business report` | `report`, `reports`, `graph`, `chart`, `statistics`, `stats`, `performance`, `trend` |
| Settings | `open settings`, `settings page`, `go to settings` | `setting`, `configure`, `configuration`, `setup` |
| Staff | `open staff`, `staff page`, `go to staff`, `staff management` | `employees`, `team` |
| Orders | `orders page`, `open orders`, `go to orders`, `go to billing`, `open billing` | `billing page` (keep) |
| Menu | `menu page`, `open menu`, `go to menu`, `food menu`, `menu management` | (none to remove) |
| Tables | `tables page`, `open tables`, `go to tables`, `table status`, `floor` | (none to remove) |

---

### 1.4 Table Status Trigger Tightening ([shared.js](file:///d:/VoxBill/frontend/public/js/shared.js))

| Query | Keep | Remove |
|-------|------|--------|
| Available | `available tables`, `free tables`, `empty tables`, `khali tables`, `vacant tables` | plain `available`, `free`, `empty`, `khali`, `vacant`, `unoccupied`, `open table` (conflicts with nav) |
| Ready billing | `ready for billing`, `ready to bill`, `bill ready`, `billing ready`, `waiting for bill`, `need bill` | plain `ready`, `tayyar`, `table ready` |
| Pending | `pending tables`, `pending orders`, `still ordering`, `in progress orders` | plain `pending`, `ordering`, `baaki`, `abhi tak`, `not ready`, `open orders` (conflicts with nav) |
| Occupied | `occupied tables`, `booked tables`, `busy tables` | plain `booked`, `occupied`, `busy`, `active`, `engaged`, `taken`, `running`, `chal rahi`, `chal raha` |
| All tables | `all tables`, `kitni tables`, `how many tables` | (keep as part of occupied block) |

---

### 1.5 Waiter Voice Trigger Tightening ([voice_script.js](file:///d:/VoxBill/frontend/public/js/voice_script.js))

**Remove from remove/delete block (line ~496):**
- `cancel`, `band karo`, `mat lana`

**Remove from total block (line ~719):**
- `total` (standalone), `amount` (standalone), `how much`, `kitna hai`

Keep: `total amount`, `total kitna`, `kitna hua`, `bill kitna`, `total bolo`

**Remove from send-to-manager block (line ~651):**
- `ho gaya`, `order done`, `submit order`, `confirm order`, `order complete`

Keep: `send order`, `order send`, `manager ko bhejo`, `send to manager`, `order ready`, `billing ke liye bhejo`, `ready for billing`, `bill ready`, `manager ke paas bhejo`

---

### 1.6 New Waiter Commands ([voice_script.js](file:///d:/VoxBill/frontend/public/js/voice_script.js))

Add **before** the AI fallback section (line ~819):

#### A. Set table number
```
Patterns: "set table 5", "table number 5", "table 5"
Regex: /^(?:set\s+)?table\s*(?:number\s*)?(\d+)$/i
Action: Set formTable.value, speak confirmation
```

#### B. Customer name shorthand
```
Patterns: "customer name Rahul", "customer Rahul"
Regex: /^customer\s+(?:name\s+)?(.+)/i
Action: Set customerName, update nameEl
```
(Existing `setCustMatch` regex requires `set/change` prefix or `to/is` — add this simpler pattern)

#### C. Set discount on voice page
```
Patterns: "set discount 10", "apply 10 percent discount", "discount 10"
Regex: /(?:set\s+discount|apply\s+\d+\s*(?:percent)?\s*discount|discount)\s*(\d+)/i
Action: Set formDiscount.value if it exists, re-render, speak confirmation
Guard: Only if formDiscount element exists on page
```

#### D. Make / set quantity alias
```
Patterns: "make paneer 3", "set butter naan quantity to 4"
Regex: /(?:make|set)\s+(.+?)\s+(?:quantity\s+(?:to\s+)?)?(\d+)/i
Action: Find item in orderItems, update qty, re-render
```

#### E. Print bill on voice page
```
Patterns: "print bill", "print invoice"
Action: If order exists, use window.print() or scroll to invoice section
Guard: If no items, speak "No items to print"
```

#### F. WhatsApp bill on voice page
```
Patterns: "share bill on whatsapp", "whatsapp bill", "send bill to whatsapp"
Action: Build WhatsApp message from current orderItems + currentTotals, prompt for phone
Guard: If no items, speak "No items to share"
```

#### G. Show menu items
```
Patterns: "show menu items", "menu items", "what items are in menu"
Action: Read menu categories and count, speak summary
```
(Partially exists — extend trigger list)

---

### 1.7 New Manager Commands ([shared.js](file:///d:/VoxBill/frontend/public/js/shared.js) [handleCommand](file:///d:/VoxBill/frontend/public/js/shared.js#1125-3105))

#### A. Settle / close bill aliases
```
Patterns: "settle table 5", "close table 5 bill"
→ Route to existing markPaidMatch logic
```

#### B. View invoice aliases
```
Patterns: "show table 5 invoice", "view table 5 invoice", "view bill of table 5"
→ Route to existing openBillMatch logic
```

#### C. Download PDF
```
Patterns: "download invoice pdf", "save bill as pdf"
Action: If on orders page with open bill, call window.printInvoice() (print dialog allows save as PDF)
       If no bill open, speak "Open a table bill first"
```

#### D. Show UPI QR
```
Patterns: "show payment qr", "show upi qr", "generate qr for table 5"
Action: If on orders page with open bill, check for QR element and scroll to it
       If UPI not configured, speak "UPI payment ID is not configured in settings"
```

#### E. Orders page filters
```
Patterns: "show open orders", "show paid orders", "show paid history", "today orders", "all orders"
Action: If on orders page, click appropriate tab-btn filter
       If not on orders page, navigate to orders.html with query params
```

#### F. Export CSV
```
Patterns: "export orders csv", "download order report"
Action: If on orders page, call window.exportOrdersToCSV() if it exists
       If not on orders page, speak "Go to orders page first to export"
```

#### G. Settings page actions
```
- "save settings" / "save all settings"
  → If on settings page, click #saveAllBtn
  → Else speak "Go to settings page first"

- "open restaurant settings" / "open billing settings" / "open staff settings" / "open data settings"
  → If on settings page, call switchTab('restaurant'|'billing'|'staff'|'danger')
  → Else navigate to settings.html

- "use modern invoice" / "set invoice template to classic" / "select premium template" / "use colorful template"
  → If on settings page, click the matching template pill button
  → Else speak "Go to settings page first"

- "generate new pin" / "create random pin"
  → If on settings page, set #sPin value to random 6-digit, speak the PIN
  → Else speak "Go to settings page first"
```

#### H. Destructive settings actions (with confirmation)
```
- "clear all orders" / "delete order history"
  → Speak "Are you sure? Say yes to confirm or anything else to cancel"
  → Set a pending confirmation flag
  → On next command, if "yes"/"haan"/"confirm", call VoxAPI.clearAllOrders()
  → Otherwise cancel

- "reset menu" / "reset menu to default"
  → Same confirmation flow → call VoxAPI.clearAllMenu()
```

#### I. Global search
```
Patterns: "search order Rahul", "search table 5", "find customer Amit"
Action: If VB.initGlobalSearch exists, programmatically open search and set query
       Fallback: Use existing customer-order lookup logic for name matches
```

#### J. Notification cleanup
Remove `notification band karo` from clear triggers (too broad).

#### K. Logout cleanup
Remove `exit`, `bahar jao` from logout triggers.

---

### 1.8 Intro Commands (Both files)

**Already implemented** in both [voice_script.js](file:///d:/VoxBill/frontend/public/js/voice_script.js) (line ~342) and [shared.js](file:///d:/VoxBill/frontend/public/js/shared.js) (line ~1130).

Additions needed:
- Add `what is your work` trigger → same response as `what do you do`
- Add `what can you do for my restaurant` trigger → same response as `how can you help`

Both files already speak the response aloud AND show it in visible feedback. ✅

---

### 1.9 Help Text Update ([shared.js](file:///d:/VoxBill/frontend/public/js/shared.js))

Update the help command response (line ~3081) to reflect current real commands:
```
"You can say: open orders, available tables, ready for billing, today summary,
table 5 order, set GST to 5, apply 10 percent discount, who is free,
best selling item, print bill table 3, save settings, export orders csv,
search order Rahul, settle table 5, or say help for more."
```

---

### 1.10 Legacy Cleanup ([script.js](file:///d:/VoxBill/frontend/public/js/script.js))

Disable [detectVoiceCommand()](file:///d:/VoxBill/frontend/public/js/script.js#445-490) at line 450 by making it return `false` immediately:
```javascript
function detectVoiceCommand(text) {
    return false; // Disabled — voice commands handled by voice_script.js
}
```

This prevents double-handling of WhatsApp/clear/bill commands while keeping the rest of [script.js](file:///d:/VoxBill/frontend/public/js/script.js) functional (manual add, render, template selection, form listeners).

---

### 1.11 Voice Page UX ([voice.html](file:///d:/VoxBill/frontend/public/pages/voice.html))

Update subtitle text (line 31–32) from:
```
Speak clearly to add items. You can also say "Send to manager" or "Clear order".
```
To:
```
Speak to add items. Try: "2 butter naan", "remove paneer", "total amount", "send to manager", "clear order", or "help" for all commands.
```

---

## Phase 2: Backend-Supported Changes (APIs Already Exist)

These commands call existing backend APIs. No backend code changes needed, but they depend on the API being reachable.

### 2.1 Staff CRUD via Voice ([shared.js](file:///d:/VoxBill/frontend/public/js/shared.js))

> [!WARNING]
> `VoxAPI.createStaff()` requires `name`, `username`, and `password`. Voice can only provide the name. Username and password must be auto-generated or this must fail gracefully.

**Add waiter by voice:**
```
Pattern: "add waiter Rahul"
Action: Auto-generate username (lowercase name), random password
        Call VoxAPI.createStaff({ name, username, password })
        Speak: "Waiter Rahul added with username rahul and password 1234. Please change the password in staff settings."
```

**Delete waiter by voice:**
```
Pattern: "delete waiter Rahul", "remove staff Rahul"
Action: Call VoxAPI.getStaff(), find by name, call VoxAPI.deleteStaff(id)
        Speak confirmation or "Not found"
```

### 2.2 Menu Delete via Voice ([shared.js](file:///d:/VoxBill/frontend/public/js/shared.js))

Already have add and update. Add delete:
```
Pattern: "delete menu item coke", "remove menu item coke"
Action: Find item in VB.getMenu() by name, call VoxAPI.deleteMenuItem(id)
        Speak confirmation
```

### 2.3 Cancel Order via Voice ([shared.js](file:///d:/VoxBill/frontend/public/js/shared.js))

**Already implemented** at line ~1625. Keep as-is.

> [!NOTE]
> `cancelled` is not in the Order schema enum (`['open', 'ordering', 'ready_for_billing', 'paid']`). The PATCH route sets it anyway because Mongoose doesn't validate on `.save()` for string paths without strict enum enforcement. This works but is technically fragile. No backend change needed for now.

### 2.4 Remote Table Discount/GST via Voice ([shared.js](file:///d:/VoxBill/frontend/public/js/shared.js))

**Already implemented** at lines ~1686 and ~1720. Keep as-is.

### 2.5 Assign Waiter to Table via Voice ([shared.js](file:///d:/VoxBill/frontend/public/js/shared.js))

**Already implemented** at line ~1654. Keep as-is.

---

## UI / Help Text Updates

| File | Location | Change |
|------|----------|--------|
| [voice.html](file:///d:/VoxBill/frontend/public/pages/voice.html) line 31–32 | Section subtitle | Update to show real command examples |
| [shared.js](file:///d:/VoxBill/frontend/public/js/shared.js) help block | Manager help response | Update to list current real commands |
| [voice_script.js](file:///d:/VoxBill/frontend/public/js/voice_script.js) help block (if exists) | Waiter help response | Add if missing |

---

## Verification Plan

### Manual Testing Checklist

| Category | Test Command | Expected Result |
|----------|-------------|-----------------|
| **Waiter: Add** | "2 butter naan" | Items added with qty 2 |
| **Waiter: Remove** | "remove paneer" | Item removed, spoken confirmation |
| **Waiter: Update** | "change butter naan to garlic naan" | Item replaced |
| **Waiter: Qty** | "make paneer 3" | Quantity updated to 3 |
| **Waiter: Repeat** | "repeat" | Last item repeated with same qty |
| **Waiter: Undo** | "undo" | Previous state restored |
| **Waiter: Table** | "set table 5" | Table field updated |
| **Waiter: Customer** | "customer name Rahul" | Name field updated |
| **Waiter: Total** | "total amount" | Subtotal + GST spoken |
| **Waiter: Send** | "send to manager" | Order saved, redirected |
| **Waiter: Clear** | "clear order" | All items removed |
| **Waiter: Print** | "print bill" | Print dialog or scroll to invoice |
| **Waiter: WhatsApp** | "whatsapp bill" | Phone prompt + WhatsApp opened |
| **Manager: Wake** | "hey vb" | Activates command mode |
| **Manager: Nav** | "open orders" | Navigates to orders page |
| **Manager: Table status** | "available tables" | Lists free tables |
| **Manager: Table detail** | "table 5 order" | Reads order items |
| **Manager: GST on** | "gst on" | GST enabled |
| **Manager: GST set** | "set gst to 12" | GST updated to 12% |
| **Manager: GST check** | "what is gst" | Current GST spoken |
| **Manager: Discount** | "apply 10 percent discount" | Discount applied to open bill |
| **Manager: Mark paid** | "settle table 5" | Table 5 marked paid |
| **Manager: Print** | "print bill table 5" | Bill opened/printed |
| **Manager: Settings** | "save settings" | Settings saved on settings page |
| **Manager: Template** | "use modern invoice" | Template pill activated |
| **Manager: Clear orders** | "clear all orders" | Confirmation asked, then cleared |
| **Manager: CSV** | "export orders csv" | CSV downloaded on orders page |
| **Manager: Intro** | "who are you" | "My name is VoxBill AI." spoken + shown |
| **Manager: Help** | "help" | Command list spoken |
| **Manager: Time** | "what time" | Current time spoken |
| **Manager: Logout** | "logout" | Logged out and redirected |
| **Graceful fail** | "add waiter Rahul" (offline) | Error message spoken, no crash |
| **No false trigger** | "bas" (standalone) | Should NOT trigger stop |
| **No false trigger** | "report" (standalone) | Should NOT navigate to analytics |

---

## Deliverables

After implementation, provide:
1. Files modified with line-level summary
2. Commands added (new patterns)
3. Commands removed (overly broad triggers)
4. Commands tightened (narrowed patterns)
5. Features that depend on existing backend APIs
6. Legacy duplicate logic disabled
7. Any commands that were requested but skipped with reason
