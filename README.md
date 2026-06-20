# 🎉 DAWAT - আপনার নিমন্ত্রণ

> A secure, modern meal ordering and wallet management platform with enterprise-grade security

[![Vercel Deploy](https://img.shields.io/badge/Deployed%20on-Vercel-000?style=for-the-badge&logo=vercel)](https://yourproject.vercel.app)
[![Firebase](https://img.shields.io/badge/Backend-Firebase-FFA500?style=for-the-badge&logo=firebase)](https://firebase.google.com)
[![Node.js](https://img.shields.io/badge/Runtime-Node.js-339933?style=for-the-badge&logo=node.js)](https://nodejs.org)
[![Security](https://img.shields.io/badge/Security-Enterprise%20Grade-green?style=for-the-badge)](./config/firestore.rules)

---

## 📖 Project Overview

**DAWAT** is a retro-themed meal ordering and wallet management system designed with security-first architecture. Users can browse daily meal menus, place orders, manage digital wallets, and track transaction history. Admins manage meals, approve top-ups, and oversee operations.

Built with a **gaming aesthetic** (retro pixel art UI), the platform combines nostalgic design with modern security practices.

---

## ✨ Key Features

### 👥 For Users
- 🍽️ **Daily Meal Ordering** - Browse and order from today's menu
- 💰 **Digital Wallet** - Secure wallet with transaction history
- 📲 **Top-up Management** - Request wallet top-ups with bank references
- 📝 **Order Management** - View, edit, or cancel placed orders
- 🔔 **Notifications** - Real-time alerts for order and payment updates
- 📊 **Transaction History** - Complete audit trail of all wallet transactions

### 👨‍💼 For Administrators
- 🍴 **Meal Management** - Create, update, and manage daily menus
- 💳 **Top-up Processing** - Review and confirm/reject top-up requests
- 📋 **Order Oversight** - Monitor all user orders in real-time
- 👤 **User Management** - View user profiles and activity
- 🔐 **Admin Dashboard** - Comprehensive admin control panel

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (Client)                        │
│  HTML • CSS • Vanilla JavaScript • Firebase SDK              │
│  Deployed on: Vercel Static Hosting                          │
└──────────────────┬──────────────────────────────────────────┘
                   │
        ┌──────────┴──────────┐
        │                     │
┌───────▼─────────┐  ┌────────▼──────────┐
│  Vercel API     │  │  Firebase/Cloud   │
│  Functions      │  │  Services         │
│  (Node.js)      │  │                   │
│  - placeOrder   │  │  ✓ Firestore DB   │
│  - editOrder    │  │  ✓ Firebase Auth  │
│  - cancelOrder  │  │  ✓ Security Rules │
│  - confirmTopup │  │                   │
│  - rejectTopup  │  └───────────────────┘
└─────────────────┘
```

---

## 🔒 Security Architecture

### Multi-Layer Defense

```
🛡️ Layer 1: Firebase Authentication
   └─ JWT token verification
   └─ Session management

🛡️ Layer 2: Firestore Security Rules
   └─ Role-based access control
   └─ Field-level validation
   └─ Document ownership checks

🛡️ Layer 3: Server-Side API Validation
   └─ Admin SDK (bypasses client rules)
   └─ Price verification against menu
   └─ Wallet balance checks
   └─ Atomic transactions

🛡️ Layer 4: Input Sanitization
   └─ HTML escaping
   └─ Type validation
   └─ Quantity bounds checking
```

### ✅ Security Features

| Feature | Implementation |
|---------|-----------------|
| **Order Manipulation** | Server validates prices against menu; rejects mismatches |
| **Price Fraud** | Strict atomic transactions; wallet debit confirmed before order marked paid |
| **Wallet Tampering** | Direct client writes blocked; only Admin SDK can modify |
| **Direct API Exploits** | Firestore rules enforce: `allow create, update, delete: if false` for sensitive collections |
| **Notification Spoofing** | Only backend/Admin SDK can create notifications; users cannot fabricate alerts |
| **User Self-Approval** | Users can only create applications for their own email with "pending" status |
| **Fake Admin Notifications** | Admin notifications strictly controlled; users cannot create them via client |
| **Session Hijacking** | Firebase Auth handles token validation; HTTPS enforced |

---

## 🚀 Tech Stack

### Frontend
- **HTML5** - Semantic markup
- **CSS3** - Responsive design with retro gaming theme
- **Vanilla JavaScript (ES Modules)** - Client-side logic
- **Firebase SDK** - Real-time database, authentication

### Backend
- **Node.js** - Runtime
- **Vercel Functions** - Serverless API endpoints
- **Firebase Admin SDK** - Server-side database operations

### Database & Services
- **Firestore** - NoSQL real-time database
- **Firebase Authentication** - User identity management
- **Firebase Security Rules** - Access control

### Deployment
- **Vercel** - Static hosting + serverless functions
- **GitHub** - Version control

---

## 📁 Project Structure

```
dawat/
├── 📄 HTML Pages
│   ├── index.html                 # Login page
│   ├── menu.html                  # User: Order meals
│   ├── orders.html                # User: View & manage orders
│   ├── wallet.html                # User: Wallet & top-ups
│   ├── settings.html              # User: Account settings
│   ├── menu-admin.html            # Admin: Manage meals
│   ├── orders-admin.html          # Admin: View all orders
│   ├── topups-admin.html          # Admin: Process top-ups
│   └── applications.html          # Admin: User applications
│
├── 📂 api/                        # Vercel Serverless Functions
│   ├── firebase-init.js           # Shared Firebase config
│   ├── placeOrder.js              # Create order + debit wallet
│   ├── editOrder.js               # Modify order + adjust wallet
│   ├── cancelOrder.js             # Cancel order + refund wallet
│   ├── debitWallet.js             # Direct wallet debit
│   ├── refundWallet.js            # Wallet refund
│   ├── confirmTopup.js            # Admin: Confirm top-up
│   ├── rejectTopup.js             # Admin: Reject top-up
│   ├── wipeUserData.js            # Admin: Wipe all user data
│   ├── deleteAllUserData.js       # Admin: Bulk delete all users
│   ├── sendAdminNotification.js   # Backend: Send admin notifications
│   └── notifyTopupRequest.js      # Backend: Notify on topup requests
│
├── 📂 js/                         # Client-side Modules
│   ├── firebase.js                # Firebase initialization
│   ├── admin-config.js            # Admin email list
│   ├── admin-helpers.js           # Admin utility functions
│   ├── admin-view.js              # Admin dashboard logic
│   ├── wallet.js                  # Wallet operations
│   ├── wallet-secure.js           # Secure wallet API calls
│   ├── notifications.js           # Notification system
│   ├── notify-admins-api.js       # Backend notification helper
│   ├── modal.js                   # Dialog/modal components
│   ├── app-utils.js               # Utility functions
│   └── stars.js                   # UI animations
│
├── 📂 css/
│   └── style.css                  # Unified styling (retro theme)
│
├── 📂 config/
│   ├── firestore.rules            # Security rules
│   └── firestore.indexes.json     # Database indexes
│
├── 📂 assets/
│   └── sounds/
│       └── notification.mp3       # Notification sound
│
├── ⚙️ Configuration Files
│   ├── vercel.json                # Vercel deployment config
│   ├── firebase.json              # Firebase config
│   ├── package.json               # Dependencies
│   └── .gitignore                 # Git ignore rules
└── 🔧 Dev Configuration
    └── .vercelignore              # Vercel ignore rules
```

---

## 🎮 User Guide

### Getting Started

1. **Sign Up / Login**
   - Visit the platform
   - Create account or sign in
   - Verify email

2. **Browse Menu**
   - Go to "Menu"
   - View today's available meals
   - Select quantities

3. **Place Order**
   - Confirm total
   - Server validates prices
   - Wallet debited automatically
   - Receive confirmation

4. **Manage Orders**
   - View all orders in "My Orders"
   - Edit upcoming orders (quantity/items)
   - Cancel orders (automatic refund)

5. **Wallet Management**
   - Check balance in header
   - Top-up via bank transfer
   - Provide bank reference
   - Wait for admin confirmation
   - Balance updated automatically

---

## 👨‍💻 Developer Guide

### Setup

```bash
# 1. Clone repository
git clone https://github.com/yourusername/yourproject.git
cd yourproject

# 2. Install dependencies
npm install

# 3. Set up environment variables
cp .env.example .env.local
# Edit .env.local with your Firebase credentials

# 4. Deploy locally (Firebase Emulator)
firebase emulators:start

# 5. Deploy to Vercel (if authorized)
vercel deploy
```

### API Endpoints

#### Order Management
```
POST /api/placeOrder
  - Create order with validation
  - Input: { items, forDate, clientTotal }
  - Returns: { orderId, newBalance, total }

POST /api/editOrder
  - Modify existing order
  - Input: { orderId, items, total }
  - Returns: { success, newTotal }

POST /api/cancelOrder
  - Cancel order and refund
  - Input: { orderId }
  - Returns: { success, message }
```

#### Wallet Management
```
POST /api/debitWallet
  - Debit wallet (order payment)
  - Admin SDK only

POST /api/refundWallet
  - Refund wallet (order cancellation)
  - Admin SDK only

POST /api/confirmTopup
  - Admin confirms top-up
  - Input: { topupId }
  - Updates wallet + creates history

POST /api/rejectTopup
  - Admin rejects top-up
  - Input: { topupId }

#### Admin Operations
```
POST /api/wipeUserData
  - Admin: Delete all user data for specific email
  - Input: { email }
  - Deletes: orders, wallet, topups, history, notifications
  - Returns: { success, message, totalDeleted }

POST /api/deleteAllUserData
  - Admin: Bulk delete all users or specific users
  - Input: { deleteAll: boolean }
  - Deletes: all user data across all collections
  - Returns: { success, message, totalDeleted }
```

### Database Schema

#### Collections
```
wallets/{userId}
  - balance: number
  - email: string
  - updatedAt: timestamp

orders/{orderId}
  - userId: string
  - userEmail: string
  - forDate: string (YYYY-MM-DD)
  - items: [{mealId, name, price, qty}]
  - total: number
  - status: "placed" | "cancelled"
  - paid: boolean
  - createdAt: timestamp

topups/{topupId}
  - userId: string
  - amount: number
  - bankRef: string
  - status: "pending" | "confirmed" | "rejected"
  - requestedAt: timestamp

notifications/{notificationId}
  - userId: string
  - message: string
  - type: string
  - read: boolean
  - createdAt: timestamp
```

### Security Rules Summary

```firestore
orders: allow create, update, delete: if false
  ↳ Only Admin SDK can create/modify

wallets: allow create, delete: if false; update: if isAdmin
  ↳ Only admins can update balances

notifications: allow create: if isAdmin
  ↳ Only admins/backend via Admin SDK can create notifications
  ↳ Prevents users from fabricating fake alerts to trick admins

applications: allow create: if status=="pending" && email is not empty
  ↳ Only safe fields allowed: name, mobile, email, office, address
  ↳ Users cannot create applications for other emails or approve themselves
```

---

## 🧪 Testing Checklist

### User Features
- [ ] Browse daily menu
- [ ] Place order with wallet debit
- [ ] Edit order (quantity/items)
- [ ] Cancel order (automatic refund)
- [ ] Request wallet top-up
- [ ] View transaction history
- [ ] Receive notifications

### Admin Features
- [ ] Manage daily meals
- [ ] View all orders
- [ ] Confirm/reject top-ups
- [ ] View user profiles
- [ ] Monitor wallet transactions

### Security Validation
- [ ] Cannot create order via direct API
- [ ] Cannot modify wallet directly
- [ ] Cannot change order price
- [ ] Cannot create fake notifications
- [ ] Cannot bypass authentication

---

## 🔐 Environment Variables

```env
# Firebase (keep these secret - never commit to repo)
GOOGLE_APPLICATION_CREDENTIALS=<path-to-service-account.json>
FIREBASE_PROJECT_ID=<your-firebase-project-id>

# Optional
DEBUG=false
```

⚠️ **IMPORTANT**: Never commit `.env`, `.env.local`, or service account keys to version control. Use `.gitignore` and set environment variables via your hosting platform (Vercel, Firebase).

---

## 📊 Performance Metrics

| Metric | Target | Status |
|--------|--------|--------|
| Order Placement | < 2s | ✅ Optimized |
| Menu Load | < 500ms | ✅ Real-time |
| Notification Delivery | < 1s | ✅ Real-time |
| Wallet Update | Instant | ✅ Real-time |

---

## 🐛 Troubleshooting

### Common Issues

**"Missing or insufficient permissions"**
- Firestore rules blocking operation
- Verify user authentication
- Check role (user vs admin)

**"Price mismatch"**
- Client price ≠ server menu price
- Menu updated after client load
- Refresh page and retry

**"Insufficient funds"**
- Wallet balance < order total
- Request top-up first

**"Order already cancelled"**
- Order status already "cancelled"
- Cannot cancel twice

---

## 📞 Support

- **Issues**: Report via GitHub Issues
- **Security**: Report security vulnerabilities privately
- **Features**: Suggest via GitHub Discussions

---

## 📄 License

Proprietary - All rights reserved

---

## 🎨 Design Credits

- **Retro Gaming Theme** - Custom CSS with pixel-art aesthetic
- **Icons & Emojis** - Unicode emoji set
- **Color Palette** - Retro arcade inspiration

---

## 🚀 Future Roadmap

- [ ] Mobile app (iOS/Android)
- [ ] Advanced meal filtering
- [ ] Recurring orders
- [ ] Analytics dashboard
- [ ] Multi-language support
- [ ] Payment gateway integration

---

<div align="center">

### ⭐ Made with ❤️ using Firebase, Vercel & Node.js

**[Deploy Guide](#setup)** • **[Report Issue](https://github.com/yourusername/yourproject/issues)** • **[Documentation](#-developer-guide)**

</div>
