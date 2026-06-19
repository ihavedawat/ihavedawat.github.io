# Deployment Instructions

## Production Deployment on Vercel

### Step 1: Set Environment Variables on Vercel
Go to your Vercel project settings and add these environment variables:

```
FIREBASE_PROJECT_ID=igotdawat-v1
GOOGLE_APPLICATION_CREDENTIALS=<paste-your-firebase-service-account-json>
```

The service account JSON is the one you already created and used during setup.

### Step 2: Push to GitHub
The code is ready to deploy:

```bash
git add -A
git commit -m "implement secure wallet transactions with Vercel API"
git push origin main
```

Vercel will automatically deploy when you push.

### Step 3: Verify Deployment
Once deployed, test order placement:
1. Go to your app
2. Add items to cart and place an order
3. Check that wallet balance decreases by the order amount
4. Verify no direct client-side manipulation is possible

## How the Secure Wallet System Works

**Client-side** (`js/wallet-secure.js`):
- When placing an order, calls Vercel API endpoint `/api/debitWallet`
- Sends Firebase ID token for authentication

**Server-side** (`api/debitWallet.js`):
- Verifies token using Firebase Admin SDK
- Checks order exists and belongs to user (transaction)
- Validates wallet has sufficient funds
- Atomically debits wallet and creates transaction record
- User can't cheat because all validation happens server-side

**Database** (`config/firestore.rules`):
- Users can only READ their own wallet balance
- No client-side wallet updates allowed
- Only Vercel API (Firebase Admin SDK) can UPDATE wallets

This prevents users from:
- Creating fake wallet balances
- Debiting incorrect amounts
- Race conditions on concurrent orders
