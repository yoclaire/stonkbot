const AWS = require('aws-sdk');
const express = require('express');
const serverless = require('serverless-http');
const axios = require('axios');

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

AWS.config.update({ region: 'us-west-2' }); // Update to your region

// Function to retrieve the Slack bot token from AWS Secrets Manager
async function getSlackBotToken() {
    const secretsManager = new AWS.SecretsManager();
    try {
        const data = await secretsManager.getSecretValue({ SecretId: 'stonkbot/slack_bot_token' }).promise();
        if ('SecretString' in data) {
            const secret = JSON.parse(data.SecretString);
            return secret.slack_bot_token;
        } else {
            throw new Error('No SecretString in Secrets Manager response');
        }
    } catch (err) {
        console.error('Error retrieving secret:', err);
        throw err;
    }
}

// Main route that handles the /stonk command
app.post('/stonk', async (req, res) => {
    let text = req.body.text || '';
    text = text.trim();

    if (!text) {
        return res.json({
            response_type: "ephemeral",
            text: "Please provide at least one stock or crypto symbol. Usage: `/stonk AAPL BTC`"
        });
    }

    const symbols = text.split(/\s+/).map(s => s.toUpperCase());
    const uniqueSymbols = [...new Set(symbols)];
    const dataPromises = uniqueSymbols.map(symbol => getStockData(symbol));
    const results = await Promise.all(dataPromises);

    let responseText = '';

    for (let i = 0; i < uniqueSymbols.length; i++) {
        const symbol = uniqueSymbols[i];
        const data = results[i];

        if (data) {
            const { price, change, changePercent } = data;

            let emoji = '📈';
            if (change > 0) {
                emoji = '📈';
            } else if (change < 0) {
                emoji = '📉';
            } else {
                emoji = '➡️';
            }

            responseText += `${emoji} *${symbol}*: $${price.toFixed(2)} (${change >= 0 ? '+' : ''}${change.toFixed(2)}, ${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%)\n`;
        } else {
            responseText += `❓ *${symbol}*: Data not available.\n`;
        }
    }

    return res.json({
        response_type: "in_channel",
        text: responseText
    });
});

// Mock function to simulate retrieving stock or crypto data
async function getStockData(symbol) {
    const price = Math.random() * 100 + 100; // Mock price between 100 and 200
    const change = (Math.random() - 0.5) * 10; // Mock change between -5 and 5
    const changePercent = (change / price) * 100;

    return {
        price,
        change,
        changePercent
    };
}

// Function to send a message to Slack (used in scheduled tasks)
async function sendToSlack(message) {
    const slackBotToken = await getSlackBotToken();

    const url = "https://slack.com/api/chat.postMessage";
    const headers = {
        "Authorization": `Bearer ${slackBotToken}`,
        "Content-Type": "application/json"
    };
    const payload = {
        "channel": "#not-financial-advice",  // Update this channel as needed
        "text": message
    };

    axios.post(url, payload, { headers })
        .then(response => {
            if (!response.data.ok) {
                console.error('Error posting to Slack:', response.data.error);
            } else {
                console.log('Message posted to Slack:', response.data);
            }
        })
        .catch(error => console.error('Error posting to Slack:', error));
}

// Export the app for AWS Lambda
module.exports.handler = serverless(app);
