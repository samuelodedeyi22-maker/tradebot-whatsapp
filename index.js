require('dotenv').config();
const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.get('/', (req, res) => {
  res.send('TradeBot is running!');
});

app.post('/webhook', async (req, res) => {
  const userMessage = req.body.Body?.trim().toUpperCase();
  const userPhone = req.body.From;

  console.log(`Message from ${userPhone}: ${userMessage}`);

  let replyText = '';

  try {
    replyText = await analyzeAsset(userMessage);
  } catch (err) {
    console.error(err);
    replyText = 'Sorry, something went wrong. Please try again.';
  }

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${replyText}</Message>
</Response>`;

  res.type('text/xml');
  res.send(twiml);
});

async function analyzeAsset(ticker) {
  return `Analyzing ${ticker}... (market data coming soon)`;
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`TradeBot running on port ${PORT}`);
});
