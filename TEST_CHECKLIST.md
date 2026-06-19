# Secure Wallet Implementation - Test Checklist

## Pre-Deployment Checks ✓

- [x] Firestore security rules deployed (blocks client wallet writes)
- [x] API endpoints syntax validated (debitWallet.js, refundWallet.js)
- [x] Client-side wallet-secure.js wrapper validated
- [x] Menu and orders pages updated to use secure functions
- [x] Firebase Admin SDK dependencies added (firebase-admin in package.json)
- [x] Environment variables configured (.env.local for dev)
- [x] Code committed locally with descriptive message

## Manual Code Review

### Security Flow Check

1. **Client Request** (`js/wallet-secure.js`)
   - ✓ Gets Firebase ID token
   - ✓ Sends token as Bearer in Authorization header
   - ✓ Calls Vercel API endpoint (not direct Firestore)

2. **Server Validation** (`api/debitWallet.js`)
   - ✓ Verifies token using Firebase Admin SDK
   - ✓ Extracts userId from token
   - ✓ Checks order exists and belongs to user
   - ✓ Checks order status is "placed"
   - ✓ Validates amount > 0
   - ✓ Uses Firestore transaction (prevents race conditions)
   - ✓ Checks wallet balance
   - ✓ Returns 402 for insufficient funds
   - ✓ Creates transaction history entry

3. **Database Rules** (`config/firestore.rules`)
   - ✓ Users can READ own wallet only
   - ✓ Users cannot CREATE wallet (false)
   - ✓ Users cannot UPDATE wallet (removed client-side update rule)
   - ✓ Users cannot DELETE wallet (false)
   - ✓ Admins can UPDATE wallet (for manual adjustments)

### Race Condition Prevention

The transaction in debitWallet.js:
- ✓ Atomically reads order + wallet + validates + updates in single transaction
- ✓ Prevents "check-then-act" race condition
- ✓ Example prevented: User places 2 orders rapidly → only one should debit

Example scenario (prevented):
```
User has $100, places two $60 orders
Without transaction:
  Order1: reads balance=$100, deducts $60 → $40
  Order2: reads balance=$100 (stale read), deducts $60 → $40 (BUG!)
  Result: Balance is $40 but $120 was charged

With transaction:
  Order1: txn reads balance=$100, deducts $60 → $40 (committed)
  Order2: txn retries with current balance=$40, fails INSUFFICIENT_FUNDS
  Result: Correct - only one order processed
```

## Integration Points

### 1. Order Placement Flow (menu.html)
- Import path: `import { secureDebitForOrder } from '../js/wallet-secure.js'`
- Call: `await secureDebitForOrder({ userId, userEmail, amount, orderId, note })`
- Error handling: Check for 'INSUFFICIENT_FUNDS' string

### 2. Order Cancellation Flow (orders.html)
- Import path: `import { secureRefundForOrder } from '../js/wallet-secure.js'`
- Call: `await secureRefundForOrder({ userId, userEmail, amount, orderId, note })`
- Adds funds back to wallet atomically

## Deployment Steps

1. **Push to GitHub**
   ```bash
   git push origin main
   ```
   
2. **Vercel Auto-Deploy**
   - Vercel will detect push and deploy automatically
   - Environment variables must be set in Vercel dashboard:
     - FIREBASE_PROJECT_ID=igotdawat-v1
     - GOOGLE_APPLICATION_CREDENTIALS=<service account json>

3. **Verify in Production**
   - Place an order → wallet balance should decrease
   - Cancel an order → wallet balance should increase
   - Try to place order with insufficient funds → error message

## Debugging

If something fails:

1. Check browser console (DevTools) for client-side errors
2. Check Vercel deployment logs (dashboard)
3. Check Firebase Admin SDK initialization
4. Verify environment variables are set on Vercel
5. Check Firestore security rules are deployed
6. Verify order exists with correct userId/userEmail

## What Changed From Old Implementation

**Before:** Users could directly write to Firestore wallet collection
**After:** All wallet writes go through Vercel API with server-side validation

This eliminates these attack vectors:
- User can't cheat their balance (all validation server-side)
- User can't race-condition multiple orders
- User can't bypass amount validation
- User can't create fake transaction history
