# 🎉 DAWAT - আপনার নিমন্ত্রণ

Secure meal ordering and wallet management platform.

## Overview

Users can browse meals, place orders, manage digital wallets, and request top-ups. Admins manage menus, approve applications, and process transactions.

**Tech**: HTML/CSS/JS frontend • Node.js Vercel Functions • Firebase Firestore + Auth

## Setup

```bash
npm install
vercel deploy
```

Set Firebase credentials (`GOOGLE_APPLICATION_CREDENTIALS`, `FIREBASE_PROJECT_ID`) in Vercel dashboard.

## Features

- **Users**: Order meals, manage wallet, request top-ups, view history
- **Admins**: Manage menus, approve/reject applications, process payments

## Security

- Server-side price validation (menu prices, order totals)
- Atomic wallet transactions with strict validation
- Firestore security rules block all unauthorized writes
- Rate limiting (max 2 pending top-ups per user)
- Top-up limits: 100-10,000 BDT
- Admin operations require verified Firebase tokens
- User ownership validated on all operations
- Type checking prevents coercion attacks (1e100, strings, NaN)
- Order items revalidated on edit against actual menu

## License

Proprietary - All rights reserved
