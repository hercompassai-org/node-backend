import sgMail from "@sendgrid/mail";

if (!process.env.SENDGRID_API_KEY) {
  console.error("❌ SENDGRID_API_KEY is MISSING in production");
} else {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  console.log("✅ SENDGRID_API_KEY loaded successfully");
}

export default sgMail;
