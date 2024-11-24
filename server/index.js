const express = require("express");
const cors = require("cors");
require("dotenv").config();
const mongoose = require('mongoose');
const bodyParser = require("body-parser");
const stripe = require('stripe')('sk_test_51L3gAVA2HmInnuJGu9F4FOZyFH01pXHx9kuIgQ6I4m7cfUZYvxIuV6QIUUyoptPjwffiuqU9ybmz2MziFx7OfNLt00LjTCdsMs');
const uri = process.env.MONGO_URI;
const price_id = "price_1QNU84A2HmInnuJGOn6humMX";
// const endpointSecret = process.env.WEBHOOK_SIGNING_SECRET;
const endpointSecret = "whsec_lCsmYY7v2C1V74zEcXvyROabmTwb0Dex";
mongoose.connect(process.env.MONGO_URI, {}).then(() => console.log('MongoDB Connected'))
  .catch((error) => console.log(error.message));

const app = express();
app.use(cors());
app.use(express.json());
app.use(bodyParser.raw({ type: "application/json" }));

// Route to create intent
// =====================================================================================
// =====================================================================================
// =====================================================================================

app.post("/create-stripe-session-subscription", async (req, res) => {
  const { email, domain, amount } = req.body;
  let customer;

  try {
    // Retrieve customers by email
    const existingCustomers = await stripe.customers.list({
      email: email,
      limit: 1,
    });

    if (existingCustomers.data.length > 0) {
      customer = existingCustomers.data[0];

      // Check for active subscriptions for the given domain
      const subscriptions = await stripe.subscriptions.list({
        customer: customer.id,
        status: "active",
      });

      const existingSubscription = subscriptions.data.find((sub) =>
        sub.metadata?.domain === domain
      );

      if (existingSubscription) {
        // Domain is already subscribed, redirect to billing portal
        const stripeSession = await stripe.billingPortal.sessions.create({
          customer: customer.id,
          return_url: "http://localhost:3000/",
        });
        return res.status(409).json({ redirectUrl: stripeSession.url });
      }
    } else {
      // No customer found, create a new one
      customer = await stripe.customers.create({
        email: email,
        metadata: {
          userId: email,
        },
      });
    }

    // Create a checkout session for the domain
    const session = await stripe.checkout.sessions.create({
      success_url: "http://localhost:3000/success",
      cancel_url: "http://localhost:3000/cancel",
      payment_method_types: ["card"],
      mode: "subscription",
      billing_address_collection: "auto",
      line_items: [
        {
          price_data: {
            currency: "gbp",
            product_data: {
              name: `Subscription for ${domain}`,
              description: "Access to your domain",
            },
            unit_amount: parseInt(amount), // Convert amount to cents
            recurring: {
              interval: "month",
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        domain: domain, // Store the domain in metadata
        userId: email, // Optional: user ID for reference
      },
      customer: customer.id, // Use the customer ID
    });

    res.json({ id: session.id });
  } catch (error) {
    console.error("Error creating subscription:", error.message);
    res.status(500).json({ error: error.message });
  }
});


// Order fulfilment route
// =====================================================================================
// =====================================================================================
// =====================================================================================

// webhook for subscription
app.post("/webhook", async (req, res) => {
  const endpointSecret = "whsec_lCsmYY7v2C1V74zEcXvyROabmTwb0Dex";
  let event;

  try {
    const signature = req.headers["stripe-signature"];
    event = stripe.webhooks.constructEvent(req.body, signature, endpointSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;

      const { customer, subscription, amount_total, currency, metadata } = session;

      // Retrieve subscription details from Stripe
      const subscriptionDetails = await stripe.subscriptions.retrieve(subscription);
      const { current_period_end } = subscriptionDetails;

      try {
        const domainPayment = await DomainPayment.findOneAndUpdate(
          { domain: metadata.domain },
          {
            domain: metadata.domain,
            email: metadata.email,
            customerId: customer,
            subscriptionId: subscription,
            paymentStatus: "succeeded",
            amountPaid: amount_total / 100, // Convert cents to dollars
            currency: currency,
            expiresAt: new Date(current_period_end * 1000), // Convert UNIX timestamp to JS Date
            metadata: metadata,
          },
          { upsert: true, new: true }
        );

        console.log("Payment saved:", domainPayment);
      } catch (err) {
        console.error("Error saving payment data:", err);
      }
      break;
    }

    case "invoice.payment_succeeded": {
      const invoice = event.data.object;
      const { subscription } = invoice;

      // Retrieve subscription details from Stripe
      const subscriptionDetails = await stripe.subscriptions.retrieve(subscription);
      const { current_period_end, customer } = subscriptionDetails;

      try {
        const domainPayment = await DomainPayment.findOneAndUpdate(
          { customerId: customer },
          {
            expiresAt: new Date(current_period_end * 1000), // Update expiration date
          },
          { new: true }
        );

        console.log("Subscription updated:", domainPayment);
      } catch (err) {
        console.error("Error updating subscription data:", err);
      }
      break;
    }

    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  res.status(200).send("Received webhook event");
});


app.listen(3001, () => {
  console.log("Server is running on port 3001");
});
