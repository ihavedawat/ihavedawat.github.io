# 🎉 DAWAT - আপনার নিমন্ত্রণ

Secure meal ordering and wallet management platform with retro gaming UI.

## Overview

Meal ordering platform with digital wallet, built with Firebase backend and retro pixel UI. Users order meals, manage wallets, request top-ups. Admins manage menus and approve transactions.

---

## Features

**Users**: Browse menu → place order → manage wallet → request top-ups → view history  
**Admins**: Manage meals → approve applications → process top-ups → view all orders

## Architecture

Frontend (HTML/CSS/JS) → Vercel Functions (Node.js) → Firebase (Auth + Firestore)

**Security**: Multi-layer defense with Firebase Auth, Firestore rules, server-side validation, and type checking. All sensitive operations use Admin SDK with atomic transactions.

## Tech Stack

| Layer | Stack |
|-------|-------|
| Frontend | HTML5, CSS3, Vanilla JS (ES Modules) |
| Backend | Node.js, Vercel Functions |
| Database | Firebase Firestore + Auth |
| Hosting | Vercel + GitHub |

## Project Structure

```
├── api/                       # Vercel Functions (Node.js backend)
│   ├── orders.js             # Order operations (place/edit/cancel with validation)
│   ├── topups.js             # Wallet top-ups with rate limiting
│   ├── wallets.js            # Wallet debit/refund with atomicity
│   ├── admin.js              # Admin operations, notifications & user data wipe
│   ├── error-handler.js      # Error standardization
│   ├── firebase-init.js      # Admin SDK initialization
│   ├── delete-user-data-helper.js  # User data deletion
│   └── format-notification.js      # Notification formatting
│
├── js/                        # Client modules (Firebase SDK)
│   ├── firebase.js           # SDK & project config
│   ├── wallet.js             # Wallet & top-up operations
│   ├── notifications.js      # Real-time notification system
│   ├── admin-helpers.js      # Admin utility functions
│   ├── admin-view.js         # Admin dashboard logic
│   ├── admin-config.js       # Admin email whitelist
│   ├── icons.js              # Shared ICONS & MONTHS constants
│   ├── modal.js              # Dialog & modal UI
│   ├── logger.js             # Centralized error logging
│   └── app-utils.js          # Order/date utilities
│
├── *.html                     # Pages (user + admin) with GitHub redirect
├── 404.html                   # 404 page with dual-domain redirect
├── css/style.css             # Retro gaming theme
├── config/                   # Firestore security rules
├── vercel.json               # URL rewrites & routing
└── package.json              # Dependencies
```

## Setup

```bash
npm install
cp .env.example .env.local  # Add Firebase credentials
vercel deploy
```

Set `GOOGLE_APPLICATION_CREDENTIALS` and `FIREBASE_PROJECT_ID` in Vercel dashboard.

## API Endpoints

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `POST /api/orders` | User | Place, edit, cancel orders |
| `POST /api/topups` | User | Request top-ups |
| `POST /api/admin` | Admin or public | Manage notifications, users |
| `POST /api/wallets` | Admin | Direct wallet operations |

All sensitive operations validate prices server-side and use atomic transactions.

## Security

**Input Validation:**
✅ Server-side price validation against actual menu  
✅ Type checking prevents string/number/array coercion attacks  
✅ Finite number checks block Infinity and scientific notation (1e100)  
✅ Order items revalidated on edit — prevents meal injection  
✅ Positive-only values enforced — blocks negative refund exploits  

**Data Protection:**
✅ Wallet operations use atomic Firestore transactions  
✅ Notifications created server-side only — prevents spoofing  
✅ Client writes to wallets/meals/orders blocked by Firestore rules  
✅ Rate limiting on top-ups (max 2 pending per user)  
✅ Approval checks prevent unapproved users from accessing funds  

**Admin & Access:**
✅ All admin operations require verified Firebase ID tokens  
✅ User ownership validated on every operation  
✅ Wipe all user data via backend API (not client-exposed)  
✅ GitHub Pages redirects to Vercel (igotdawat + ihavedawat)

## License

Proprietary - All rights reserved
