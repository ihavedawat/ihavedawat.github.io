# Secure Wallet Implementation Summary

## Problem Solved

Previously, users could directly write to their wallet balance in Firestore, allowing them to:
- Cheat their balance to any amount
- Avoid paying for orders
- Create fake transaction histories
- Cause race conditions on concurrent orders

## Solution Implemented

All wallet operations now go through **Vercel API Routes** with **server-side validation** using **Firebase Admin SDK**.

### Architecture

```
┌─────────────────────┐
│  Browser (Client)   │
│                     │
│  menu.html:         │
│  1. Get ID token    │
│  2. Call Vercel API │
└──────────┬──────────┘
           │
           │ POST /api/debitWallet
           │ Authorization: Bearer {idToken}
           │
┌──────────▼──────────┐
│  Vercel (Server)    │
│                     │
│  debitWallet.js:    │
│  1. Verify token    │
│  2. Check order     │
│  3. Check balance   │
│  4. Transaction:    │
│     - Debit wallet  │
│     - Create entry  │
│  5. Return result   │
└──────────┬──────────┘
           │
           │ Firestore writes (via Admin SDK)
           │
┌──────────▼──────────┐
│    Firebase Cloud   │
│      Firestore      │
│                     │
│  Rules prevent      │
│  client-side writes │
└─────────────────────┘
```

## Key Files Changed

### New Files

**`api/debitWallet.js`**
- Vercel serverless function for order payment processing
- Verifies Firebase ID token using Admin SDK
- Checks order exists and belongs to user
- Uses Firestore transaction for atomicity
- Debits wallet and creates transaction history
- Returns 402 for insufficient funds

**`api/refundWallet.js`**
- Vercel serverless function for order refunds
- Same security validation as debitWallet
- Adds funds back to wallet atomically

**`js/wallet-secure.js`**
- Client-side wrapper for API calls
- Gets Firebase ID token and sends as Bearer token
- Routes API calls to Vercel (localhost:3000 for dev, same origin for prod)
- Throws 'INSUFFICIENT_FUNDS' error on 402 response

**`package.json`**
- Added firebase-admin dependency for Vercel API endpoints
- Added dev/build scripts for Vercel environment

**`.vercelignore`**
- Tells Vercel which files not to deploy (.env.local, node_modules, etc.)

### Modified Files

**`js/firebase.js`**
- Added import/export for Firebase functions module

**`config/firestore.rules`**
- Removed client-side write permissions for wallets
- Users can only READ their own wallet
- Updated walletHistory rules to only allow admin creates
- Added security comment explaining Vercel API enforces updates

**`pages/menu.html`**
- Changed from direct wallet write to `secureDebitForOrder()` call
- Error handling for "INSUFFICIENT_FUNDS" message

**`pages/orders.html`**
- Added import for `secureRefundForOrder()`
- Prepared for secure refunds on cancellation

## Security Properties

### Prevents User Cheating
- ✓ User can't set arbitrary balance
- ✓ User can't bypass amount validation
- ✓ User can't avoid paying for orders
- ✓ All validation runs server-side where user can't interfere

### Prevents Race Conditions
Transaction in debitWallet atomically:
1. Reads current order state
2. Reads current wallet balance
3. Validates both
4. Updates both in single atomic operation

Example prevented scenario:
```
User places 2 orders rapidly, wallet = $100
Without transaction: Both read $100, both debit → Balance = $100 (BUG!)
With transaction: Order2 retries, sees $40, fails INSUFFICIENT_FUNDS (CORRECT!)
```

### Maintains Audit Trail
- Every wallet operation creates transaction history entry
- Includes user, amount, type, reference (orderId), timestamp
- Admins can manually audit and adjust if needed

## Deployment Process

### Step 1: Firestore Rules (Already Done ✓)
```bash
firebase deploy --only firestore:rules --project igotdawat-v1
```
Rules now block all client-side wallet writes.

### Step 2: Push to GitHub
```bash
git push origin main
```
Vercel will auto-deploy when it detects the push.

### Step 3: Set Vercel Environment Variables
On Vercel dashboard, set:
- `FIREBASE_PROJECT_ID` = igotdawat-v1
- `GOOGLE_APPLICATION_CREDENTIALS` = <paste Firebase service account JSON>

### Step 4: Test in Production
1. Place an order → wallet should decrease
2. Check wallet → balance should be updated
3. Try to place with insufficient funds → "Not enough balance" error
4. Cancel order → wallet should increase

## Testing Scenarios

### Happy Path
```
1. User has $100 balance
2. User places $50 order
3. API verifies token, finds order, checks balance
4. Debit $50 from wallet → new balance = $50
5. Create transaction history entry
6. Return success with new balance
```

### Insufficient Funds
```
1. User has $30 balance
2. User tries to place $50 order
3. API verifies token, finds order
4. Checks balance: $30 < $50
5. Returns 402 INSUFFICIENT_FUNDS
6. Order status set to "cancelled"
7. UI shows "Not enough balance"
```

### Race Condition Prevention
```
1. User places 2 orders rapidly (fast-clicking)
2. Both orders created with status="placed"
3. Both call debitWallet API
4. First transaction: reads balance=$100, deducts $60 → $40
5. Second transaction: retries, reads balance=$40, needs $60 → fails
6. First order succeeds, second order cancelled with status="cancelled"
```

### Invalid Order/User
```
1. Attacker spoofs API call with someone else's orderId
2. API verifies token (matches attacker)
3. Checks order ownership: order.userId != attacker.uid
4. Returns 403 "Order does not belong to this user"
5. No wallet change occurs
```

## Monitoring & Maintenance

### What Admins Can Do
- View wallet balances (read-only)
- Manually update wallet for topup confirmations
- View complete transaction history
- Create manual adjustment entries

### What Users Can Do
- Read their own wallet balance
- Read their own transaction history
- View topup requests they created

### What No One Can Do (Server Validates)
- Cheat wallet balance
- Create fake transactions
- Bypass order ownership checks
- Race-condition concurrent operations

## Rollback Plan

If issues arise:
1. Remove API endpoints from Vercel (delete api/ folder, push to GitHub)
2. Revert Firestore rules to allow client-side writes
3. Revert menu.html to use direct wallet writes
4. Deploy and test

But with this implementation, rollback shouldn't be necessary - the transaction-based approach is robust and prevents all known exploits.
