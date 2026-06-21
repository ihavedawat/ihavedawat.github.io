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

- Server-side price validation
- Atomic wallet transactions
- Firestore security rules for data protection
- No sensitive client-side operations
- Admin operations require verified tokens
- User ownership validated on all operations

## License

Proprietary - All rights reserved
