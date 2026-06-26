require('dotenv').config();
const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.get('/', (req, res) => {
  res.send('TradeBot is running!');
});

const CRYPTO_LIST = ['BTC','ETH','BNB','SOL','XRP','ADA','DOGE','TON','TRX','AVAX','MATIC','DOT','LTC','SHIB','BCH'];

const COINGECKO_IDS = {
  BTC: 'bitcoin', ETH: 'ethereum', BNB: 'binancecoin',
  SOL: 'solana', XRP: 'ripple', ADA: 'cardano',
  DOGE: 'dogecoin', TON: 'the-open-network', TRX: 'tron',
  AVAX: 'avalanche-2', MATIC: 'matic-network', DOT: 'polkadot',
  LTC: 'litecoin', SHIB: 'shiba-inu', BCH: 'bitcoin-cash'
};

function isCrypto(ticker) {
  return CRYPTO_LIST.includes(ticker.toUpperCase());
}

async function getCryptoData(symbol) {
  const idMap = {
    BTC: 'bitcoin', ETH: 'ethereum', BNB: 'binance-coin',
    SOL: 'solana', XRP: 'xrp', ADA: 'cardano',
    DOGE: 'dogecoin', TON: 'toncoin', TRX: 'tron',
    AVAX: 'avalanche', MATIC: 'polygon', DOT: 'polkadot',
    LTC: 'litecoin', SHIB: 'shiba-inu', BCH: 'bitcoin-cash'
  };
  const id = idMap[symbol.toUpperCase()];
  if (!id) throw new Error('Unknown crypto');
  
  const [priceRes, historyRes] = await Promise.all([
    axios.get(`https://api.coincap.io/v2/assets/${id}`),
    axios.get(`https://api.coincap.io/v2/assets/${id}/history?interval=d1`)
  ]);
  
  const price = parseFloat(priceRes.data.data.priceUsd);
  const closes = historyRes.data.data.slice(-20).map(p => parseFloat(p.priceUsd)).reverse();
  return { price, closes, symbol };
}

async function getStockData(symbol) {
  const apiKey = process.env.ALPHA_VANTAGE_KEY;
  const res = await axios.get(
    `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${symbol}&apikey=${apiKey}`
  );
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
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i - 1] - closes[i];
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
  return closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
}

async function getAISignal(symbol, price, rsi, ma7, ma14) {
  const prompt = `You are a trading analyst. Analyze this asset and give a clear signal.

Asset: ${symbol}
Current Price: $${price.toFixed(2)}
RSI (14): ${rsi}
MA7: $${ma7?.toFixed(2) || 'N/A'}
MA14: $${ma14?.toFixed(2) || 'N/A'}

Respond in this exact format:
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

  return `📊 *${symbol} Analysis*\n\n💰 Price: $${price.toFixed(2)}\n📈 RSI: ${rsi}\n📉 MA7: $${ma7?.toFixed(2) || 'N/A'}\n📉 MA14: $${ma14?.toFixed(2) || 'N/A'}\n\n🤖 AI Signal:\n${aiSignal}`;
}

app.post('/webhook', async (req, res) => {
  const userMessage = req.body.Body?.trim().toUpperCase();
  console.log(`Message: ${userMessage}`);
  let replyText = '';
  try {
    replyText = await analyzeAsset(userMessage);
  } catch (err) {
    console.error('Error:', err.message, err.response?.data);
    replyText = `Sorry, I couldn't analyze *${userMessage}*. Try: BTC, ETH, AAPL, TSLA.`;
  }
  const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${replyText}</Message></Response>`;
  res.type('text/xml');
  res.send(twiml);
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`TradeBot running on port ${PORT}`));
