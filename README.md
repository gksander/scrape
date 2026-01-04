# Walmart Kids Clothes Scraper

A Node.js TypeScript application that scrapes Walmart's website for kids clothes priced under $2, and sends email notifications when deals are found.

## Features

- Automated web scraping using Axios + Cheerio (lightweight HTTP requests)
- Realistic browser headers to avoid detection
- Filters products by price (under $2)
- Email notifications via Gmail using Nodemailer
- Daily cron job scheduling
- TypeScript for type safety

## Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Gmail account with App Password enabled

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Create a `.env` file in the root directory:**
   ```env
   # Gmail Configuration
   GMAIL_USER=your-email@gmail.com
   GMAIL_APP_PASSWORD=your-app-password

   # Email Recipient
   EMAIL_RECIPIENT=recipient@example.com

   # Cron Schedule (optional, defaults to daily at 9 AM)
   # Format: minute hour day month weekday
   # Example: "0 9 * * *" = 9 AM daily
   # Example: "0 0 * * *" = Midnight daily
   CRON_SCHEDULE=0 9 * * *
   ```

3. **Get Gmail App Password:**
   - Go to your Google Account settings
   - Enable 2-Step Verification
   - Go to App Passwords
   - Generate a new app password for "Mail"
   - Use this password in `GMAIL_APP_PASSWORD`

## Building

```bash
npm run build
```

## Running

**Development mode:**
```bash
npm run dev
```

**Production mode:**
```bash
npm run build
npm start
```

## Cron Schedule Format

The `CRON_SCHEDULE` environment variable uses standard cron syntax:
- `* * * * *` = Every minute
- `0 9 * * *` = Daily at 9 AM
- `0 0 * * *` = Daily at midnight
- `0 9 * * 1` = Every Monday at 9 AM

Format: `minute hour day month weekday`

## How It Works

1. The scheduler runs daily at the specified time (default: 9 AM)
2. Axios makes an HTTP request to Walmart's search page for kids clothes under $2
3. Cheerio parses the HTML and extracts product data (name, price, URL)
4. If products are found, an HTML email is sent with the results
5. If no products are found, the process completes without sending an email

## Project Structure

```
├── src/
│   ├── scraper.ts    # Axios + Cheerio scraping logic
│   ├── email.ts      # Nodemailer email service
│   ├── scheduler.ts  # Cron job setup
│   └── index.ts      # Application entry point
├── dist/             # Compiled JavaScript (generated)
├── package.json
├── tsconfig.json
└── README.md
```

## Bot Detection & CAPTCHA

The scraper uses Axios with realistic browser headers to avoid detection. However, Walmart may still show CAPTCHA pages. If you encounter a "Robot or human?" page:

1. **Use a residential proxy**:
   - Residential IPs are less likely to trigger bot detection
   - Configure proxy in axios request options

2. **Add delays between requests**:
   - Add delays before making requests
   - Space out your scraping attempts

3. **Try accessing Walmart manually first**:
   - Sometimes visiting the site in a browser first helps establish a session
   - Clear cookies/cache if needed

4. **Use rotating user agents**:
   - The scraper uses a realistic user agent, but you can rotate them

5. **Test the scraper**:
   ```bash
   npm run test-scraper
   ```
   This runs the scraper without the cron scheduler or email sending

**Note:** Walmart may load content dynamically with JavaScript. If axios + cheerio doesn't capture all products, you may need to use a headless browser (Puppeteer) or check if Walmart has an API.

## Troubleshooting

- **Email not sending:** Verify your Gmail App Password is correct and 2-Step Verification is enabled
- **No products found:** Walmart's website structure may have changed, or content may be loaded dynamically with JavaScript. Check the selectors in `scraper.ts`
- **Blocked/CAPTCHA page:** See "Bot Detection & CAPTCHA" section above
- **Module not found errors:** Run `npm install` to install `axios` and `cheerio`
- **403/429 errors:** Walmart is blocking your requests. Try using a proxy or different IP address

## License

ISC

