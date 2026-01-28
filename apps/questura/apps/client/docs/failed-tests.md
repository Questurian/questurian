# Failed Tests Documentation

## Overview
11 tests are failing in `src/features/Auth/hooks/__tests__/usePasswordReset.test.tsx`. These tests define the expected behavior for password reset functionality. **Do not modify the tests** - they document the contract for the password reset hooks implementation.

---

## usePasswordResetRequest Hook Tests

### Test 1: Should request password reset with valid email
**File:** `src/features/Auth/hooks/__tests__/usePasswordReset.test.tsx:37-58`

**What it tests:**
- The hook should call the API endpoint `/api/auth/forgot-password/request` with the user's email
- The mutation should return `isSuccess = true` after successful response
- The response should include:
  - `success: true`
  - `message: 'Password reset code sent to your email'`
  - `expiresIn: '15 minutes'` (time until code expires)

**Current failure:** Hook never reaches `isSuccess = true` state

---

### Test 2: Should handle error when reset request fails
**File:** `src/features/Auth/hooks/__tests__/usePasswordReset.test.tsx:60-74`

**What it tests:**
- When the API rejects with an error (e.g., "Email not found"), the mutation should:
  - Set `isError = true`
  - Capture the error message properly
  - Make `result.current.error?.message` equal to `'Email not found'`

**Current failure:** Getting `"Cannot read properties of undefined (reading 'success')"` instead of proper error message

---

### Test 3: Should handle server error response
**File:** `src/features/Auth/hooks/__tests__/usePasswordReset.test.tsx:76-93`

**What it tests:**
- When the server responds with `success: false`, the mutation should:
  - Treat it as an error state (`isError = true`)
  - Extract and use the `message` field as the error message
  - Return `'Server error: unable to send reset email'`

**Current failure:** Error message is undefined instead of the server's message

**Implementation note:** The hook needs to check the `success` field in the response and throw an error if `success: false`

---

### Test 4: Should provide expiration time in response
**File:** `src/features/Auth/hooks/__tests__/usePasswordReset.test.tsx:95-112`

**What it tests:**
- The response data should include and preserve the `expiresIn` field
- `result.current.data?.expiresIn` should equal `'30 minutes'` (or whatever the server returns)
- This allows the UI to show users how long they have to use the reset code

**Current failure:** Hook never reaches success state, so data is never populated

---

## usePasswordResetVerify Hook Tests

### Test 5: Should verify reset code with email and code
**File:** `src/features/Auth/hooks/__tests__/usePasswordReset.test.tsx:116-136`

**What it tests:**
- The hook should call the API endpoint `/api/auth/forgot-password/verify-code` with email and code
- The mutation should accept parameters: `{ email: string, code: string }`
- Should return `isSuccess = true` on successful verification
- Response should be: `{ success: true, message: 'Code verified successfully' }`

**Current failure:** Hook doesn't exist or isn't working properly

---

### Test 6: Should reject invalid code
**File:** `src/features/Auth/hooks/__tests__/usePasswordReset.test.tsx:138-154`

**What it tests:**
- When server responds with `success: false` and error code `INVALID_CODE`
- The mutation should set `isError = true`
- `result.current.error?.message` should be `'Invalid or expired code'`

**Implementation note:** Similar to Test 3 - need to handle `success: false` responses as errors

**Current failure:** Getting wrong error message

---

### Test 7: Should reject expired code
**File:** `src/features/Auth/hooks/__tests__/usePasswordReset.test.tsx:156-175`

**What it tests:**
- When code has expired (response: `{ success: false, code: 'CODE_EXPIRED' }`)
- Should throw a special error class called `VerifyCodeError` (not a regular Error)
- The error should have an `errorCode` property = `'CODE_EXPIRED'`
- Usage: `(result.current.error as VerifyCodeError).errorCode`

**Current failure:**
- Not reaching error state
- Error doesn't have the `errorCode` property

**Implementation note:** Need to create/export a `VerifyCodeError` class that extends Error and includes `errorCode` field

---

### Test 8: Should handle network errors during verification
**File:** `src/features/Auth/hooks/__tests__/usePasswordReset.test.tsx:177-191`

**What it tests:**
- When the API call fails with a network error (rejected promise with message "Network timeout")
- The mutation should set `isError = true`
- `result.current.error?.message` should contain the word "Network"

**Current failure:** Not reaching error state

---

### Test 9: Should include error code in VerifyCodeError
**File:** `src/features/Auth/hooks/__tests__/usePasswordReset.test.tsx:193-212`

**What it tests:**
- When server responds with `success: false` and error code `'TOO_MANY_ATTEMPTS'`
- Should create a `VerifyCodeError` instance
- `(result.current.error as VerifyCodeError).errorCode` should equal `'TOO_MANY_ATTEMPTS'`

**Implementation note:** The hook needs to:
1. Detect `success: false` in response
2. Extract the `code` field from the response
3. Create `VerifyCodeError` with the error code
4. Throw it as the mutation error

**Current failure:** Not reaching error state, error doesn't have errorCode

---

## Integration Tests (Full Password Reset Flow)

### Test 10: Should complete full reset flow: request -> verify
**File:** `src/features/Auth/hooks/__tests__/usePasswordReset.test.tsx:216-256`

**What it tests:**
- Step 1: Call `usePasswordResetRequest().mutate({ email })` → should succeed
- Step 2: Call `usePasswordResetVerify().mutate({ email, code })` → should succeed
- Both hooks should work together properly
- Total of 2 API calls should be made

**Current failure:** First mutation never succeeds

---

### Test 11: Should handle error in middle of flow
**File:** `src/features/Auth/hooks/__tests__/usePasswordReset.test.tsx:258-301`

**What it tests:**
- Step 1: Request succeeds → `requestResult.current.isSuccess = true`
- Step 2: Verify fails with invalid code → `verifyResult.current.isError = true`
- Request mutation should still show as successful even after verify fails
- Each mutation tracks its own state independently

**Current failure:** First mutation never succeeds

---

## Summary of Implementation Requirements

### Hook Files That Need Implementation/Fixes:
1. **`src/features/Auth/hooks/usePasswordResetRequest.ts`** (or similar)
   - Export a `usePasswordResetRequest()` hook
   - Makes POST request to `/api/auth/forgot-password/request`
   - Handles `success: false` responses as errors
   - Returns mutation with: `isSuccess`, `isError`, `data`, `error`, `mutate()`

2. **`src/features/Auth/hooks/usePasswordResetVerify.ts`** (or similar)
   - Export a `usePasswordResetVerify()` hook
   - Export a `VerifyCodeError` class that extends Error and has `errorCode` property
   - Makes POST request to `/api/auth/forgot-password/verify-code`
   - Converts `success: false` responses into `VerifyCodeError` with the error code
   - Returns mutation with: `isSuccess`, `isError`, `data`, `error`, `mutate()`

### API Response Format Expected:
```typescript
// Success response
{
  success: true,
  message: string,
  expiresIn?: string  // e.g., "15 minutes"
}

// Error response (from server)
{
  success: false,
  message: string,
  code?: string  // e.g., "INVALID_CODE", "CODE_EXPIRED", "TOO_MANY_ATTEMPTS"
}
```

### Key Implementation Notes:
- Both hooks use React Query mutations
- Both need to treat `success: false` responses as errors
- The verify hook needs special error handling with `VerifyCodeError` class
- Error messages should come from the server's `message` field
- Error codes should be extracted and attached to `VerifyCodeError` instances
