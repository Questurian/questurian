# Dining Collection - Visibility & State Matrix

## Quick Reference: What Can Users See?

### By Authentication Status

```
┌─────────────────────────────────────────────────────────────────┐
│                    PUBLIC (No Authentication)                    │
├─────────────────────────────────────────────────────────────────┤
│ Visible:    Only published dining items (status='published')     │
│ Cannot see: Draft items (status='draft')                         │
│ Cannot do:  Create, edit, delete                                 │
│ API Filter: { status: { equals: 'published' } }                  │
│ Example:    GET /api/dining → only items with status='published' │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│              AUTHENTICATED (role='user')                         │
├─────────────────────────────────────────────────────────────────┤
│ Same as public (not explicitly handled, defaults to public)      │
│ Note: Standard users can read but not create                     │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│              EDITOR (role='editor')                              │
├─────────────────────────────────────────────────────────────────┤
│ Visible:    All items (published + draft)                        │
│ Can do:     Create new items                                     │
│ Cannot do:  Edit existing items, delete                          │
│ Limitation: Editors lock themselves out of editing               │
│ Workaround: Ask admin to edit, or delete + recreate              │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│              ADMIN (role='admin')                                │
├─────────────────────────────────────────────────────────────────┤
│ Visible:    All items (published + draft)                        │
│ Can do:     Create, read, update, delete (full CRUD)             │
│ Access:     All collection features                              │
│ Responsibility: Publishing, editing, deleting content            │
└─────────────────────────────────────────────────────────────────┘
```

---

## Access Control Rules (Payload Config)

### Read Access
```typescript
read: ({ req }) => {
  // Public users (no authentication)
  if (!req.user) return { status: { equals: 'published' } }

  // All authenticated users (editors, admins, regular users)
  return true
}
```

**Behavior**:
- Public users: See **only published items**
- Any logged-in user: See **all items** (regardless of role)

**Note**: This means `role='user'` also sees draft items (if they log in). This might be unintended. Consider if regular users should see unpublished content.

### Create Access
```typescript
create: ({ req }) => req.user?.role === 'editor' || req.user?.role === 'admin'
```

**Behavior**:
- `role='user'`: ❌ Cannot create
- `role='editor'`: ✅ Can create
- `role='admin'`: ✅ Can create

### Update Access
```typescript
update: ({ req }) => req.user?.role === 'admin'
```

**Behavior**:
- `role='editor'`: ❌ Cannot update (even own items)
- `role='admin'`: ✅ Can update (all items)

**⚠️ Problem**: Editors can create but cannot edit their own work. This is a UX trap.

### Delete Access
```typescript
delete: ({ req }) => req.user?.role === 'admin'
```

**Behavior**:
- `role='editor'`: ❌ Cannot delete
- `role='admin'`: ✅ Can delete

---

## Complete Visibility Matrix

### Table: Who Can See What?

| Scenario | Public | User | Editor | Admin |
|----------|--------|------|--------|-------|
| Published item | ✅ Read | ✅ Read | ✅ Read | ✅ Read |
| Draft item | ❌ Hidden | ✅ Read | ✅ Read | ✅ Read |
| Create new | ❌ No | ❌ No | ✅ Yes | ✅ Yes |
| Edit own draft | ❌ No | ❌ No | ❌ No (BUG!) | ✅ Yes |
| Edit own published | ❌ No | ❌ No | ❌ No (BUG!) | ✅ Yes |
| Edit other's draft | ❌ No | ❌ No | ❌ No | ✅ Yes |
| Delete any | ❌ No | ❌ No | ❌ No | ✅ Yes |

**Legend**:
- ✅ Allowed
- ❌ Not allowed
- 🐛 Bug/issue

---

## Access Flow Diagrams

### Scenario 1: Editor Creates and Tries to Edit

```
Timeline T0→T1: Editor opens admin, clicks "Create New Dining"

                  ┌─────────────────────────────┐
                  │ Dining Collection Form      │
                  │ ✅ Create access check: OK  │
                  │ (role='editor')             │
                  └──────────────┬──────────────┘
                                 │
                    ┌────────────┴────────────┐
                    │ Form opens, editor fills│
                    │ in fields               │
                    └────────────┬────────────┘
                                 │
                    ┌────────────┴────────────┐
                    │ Editor saves item       │
                    │ status='draft'          │
                    └────────────┬────────────┘
                                 │
                    ┌────────────┴────────────────────┐
                    │ Database saves                 │
                    │ Dining item created, ID=123    │
                    └────────────┬────────────────────┘
                                 │
     Timeline T2→T3: Next day, editor wants to edit

                    ┌────────────┴────────────────┐
                    │ Editor searches for item    │
                    │ ✅ Read access check: OK    │
                    │ (role='editor')             │
                    │ See all items including ID  │
                    └────────────┬─────────────────┘
                                 │
                    ┌────────────┴────────────────┐
                    │ Editor clicks on item #123  │
                    │ Edit form loads             │
                    └────────────┬─────────────────┘
                                 │
                    ┌────────────┴────────────────┐
                    │ Editor clicks "Save"        │
                    │ ❌ Update access check: FAIL│
                    │ (role='editor' ≠ 'admin')   │
                    └────────────┬─────────────────┘
                                 │
                    ┌────────────┴────────────────────┐
                    │ Error: "Permission Denied"      │
                    │ Editor's changes LOST          │
                    │ Item NOT updated               │
                    └────────────────────────────────┘
```

**Pain Point**: Editor is locked out of their own content after creation.

**Workarounds**:
1. Ask admin to edit for them
2. Delete item + recreate (but delete might fail too)
3. Work in draft, ask admin to publish when ready

---

### Scenario 2: Admin Publishes Editor's Draft

```
Timeline: Admin workflow to publish

                    ┌──────────────────────┐
                    │ Admin opens dining   │
                    │ ✅ Read all items    │
                    │ (role='admin')       │
                    └──────────┬───────────┘
                               │
                    ┌──────────┴───────────┐
                    │ Sees editor's draft  │
                    │ "Paris Bistro"       │
                    │ status='draft'       │
                    └──────────┬───────────┘
                               │
                    ┌──────────┴───────────────┐
                    │ Admin opens the item     │
                    │ ✅ Read OK               │
                    │ ✅ Update OK             │
                    │ (role='admin')           │
                    └──────────┬───────────────┘
                               │
                    ┌──────────┴──────────────────┐
                    │ Admin changes status to:    │
                    │ status='published'          │
                    └──────────┬──────────────────┘
                               │
                    ┌──────────┴──────────────────┐
                    │ Saves changes              │
                    │ ✅ Update access OK        │
                    │ (role='admin')             │
                    └──────────┬──────────────────┘
                               │
                    ┌──────────┴──────────────────┐
                    │ beforeChange hook runs      │
                    │ Slug already exists → skip  │
                    │ Document saved              │
                    └──────────┬──────────────────┘
                               │
                    ┌──────────┴──────────────────┐
                    │ Item now visible to public  │
                    │ GET /api/dining filters:    │
                    │ { status: 'published' }     │
                    │ ✅ Shows "Paris Bistro"     │
                    └──────────────────────────────┘
```

**Timeline**:
- T0: Editor saves draft
- T0+30min: Admin publishes
- T0+30min+1s: Public can see item
- T0+30min+10s: Frontend caches invalidate, users see it

---

## Publishing Workflow (Editor + Admin)

```
Step 1: Editor Creates Content
┌─────────────────────────┐
│ Dining Form             │
│ ├─ title: "Le Marais"   │
│ ├─ type: "restaurant"   │
│ ├─ location: France|... │
│ ├─ status: "draft"      │ ← Required field
│ └─ [Save]               │
└─────────────┬───────────┘
              │
         Saved as DRAFT

Step 2: Admin Reviews & Publishes
┌──────────────────────────┐
│ Admin opens item         │
│ ├─ status: "draft" ▼     │
│ └─ [Select "published"]  │
│    ├─ status: "published"│
│    └─ [Save]             │
└──────────────┬───────────┘
              │
         Status changed to PUBLISHED

Step 3: Public Can Access
┌──────────────────────────┐
│ GET /api/dining?limit=10 │
│ access.read checks:      │
│   if (!req.user)         │
│   return {status: pub}   │
│                          │
│ ✅ "Le Marais" returned  │
└──────────────────────────┘
```

---

## API Endpoint Behavior

### Public User
```bash
# No authentication
curl https://api.example.com/api/dining

# Response filters automatically:
# Only items where status='published'

Response:
{
  "docs": [
    { "id": 1, "title": "Le Marais", "status": "published" },
    { "id": 5, "title": "Cafe de Flore", "status": "published" }
  ],
  "totalDocs": 2,
  "limit": 10,
  "page": 1
}

# Draft items NOT returned:
# { "id": 2, "title": "Hidden Draft", "status": "draft" } ← Filtered out
```

### Editor User
```bash
# With editor token
curl https://api.example.com/api/dining \
  -H "Authorization: Bearer <editor_token>"

# Response includes drafts:
Response:
{
  "docs": [
    { "id": 1, "title": "Le Marais", "status": "published" },
    { "id": 2, "title": "Hidden Draft", "status": "draft" },
    { "id": 5, "title": "Cafe de Flore", "status": "published" }
  ],
  "totalDocs": 3,
  "limit": 10,
  "page": 1
}

# Can READ but CREATE/UPDATE/DELETE permissions still apply
```

### Admin User
```bash
# With admin token
curl https://api.example.com/api/dining \
  -H "Authorization: Bearer <admin_token>"

# Response includes everything:
# Same as editor + can see all details

# Can also UPDATE (unlike editor)
curl https://api.example.com/api/dining/2 \
  -X PATCH \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{"status":"published"}'

# ✅ Succeeds (admin has update permission)
```

---

## Location Field Visibility

The location field is **always visible** but behaves differently:

| User | Visibility | Can Select | Can Edit |
|------|-----------|-----------|----------|
| Public | ❌ See published item with location | ❌ No edit | ❌ Can't see form |
| Editor | ✅ See all items with location | ✅ When creating | ❌ Not when editing |
| Admin | ✅ See all items with location | ✅ Always | ✅ Yes |

### Location Field Details

```typescript
{
  name: 'location',
  type: 'text',
  required: true,  // ← Must set location when creating
  admin: {
    components: {
      Field: LocationPickerField  // Custom component
    }
  }
}
```

**Storage Format**: `"France|Paris|Marais"`

**LocationPickerField UX**:
1. Fetch all locations on mount (API call: `/api/locations?limit=1000`)
2. Show country dropdown (always)
3. Show city dropdown (when country selected)
4. Show neighborhood dropdown (when city selected AND neighborhoods exist)
5. Store selection in `location` field as pipe-delimited string

---

## Status Field Visibility & Behavior

### Default Value
```typescript
{
  name: 'status',
  type: 'select',
  defaultValue: 'draft',  // ← New items default to draft
  options: [
    { label: 'Draft', value: 'draft' },
    { label: 'Published', value: 'published' }
  ],
  admin: { position: 'sidebar' }
}
```

### Publishing Workflow
```
┌──────────────────────────────────────────────────┐
│ Item Creation                                    │
├──────────────────────────────────────────────────┤
│ [New Item]                                       │
│ Title: "Restaurant Name" ________________        │
│ Location: [Selector] France / Paris / ...  ▼     │
│ [Sidebar]                                        │
│ Status: Draft ▼                           ┐      │
│            ├─ Draft                       │ ← New items default to Draft
│            └─ Published                   │
│ [Save] [Cancel]                           ┘      │
└──────────────────────────────────────────────────┘
       │                                  │
       ├─ Editor saves with "Draft"        │
       │  ✅ Saved (hidden from public)     │
       │                                    │
       └─ Admin changes to "Published"      │
          ✅ Saved (visible to public)      │
```

### What Happens When Changed
```
Draft → Published
├─ Immediately visible to public via API
├─ No URL change (locationKey stays same)
├─ No rebuild needed (dynamic)
└─ Cache invalidation needed (frontend)

Published → Draft
├─ Immediately hidden from public
├─ Visible to editors/admins only
└─ Can still access via direct ID if leaked
```

---

## locationDisplay Field Issue

### Current Problem
The `locationDisplay` field is supposed to **sync with location in real-time**, but doesn't:

```typescript
{
  name: 'locationDisplay',
  type: 'text',
  admin: {
    readOnly: true,
    condition: (data) => !!data?.location,  // Show only if location set
  },
  defaultValue: (data) => data?.location,  // ← Runs once on load
}
```

### Timeline of locationDisplay Behavior

```
T0: Form opens with saved location "France|Paris"
    ✅ locationDisplay shows "France|Paris"

T1: User clicks country dropdown, changes to "Italy"
    ❌ locationDisplay still shows "France|Paris" (not updated)
    ✅ But location field has "Italy" (hidden from user)

T2: User clicks country dropdown again, selects "Germany"
    ❌ locationDisplay still shows "France|Paris" (still not updated)
    ✅ But location field has "Germany"

T3: User saves form
    ❌ locationDisplay shows old value in saved record
    ✅ But location field has correct new value

T4: Form reloads after save
    ✅ locationDisplay updates to match location (runs defaultValue again)
```

### Why This Happens
- `defaultValue` only runs on **form initialization**
- When location changes via LocationPickerField, only the `location` field updates
- `locationDisplay` field has no dependency watching `location`
- So they get out of sync

### The Blue Box is Workaround
LocationPickerField has its own display box:
```typescript
<div style={{ padding: '12px', backgroundColor: '#e3f2fd', ... }}>
  {value ? <strong>Current location: {value}</strong> : 'No location selected'}
</div>
```

This **always shows the current value**, but it's not the official `locationDisplay` field.

### Solution
Remove `locationDisplay` field entirely, OR make it a computed field that reads from `location`.

---

## Summary: Access Control at a Glance

```
┌─────────────────┬───────┬────────┬────────┬─────────┐
│ Action          │Public │ User   │Editor │ Admin   │
├─────────────────┼───────┼────────┼────────┼─────────┤
│ See Published   │ ✅    │ ✅     │ ✅    │ ✅      │
│ See Drafts      │ ❌    │ ✅     │ ✅    │ ✅      │
│ Create          │ ❌    │ ❌     │ ✅    │ ✅      │
│ Edit            │ ❌    │ ❌     │ ❌    │ ✅      │
│ Delete          │ ❌    │ ❌     │ ❌    │ ✅      │
│ Publish         │ N/A   │ N/A    │ N/A   │ ✅      │
└─────────────────┴───────┴────────┴────────┴─────────┘

Key Issues:
1. Editors can CREATE but not EDIT (they're locked out)
2. All authenticated users see drafts (might not be intended)
3. locationDisplay field doesn't sync in real-time
```

---

## Recommendations

### Access Control Changes
```typescript
// Current: Only admins can update
update: ({ req }) => req.user?.role === 'admin'

// Better: Editors can update their own items
update: ({ req, data, doc }) => {
  // Admin can update anything
  if (req.user?.role === 'admin') return true

  // Editors can only update if they created it (createdBy match)
  if (req.user?.role === 'editor' && doc?.createdBy?.toString() === req.user.id) {
    return true
  }

  return false
}
```

This requires:
1. Add `createdBy` field to Dining collection (reference to Users)
2. Update read access to NOT show all drafts to regular users
3. Document the new workflow

### Visibility Changes
```typescript
// Current: All authenticated users see all items
read: ({ req }) => {
  if (!req.user) return { status: { equals: 'published' } }
  return true  // ← Shows drafts to everyone
}

// Better: Only editors/admins see drafts
read: ({ req }) => {
  if (!req.user) return { status: { equals: 'published' } }

  // Regular users only see published
  if (req.user?.role === 'user') {
    return { status: { equals: 'published' } }
  }

  // Editors & admins see all
  return true
}
```

This prevents regular users from accessing unpublished content.

---

## Testing Access Control

```bash
# Test public access
curl https://api.example.com/api/dining
# Should only return published items

# Test editor access
curl https://api.example.com/api/dining \
  -H "Authorization: Bearer <editor_token>"
# Should return all items including drafts

# Test editor update (should fail)
curl https://api.example.com/api/dining/1 \
  -X PATCH \
  -H "Authorization: Bearer <editor_token>" \
  -H "Content-Type: application/json" \
  -d '{"status":"published"}'
# Expected: 403 Forbidden

# Test admin update (should succeed)
curl https://api.example.com/api/dining/1 \
  -X PATCH \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{"status":"published"}'
# Expected: 200 OK
```
