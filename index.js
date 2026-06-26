require('dotenv').config();
const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.get('/', (req, res) => {
  res.send('TradeBot is running!');
});

const CRYPTO_SYMBOLS = ['BTC','ETH','BNB','SOL','XRP','ADA','DOGE','TON','TRX','AVAX','MATIC','DOT','LTC','SHIB','BCH'];

function isCrypto(ticker) {
  return CRYPTO_SYMBOLS.includes(ticker.toUpperCase());
}

async function getCryptoData(symbol) {
  const id = symbol.toLowerCase();
  const res = await axios.get(
    `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=20&interval=daily`
  );
  const closes = res.data.prices.map(p => p[1]);
  const price = closes[closes.length - 1];
  return { price, closes: closes.reverse(), symbol };
}

async function getStockData(symbol) {
  const apiKey = process.env.ALPHA_VANTAGE_KEY;
  const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${symbol}&apikey=${apiKey}`;
  const res = await axios.get(url);
  const timeSeries = res.data['Time Series (Daily)'];
  if (!timeSeries) throw new Error('Stock not found');
  const dates = Object.keys(timeSeries).slice(0, 20);
  const closes = dates.map(d => parseFloat(timeSeries[d]['4. close']));
  const price = closes[0];
  return { price, closes, symbol };
}

function calculateRSI(closes) {
  const period = 14;
  if (closes.length < period + 1) return null;
  const reversed = [...closes].reverse();
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = reversed[i] - reversed[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return Math.round(100 - (100 / (1 + rs)));
}

function calculateMA(closes, period) {
  if (closes.length < period) return null;
  const slice = closes.slice(0, period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

async function getAISignal(symbol, price, rsi, ma7, ma14) {
  const prompt = `You are a trading analyst. Analyze this asset and give a clear signal.

Asset: ${symbol}
Current Price: $${price.toFixed(2)}
RSI (14): ${rsi}
MA7: $${ma7?.toFixed(2) || 'N/A'}
MA14: $${ma14?.toFixed(2) || 'N/A'}

Give a response in this exact format:
SIGNAL: [BUY/SELL/HOLD]
REASON: [1-2 sentence explanation]
RISK: [Low/Medium/High]`;

  const response = await axios.post('https://api.anthropic.com/v1/messages', {
    model: 'claude-sonnet-4-6',
    max_tokens: 200,
    messages: [{ role: 'user', content: prompt }]
  }, {
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    }
  });

  return response.data.content[0].text;
}

async function analyzeAsset(ticker) {
  const symbol = ticker.toUpperCase();
  let data;

  if (isCrypto(symbol)) {
    data = await getCryptoData(symbol);
  } else {
    data = await getStockData(symbol);
  }

  const { price, closes } = data;
  const rsi = calculateRSI(closes);
  const ma7 = calculateMA(closes, 7);
  const ma14 = calculateMA(closes, 14);
  const aiSignal = await getAISignal(symbol, price, rsi, ma7, ma14);

  return `📊 *${symbol} Analysis*

💰 Price: $${price.toFixed(2)}
📈 RSI: ${rsi}
📉 MA7: $${ma7?.toFixed(2) || 'N/A'}
📉 MA14: $${ma14?.toFixed(2) || 'N/A'}

🤖 AI Analysis:
${aiSignal}`;
}

app.post('/webhook', async (req, res) => {
  const userMessage = req.body.Body?.trim().toUpperCase();
  console.log(`Message: ${userMessage}`);

  let replyText = '';

  try {
    replyText = await analyzeAsset(userMessage);
  } catch (err) {
    console.error(err.message);
    replyText = `Sorry, I couldn't analyze *${userMessage}*. Try a valid ticker like BTC, ETH, AAPL, TSLA.`;
  }

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${replyText}</Message>
</Response>`;

  res.type('text/xml');
  res.send(twiml);
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`TradeBot running on port ${PORT}`);
});
