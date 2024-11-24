import "./App.css";
import { loadStripe } from "@stripe/stripe-js";

const public_stripe_key = "pk_test_51L3gAVA2HmInnuJG7gD59xv1jkdy8T8kigc9uu2rxvX7wfRndWRchKf3QORZYfc8Nwl6d6fdwGLh4NtYnVWCwexb00aLm2i8Eh";

const HomePage = () => {
  const handleSubscription = async () => {
    const stripePromise = await loadStripe(public_stripe_key); // Load Stripe
    const email = "mead-test2@gmail.com"; // Customer email
    const domain = "example.com"; // Example domain
    const amount = "2000"; // Amount in cents

    // Send request to the backend
    const response = await fetch(
      "http://localhost:3001/create-stripe-session-subscription",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" }, // Correct header
        body: JSON.stringify({
          email: email,
          domain: domain,
          amount: amount, // Ensure amount is correctly formatted as a string or number
        }), // Convert body to JSON string
      }
    );

    // Handle response
    if (response.status === 409) {
      // Redirect to billing portal if user is already subscribed
      const data = await response.json();
      if (data && data.redirectUrl) {
        window.location.href = data.redirectUrl;
      }
    } else if (response.ok) {
      // Start the Stripe Checkout session
      const session = await response.json();
      const stripe = await stripePromise;
      stripe.redirectToCheckout({
        sessionId: session.id,
      });
    } else {
      console.error("Error creating subscription:", await response.text());
    }
  };


  return (
    <div className="App">
      <div
        style={{
          margin: "30px",
          borderWidth: "3px 9px 9px 9px",
          borderStyle: "solid",
          borderColor: "#FF6633",
          height: "100px",
          borderRadius: "10px",
        }}
      >
        Online Video Editor <br />
        Charges - 200INR Per Month <br />
        Quantity - 3 Copies <br />
        <button onClick={() => handleSubscription()}> Subscribe Now! </button>
      </div>
    </div>
  );
};

export default HomePage;
