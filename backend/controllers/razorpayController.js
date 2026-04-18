/**
 * Razorpay Integration Controller
 *
 * Configuration: Set these environment variables before going live:
 *   RAZORPAY_KEY_ID     = your Razorpay Key ID (rzp_live_...)
 *   RAZORPAY_KEY_SECRET = your Razorpay Key Secret
 *
 * Until keys are provided, the controller runs in demo/mock mode.
 */
const crypto = require('crypto');
const db = require('../models/db');

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || 'RAZORPAY_KEY_ID_PLACEHOLDER';
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || 'RAZORPAY_KEY_SECRET_PLACEHOLDER';
const DEMO_MODE = !process.env.RAZORPAY_KEY_ID;

const PLANS = {
  pro_monthly: { amount: 29900, currency: 'INR', label: 'Pro Monthly', durationDays: 30 },
  pro_yearly:  { amount: 299900, currency: 'INR', label: 'Pro Yearly', durationDays: 365 },
  family:      { amount: 49900, currency: 'INR', label: 'Family Plan', durationDays: 30 },
};

// Lazily require razorpay only if keys are present
function getRazorpayInstance() {
  if (DEMO_MODE) return null;
  const Razorpay = require('razorpay');
  return new Razorpay({ key_id: RAZORPAY_KEY_ID, key_secret: RAZORPAY_KEY_SECRET });
}

exports.getKey = (req, res) => {
  res.json({ key: RAZORPAY_KEY_ID, demoMode: DEMO_MODE });
};

exports.getPlans = (req, res) => {
  res.json({ plans: PLANS });
};

exports.createOrder = async (req, res) => {
  try {
    const { plan } = req.body;
    const planData = PLANS[plan];
    if (!planData) return res.status(400).json({ error: 'Invalid plan' });

    if (DEMO_MODE) {
      // Mock order for testing without live keys
      const mockOrderId = `order_demo_${Date.now()}`;
      db.prepare(`INSERT INTO payment_orders (user_id, razorpay_order_id, plan, amount, currency, status) VALUES (?,?,?,?,?,?)`)
        .run(req.session.userId, mockOrderId, plan, planData.amount / 100, planData.currency, 'demo');
      return res.json({ orderId: mockOrderId, amount: planData.amount, currency: planData.currency, keyId: RAZORPAY_KEY_ID, demoMode: true, plan: planData.label });
    }

    const razorpay = getRazorpayInstance();
    const order = await razorpay.orders.create({
      amount: planData.amount,
      currency: planData.currency,
      receipt: `order_${req.session.userId}_${Date.now()}`,
      notes: { plan, userId: req.session.userId }
    });

    db.prepare(`INSERT INTO payment_orders (user_id, razorpay_order_id, plan, amount, currency, status) VALUES (?,?,?,?,?,?)`)
      .run(req.session.userId, order.id, plan, planData.amount / 100, planData.currency, 'created');

    res.json({ orderId: order.id, amount: order.amount, currency: order.currency, keyId: RAZORPAY_KEY_ID, plan: planData.label });
  } catch (e) {
    console.error('Razorpay create order error:', e);
    res.status(500).json({ error: e.message || 'Failed to create order' });
  }
};

exports.verifyPayment = (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, plan } = req.body;
    if (!razorpay_order_id || !razorpay_payment_id) return res.status(400).json({ error: 'Missing payment details' });

    // Demo mode: auto-approve
    if (DEMO_MODE || razorpay_order_id.startsWith('order_demo_')) {
      return activatePlan(req, res, plan, razorpay_order_id, razorpay_payment_id, 'demo_verified');
    }

    // Verify signature
    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSignature = crypto.createHmac('sha256', RAZORPAY_KEY_SECRET).update(body).digest('hex');
    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ error: 'Payment verification failed — invalid signature' });
    }

    activatePlan(req, res, plan, razorpay_order_id, razorpay_payment_id, razorpay_signature);
  } catch (e) {
    console.error('Razorpay verify error:', e);
    res.status(500).json({ error: e.message });
  }
};

function activatePlan(req, res, plan, orderId, paymentId, signature) {
  const planData = PLANS[plan] || PLANS['pro_monthly'];
  const expires = new Date();
  expires.setDate(expires.getDate() + planData.durationDays);

  db.prepare(`UPDATE payment_orders SET razorpay_payment_id=?, razorpay_signature=?, status='paid' WHERE razorpay_order_id=?`)
    .run(paymentId, signature || null, orderId);

  db.prepare(`UPDATE users SET plan=?, plan_expires_at=? WHERE id=?`)
    .run(plan, expires.toISOString(), req.session.userId);

  db.prepare(`INSERT INTO notifications (user_id, type, title, message) VALUES (?,?,?,?)`)
    .run(req.session.userId, 'plan_upgrade', '🎉 Plan Activated!', `Your ${planData.label} plan is now active until ${expires.toDateString()}.`);

  res.json({ success: true, plan, expires: expires.toISOString(), message: `${planData.label} activated successfully!` });
}

exports.webhook = (req, res) => {
  try {
    const signature = req.headers['x-razorpay-signature'];
    if (!DEMO_MODE && signature) {
      const body = JSON.stringify(req.body);
      const expected = crypto.createHmac('sha256', RAZORPAY_KEY_SECRET).update(body).digest('hex');
      if (expected !== signature) return res.status(400).json({ error: 'Invalid webhook signature' });
    }

    const event = req.body.event;
    const payload = req.body.payload;

    if (event === 'payment.captured') {
      const paymentId = payload?.payment?.entity?.id;
      const orderId = payload?.payment?.entity?.order_id;
      if (orderId) {
        const order = db.prepare('SELECT * FROM payment_orders WHERE razorpay_order_id=?').get(orderId);
        if (order && order.status !== 'paid') {
          db.prepare(`UPDATE payment_orders SET razorpay_payment_id=?, status='paid' WHERE razorpay_order_id=?`).run(paymentId, orderId);
          const planData = PLANS[order.plan] || PLANS['pro_monthly'];
          const expires = new Date();
          expires.setDate(expires.getDate() + planData.durationDays);
          db.prepare(`UPDATE users SET plan=?, plan_expires_at=? WHERE id=?`).run(order.plan, expires.toISOString(), order.user_id);
        }
      }
    }

    res.json({ status: 'ok' });
  } catch (e) {
    console.error('Webhook error:', e);
    res.status(500).json({ error: e.message });
  }
};

exports.status = (req, res) => {
  try {
    const user = db.prepare('SELECT id, plan, plan_expires_at FROM users WHERE id=?').get(req.session.userId);
    const isPro = user.plan && user.plan !== 'free' && (!user.plan_expires_at || new Date(user.plan_expires_at) > new Date());
    res.json({ plan: user.plan || 'free', planExpiresAt: user.plan_expires_at, isPro });
  } catch (e) { res.status(500).json({ error: e.message }); }
};
