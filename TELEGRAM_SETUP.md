# Telegram Submission Setup

Submissions are sent to Telegram through the Netlify Function at:

```txt
/api/submit-application
```

The Telegram bot token and chat ID must stay in Netlify environment variables. Do not put them in frontend files.

## Required Netlify Environment Variables

```txt
TELEGRAM_BOT_TOKEN=123456789:your_bot_token
TELEGRAM_CHAT_ID=123456789
```

## Netlify Drop

Redeploy the whole project folder to your existing Netlify site, not just `index.html`.

Required files/folders:

- `index.html`
- `styles.css`
- `script.js`
- `assets/`
- `netlify.toml`
- `netlify/functions/`
- `server/`
- `package.json`

Do not deploy a real `.env` file. Netlify should provide the variables from the site dashboard.

## Live Test

After redeploying, open the live Netlify URL, fill out the form, and submit it. A successful submission should show the success message on the website and send a Telegram message to the chat configured by `TELEGRAM_CHAT_ID`.

## Troubleshooting

If the website shows a submission error:

- Make sure the latest full project folder was redeployed, including `netlify/functions/` and `server/`.
- Confirm `TELEGRAM_BOT_TOKEN` is copied exactly from BotFather.
- Open Telegram and send `/start` to your bot before testing.
- Confirm `TELEGRAM_CHAT_ID` belongs to the chat where the bot is allowed to send messages.
