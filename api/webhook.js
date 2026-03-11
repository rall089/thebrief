import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Vercel needs raw body for Stripe signature verification
export const config = { api: { bodyParser: false } };

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", chunk => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const rawBody = await getRawBody(req);
  const sig = req.headers["stripe-signature"];

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Webhook signature failed:", err.message);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  try {
    switch (event.type) {

      // Subscription activated (checkout completed or renewed)
      case "checkout.session.completed":
      case "customer.subscription.updated": {
        const obj = event.data.object;
        const customerId = obj.customer || obj.id;
        const isActive = obj.status === "active" || event.type === "checkout.session.completed";

        await supabase
          .from("usage")
          .update({ is_subscribed: isActive })
          .eq("stripe_customer_id", customerId);
        break;
      }

      // Subscription cancelled or payment failed
      case "customer.subscription.deleted":
      case "invoice.payment_failed": {
        const customerId = event.data.object.customer;
        await supabase
          .from("usage")
          .update({ is_subscribed: false })
          .eq("stripe_customer_id", customerId);
        break;
      }
    }

    return res.status(200).json({ received: true });

  } catch (err) {
    console.error("Webhook handler error:", err);
    return res.status(500).json({ error: err.message });
  }
}
