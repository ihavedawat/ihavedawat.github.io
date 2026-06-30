import admin, { db } from './firebase-init.js';
import { ADMIN_EMAILS } from '../js/admin-config.js';
import { notifyAdminsInternal } from './admin.js';

async function sendEmailUser(to, subject, body) {
  try {
    await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.SENDGRID_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: 'igotdawat@gmail.com' },
        subject,
        content: [{ type: 'text/plain', value: body }]
      })
    });
  } catch (err) {
    console.error('Email error:', err);
  }
}

async function createTopupRequest(req, res, decodedToken) {
  const userId = decodedToken.uid;
  const userEmail = decodedToken.email;
  const { amount, bankRef } = req.body;

  if (typeof amount !== 'number' || !Number.isFinite(amount) || !Number.isInteger(amount) || amount < 100 || amount > 10000) {
    return res.status(400).json({ error: 'Invalid amount' });
  }

  if (!bankRef || typeof bankRef !== 'string') {
    return res.status(400).json({ error: 'Invalid bank reference' });
  }

  try {
    const pendingTopups = await db.collection('topups')
      .where('userId', '==', userId)
      .where('status', '==', 'pending')
      .get();

    if (pendingTopups.size >= 2) {
      return res.status(400).json({ error: 'You can only have 2 pending topup requests at a time' });
    }

    let appSnap = await db.collection('applications')
      .where('userId', '==', userId)
      .limit(1)
      .get();

    // Fallback to email query if userId not found (for new users before first order/topup)
    if (appSnap.empty) {
      appSnap = await db.collection('applications')
        .where('email', '==', userEmail.toLowerCase())
        .limit(1)
        .get();
    }

    if (appSnap.empty || appSnap.docs[0].data().status !== 'approved') {
      return res.status(403).json({ error: 'Your application is not approved yet' });
    }

    const topupRef = await db.collection('topups').add({
      userId,
      userEmail: userEmail.toLowerCase(),
      amount: Number(amount),
      bankRef: String(bankRef).substring(0, 100),
      status: 'pending',
      requestedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Get user's name from application record
    let userName = '';
    try {
      const appSnap = await db.collection('applications')
        .where('email', '==', userEmail.toLowerCase())
        .limit(1)
        .get();
      if (!appSnap.empty) {
        userName = appSnap.docs[0].data().name || '';
      }
    } catch (e) {
      // If lookup fails, continue without name
    }

    const byLabel = userName ? `${userName} (${userEmail})` : userEmail;

    notifyAdminsInternal({
      message: `Top-up requested\nFrom: ${byLabel}\nAmount: ৳${amount}\nBank ref: ${bankRef}`,
      link: 'topups-admin#pending',
      linkText: 'Review',
      type: 'topup-requested'
    }).catch(() => {});

    return res.status(200).json({
      success: true,
      topupId: topupRef.id
    });
  } catch (error) {
    const { sendErrorResponse } = await import('./error-handler.js');
    return sendErrorResponse(res, error, 'Failed to create top-up request');
  }
}

async function confirmTopup(req, res, decodedToken) {
  const adminEmail = decodedToken.email;
  const { topupId } = req.body;

  if (!ADMIN_EMAILS.map(e => e.toLowerCase()).includes((adminEmail || '').toLowerCase())) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  if (!topupId) {
    return res.status(400).json({ error: 'Missing topupId' });
  }

  try {
    let topupData = null;
    const result = await db.runTransaction(async (transaction) => {
      const topupRef = db.collection('topups').doc(topupId);
      const topupSnap = await transaction.get(topupRef);

      if (!topupSnap.exists) {
        throw new Error('TOPUP_NOT_FOUND');
      }

      const topup = topupSnap.data();
      topupData = topup;

      if (topup.status !== 'pending') {
        return { alreadyHandled: true, status: topup.status };
      }

      const amount = Number(topup.amount || 0);
      if (amount <= 0) {
        throw new Error('Invalid topup amount');
      }

      const walletRef = db.collection('wallets').doc(topup.userId);
      const walletSnap = await transaction.get(walletRef);
      const currentBalance = walletSnap.exists ? Number(walletSnap.data().balance || 0) : 0;
      const newBalance = currentBalance + amount;

      transaction.set(walletRef, {
        balance: newBalance,
        email: topup.userEmail,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      const historyRef = db.collection('walletHistory').doc();
      transaction.set(historyRef, {
        userId: topup.userId,
        userEmail: topup.userEmail,
        type: 'topup',
        amount,
        balanceAfter: newBalance,
        ref: topupId,
        byAdmin: adminEmail.toLowerCase(),
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });

      transaction.update(topupRef, {
        status: 'confirmed',
        confirmedAt: admin.firestore.FieldValue.serverTimestamp(),
        adminEmail: adminEmail.toLowerCase()
      });

      return {
        alreadyHandled: false,
        status: 'confirmed',
        balance: newBalance
      };
    });

    try {
      await sendEmailUser(
        topupData.userEmail,
        'Top-up confirmed',
        `Your top-up of ৳${topupData.amount} has been confirmed.\n\nYour new wallet balance: ৳${result.balance}\n\nBest regards,\nDawat`
      );
    } catch (emailErr) {
      console.error('Email send failed:', emailErr);
    }

    return res.status(200).json(result);
  } catch (error) {
    const { sendErrorResponse } = await import('./error-handler.js');
    return sendErrorResponse(res, error, 'Failed to confirm top-up');
  }
}

async function rejectTopup(req, res, decodedToken) {
  const adminEmail = decodedToken.email;
  const { topupId } = req.body;

  if (!ADMIN_EMAILS.map(e => e.toLowerCase()).includes((adminEmail || '').toLowerCase())) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  if (!topupId) {
    return res.status(400).json({ error: 'Missing topupId' });
  }

  try {
    const result = await db.runTransaction(async (transaction) => {
      const topupRef = db.collection('topups').doc(topupId);
      const topupSnap = await transaction.get(topupRef);

      if (!topupSnap.exists) {
        throw new Error('TOPUP_NOT_FOUND');
      }

      const topup = topupSnap.data();

      if (topup.status !== 'pending') {
        return { alreadyHandled: true, status: topup.status };
      }

      transaction.update(topupRef, {
        status: 'rejected',
        rejectedAt: admin.firestore.FieldValue.serverTimestamp(),
        adminEmail: adminEmail.toLowerCase()
      });

      return {
        alreadyHandled: false,
        status: 'rejected'
      };
    });

    try {
      const topup = topupSnap.data();
      await sendEmailUser(
        topup.userEmail,
        'Top-up declined',
        `Your top-up request of ৳${topup.amount} has been declined.\n\nPlease contact support if you have questions.\n\nBest regards,\nDawat`
      );
    } catch (emailErr) {
      console.error('Email send failed:', emailErr);
    }

    return res.status(200).json(result);
  } catch (error) {
    const { sendErrorResponse } = await import('./error-handler.js');
    return sendErrorResponse(res, error, 'Failed to reject top-up');
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = req.headers.authorization?.split('Bearer ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Missing authorization token' });
  }

  let decodedToken;
  try {
    decodedToken = await admin.auth().verifyIdToken(token);
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const { action } = req.body;

  switch (action) {
    case 'create':
      return createTopupRequest(req, res, decodedToken);
    case 'confirm':
      return confirmTopup(req, res, decodedToken);
    case 'reject':
      return rejectTopup(req, res, decodedToken);
    default:
      return res.status(400).json({ error: 'Invalid action' });
  }
}
