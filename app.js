const express = require('express');
const bodyParser = require('body-parser');
const speakeasy = require('speakeasy');
const qrCode = require('qrcode');
const twilio = require('twilio');
const nodemailer = require('nodemailer');

const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.json());

// Dummy database to store secret keys
const secretKeysDB = new Set();

app.get('/generate-secret-key', (req, res) => {
  const secretKey = speakeasy.generateSecret({ length: 20 }).base32;
  const encodedSecretKey = encodeURIComponent(secretKey); // URL-safe encoding
  const response = { secretKey: encodedSecretKey };

  // Store the secret key in the database (use a Set for simplicity)
  secretKeysDB.add(encodedSecretKey);

  res.json(response);
});

app.post('/request-one-time-password', (req, res) => {
  const { secretKey, issuer, phoneNumber } = req.query;

  if (!secretKeysDB.has(secretKey)) {
    return res.status(400).json({
      error: { code: 'totp/invalid-secret-key', message: 'Provided secret key is not valid.' },
    });
  }

  const otp = speakeasy.totp({
    secret: secretKey,
    encoding: 'base32',
  });

  // Send OTP via Twilio SMS
  sendTwilioSMS(phoneNumber, `Your OTP is: ${otp}`);

  res.json({ otp });
});

app.post('/verify', (req, res) => {
  const { secretKey, otp, lastOtpAt } = req.query;

  if (!secretKeysDB.has(secretKey)) {
    return res.status(400).json({
      error: { code: 'totp/invalid-secret-key', message: 'Provided secret key is not valid.' },
    });
  }

  const verified = speakeasy.totp.verify({
    secret: secretKey,
    encoding: 'base32',
    token: otp,
    window: 1, // Time window for OTP verification (default 30 seconds)
    step: 30, // Time step for OTP generation (default 30 seconds)
    last: lastOtpAt,
  });

  res.json({ verified });
});

app.post('/generate-qr-code-for-provisioning-mobile-apps', async (req, res) => {
  const { secretKey, issuer, email } = req.query;

  console.log('secretKeysDB:', secretKeysDB);
  console.log('Provided secretKey:', secretKey);
  console.log('Provided issuer:', issuer);
  console.log('Provided email:', email);

  if (!secretKeysDB.has(secretKey)) {
    return res.status(400).json({
      error: { code: 'generator/missing-attributes', message: 'Provided secret key is not valid.' },
    });
  }

  const provisioningUri = speakeasy.otpauthURL({
    secret: secretKey,
    label: `${issuer}:${email}`,
    issuer,
  });

  // Generate QR code
  const qrCodeDataUrl = await generateQRCode(provisioningUri);

  res.json({ qrCode: qrCodeDataUrl });
});

async function generateQRCode(data) {
  try {
    const qrCodeDataUrl = await qrCode.toDataURL(data);
    return qrCodeDataUrl;
  } catch (error) {
    console.error('Error generating QR code:', error);
    throw error;
  }
}

function sendTwilioSMS(phoneNumber, message) {
  const client = twilio(
    'TWILIO_ACCOUNT_SID',
    'TWILIO_AUTH_TOKEN'
  );

  client.messages.create({
    body: message,
    from: 'TWILIO_PHONE_NUMBER',
    to: phoneNumber,
  })
  .then(message => console.log(`Twilio SMS sent. SID: ${message.sid}`))
  .catch(error => console.error('Error sending Twilio SMS:', error));
}

function sendEmail(email, subject, message) {
  // Use nodemailer or any other email sending library to send an email
  // Replace EMAIL_SERVICE_API_KEY and EMAIL_SENDER_ADDRESS with actual values
  const transporter = nodemailer.createTransport({
    service: 'your_email_service_provider',
    auth: {
      user: 'EMAIL_SENDER_ADDRESS',
      pass: 'EMAIL_SERVICE_API_KEY',
    },
  });

  const mailOptions = {
    from: 'EMAIL_SENDER_ADDRESS',
    to: email,
    subject: subject,
    text: message,
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      return console.error('Error sending email:', error);
    }
    console.log(`Email sent: ${info.response}`);
  });
}

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
