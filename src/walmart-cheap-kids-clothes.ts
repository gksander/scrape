import "dotenv/config";
import axios from "axios";
import * as cheerio from "cheerio";
import * as fs from "fs";
import * as path from "path";
import nodemailer, { Transporter } from "nodemailer";

interface Product {
  name: string;
  price: string;
  url: string;
  imageUrl?: string;
}

function checkIfBlocked(html: string, url: string): boolean {
  // Check for blocked page indicators
  if (
    url.includes("/blocked") ||
    html.includes("Robot or human") ||
    html.includes("PRESS & HOLD") ||
    html.includes("Activate and hold the button") ||
    html.includes("walmart.com/blocked")
  ) {
    return true;
  }
  return false;
}

export async function scrapeWalmartKidsClothes(): Promise<Product[]> {
  try {
    // Construct Walmart search URL for kids clothes under $2
    const searchUrl =
      "https://www.walmart.com/search?q=kids+clothes&max_price=2";

    console.log(`Fetching: ${searchUrl}`);

    // Make HTTP request with realistic browser headers
    const response = await axios.get(searchUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        Connection: "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Cache-Control": "max-age=0",
        Referer: "https://www.walmart.com/",
      },
      timeout: 30000,
      validateStatus: (status: number) => status < 500, // Accept any status < 500
    });

    const html = response.data;
    const finalUrl = response.request.res.responseUrl || searchUrl;

    // Check if we got blocked
    if (checkIfBlocked(html, finalUrl)) {
      throw new Error(
        "Walmart blocked the request. The page shows a CAPTCHA/bot detection page.\n" +
          "Possible solutions:\n" +
          "1. Use a residential proxy\n" +
          "2. Add delays between requests\n" +
          "3. Use a different IP address\n" +
          "4. Try accessing the site manually first to establish a session",
      );
    }

    // Parse HTML with Cheerio
    const $ = cheerio.load(html);
    const products: Product[] = [];

    console.log("Extracting Next.js data from __NEXT_DATA__ script tag...");

    // Find the __NEXT_DATA__ script tag
    const nextDataScript = $("#__NEXT_DATA__");

    if (nextDataScript.length === 0) {
      throw new Error(
        "Could not find __NEXT_DATA__ script tag. Walmart may have changed their page structure.",
      );
    }

    // Extract and parse the JSON data
    const nextDataText = nextDataScript.html();
    if (!nextDataText) {
      throw new Error("__NEXT_DATA__ script tag is empty");
    }

    let nextData: any;
    try {
      nextData = JSON.parse(nextDataText);
      console.log("Successfully parsed __NEXT_DATA__ JSON");
    } catch (parseError) {
      throw new Error(`Failed to parse __NEXT_DATA__ JSON: ${parseError}`);
    }

    // Store the full JSON for inspection
    console.log("Next.js data structure keys:", Object.keys(nextData));
    if (nextData.props) {
      console.log("Props keys:", Object.keys(nextData.props));
      if (nextData.props.pageProps) {
        console.log("PageProps keys:", Object.keys(nextData.props.pageProps));
      }
    }

    // Save the full JSON to a file for inspection
    const jsonFilePath = path.join(process.cwd(), "walmart-next-data.json");
    try {
      fs.writeFileSync(jsonFilePath, JSON.stringify(nextData, null, 2));
      console.log(`Full Next.js data saved to: ${jsonFilePath}`);
    } catch (writeError) {
      console.warn("Could not save JSON file:", writeError);
    }

    console.log("Extracting product data from JSON...");

    // Function to recursively search for products in the JSON structure
    function findProductsInData(data: any, path: string = ""): Product[] {
      const found: Product[] = [];

      if (!data || typeof data !== "object") {
        return found;
      }

      // Look for common product data structures
      if (Array.isArray(data)) {
        for (let i = 0; i < data.length; i++) {
          found.push(...findProductsInData(data[i], `${path}[${i}]`));
        }
      } else {
        // Check if this object looks like a product
        const hasName = data.title || data.name || data.productName;
        const hasPrice = data.price || data.currentPrice || data.priceInfo;
        const hasUrl =
          data.productUrl || data.url || data.canonicalUrl || data.usItemId;

        if (hasName && hasPrice) {
          let name = data.title || data.name || data.productName || "";
          let price = "";
          let url = "";
          let imageUrl = "";

          // Extract price
          if (typeof data.price === "number") {
            price = `$${data.price.toFixed(2)}`;
          } else if (typeof data.price === "string") {
            price = data.price;
          } else if (data.currentPrice) {
            if (typeof data.currentPrice === "number") {
              price = `$${data.currentPrice.toFixed(2)}`;
            } else if (data.currentPrice.price) {
              price =
                typeof data.currentPrice.price === "number"
                  ? `$${data.currentPrice.price.toFixed(2)}`
                  : data.currentPrice.price;
            } else {
              price = String(data.currentPrice);
            }
          } else if (data.priceInfo) {
            if (data.priceInfo.currentPrice) {
              const currentPrice = data.priceInfo.currentPrice;
              price =
                typeof currentPrice === "number"
                  ? `$${currentPrice.toFixed(2)}`
                  : String(currentPrice);
            }
          }

          // Extract URL
          if (data.productUrl) {
            url = data.productUrl;
          } else if (data.url) {
            url = data.url;
          } else if (data.canonicalUrl) {
            url = data.canonicalUrl;
          } else if (data.usItemId) {
            url = `https://www.walmart.com/ip/${data.usItemId}`;
          }

          // Make URL absolute if relative
          if (url && !url.startsWith("http")) {
            url = `https://www.walmart.com${url.startsWith("/") ? url : "/" + url}`;
          }

          // Extract image URL
          if (data.imageUrl) {
            imageUrl = data.imageUrl;
          } else if (data.image) {
            imageUrl =
              typeof data.image === "string"
                ? data.image
                : data.image.url || data.image.src || "";
          } else if (data.thumbnail) {
            imageUrl =
              typeof data.thumbnail === "string"
                ? data.thumbnail
                : data.thumbnail.url || data.thumbnail.src || "";
          } else if (data.thumbnailUrl) {
            imageUrl = data.thumbnailUrl;
          } else if (data.primaryImage) {
            imageUrl =
              typeof data.primaryImage === "string"
                ? data.primaryImage
                : data.primaryImage.url || data.primaryImage.src || "";
          } else if (data.productImage) {
            imageUrl =
              typeof data.productImage === "string"
                ? data.productImage
                : data.productImage.url || data.productImage.src || "";
          } else if (
            data.images &&
            Array.isArray(data.images) &&
            data.images.length > 0
          ) {
            // Try to get the first image from an images array
            const firstImage = data.images[0];
            imageUrl =
              typeof firstImage === "string"
                ? firstImage
                : firstImage.url || firstImage.src || "";
          }

          // Make image URL absolute if relative
          if (imageUrl && !imageUrl.startsWith("http")) {
            imageUrl = `https://${imageUrl.startsWith("//") ? imageUrl.slice(2) : imageUrl.startsWith("/") ? "i5.walmartimages.com" + imageUrl : imageUrl}`;
          }

          // Extract price value and check if under $2
          const priceMatch = price.match(/\$?([\d.]+)/);
          if (priceMatch) {
            const priceValue = parseFloat(priceMatch[1]);
            if (priceValue < 2 && name && url) {
              found.push({
                name: String(name),
                price,
                url,
                imageUrl: imageUrl || undefined,
              });
            }
          }
        }

        // Recursively search nested objects
        for (const key in data) {
          if (data.hasOwnProperty(key)) {
            found.push(
              ...findProductsInData(data[key], path ? `${path}.${key}` : key),
            );
          }
        }
      }

      return found;
    }

    // Search for products in the Next.js data
    const foundProducts = findProductsInData(nextData);

    // Also try specific paths that are common in Next.js apps
    const searchPaths = [
      "props.pageProps.initialData.searchResult.itemStacks",
      "props.pageProps.initialData.searchResult.items",
      "props.pageProps.initialData.products",
      "props.pageProps.initialData.itemStacks",
      "props.pageProps.initialData.items",
      "props.pageProps.searchResult.itemStacks",
      "props.pageProps.searchResult.items",
      "props.pageProps.products",
    ];

    for (const searchPath of searchPaths) {
      const pathParts = searchPath.split(".");
      let current: any = nextData;
      let found = true;

      for (const part of pathParts) {
        if (current && typeof current === "object" && part in current) {
          current = current[part];
        } else {
          found = false;
          break;
        }
      }

      if (found && current) {
        console.log(`Found data at path: ${searchPath}`);
        const pathProducts = findProductsInData(current, searchPath);
        foundProducts.push(...pathProducts);
      }
    }

    // Remove duplicates based on URL
    const uniqueProducts = foundProducts.filter(
      (product, index, self) =>
        index === self.findIndex((p) => p.url === product.url),
    );

    products.push(...uniqueProducts);

    console.log(`Found ${products.length} products under $2`);
    return products;
  } catch (err: unknown) {
    // Check if it's an axios error
    if (
      err &&
      typeof err === "object" &&
      "isAxiosError" in err &&
      typeof (err as { isAxiosError?: unknown }).isAxiosError === "function"
    ) {
      const axiosError = err as {
        response?: { status: number; statusText: string };
        request?: unknown;
      };
      if (axiosError.response) {
        console.error(
          `HTTP Error: ${axiosError.response.status} - ${axiosError.response.statusText}`,
        );
        if (
          axiosError.response.status === 403 ||
          axiosError.response.status === 429
        ) {
          throw new Error(
            "Walmart blocked the request (403/429). Try using a proxy or adding delays.",
          );
        }
      } else if (axiosError.request) {
        throw new Error(
          "No response received from Walmart. Check your connection.",
        );
      }
    }
    if (err instanceof Error) {
      console.error("Error scraping Walmart:", err.message);
      throw err;
    }
    throw new Error("Unknown error occurred while scraping");
  }
}

async function sendEmail(products: Product[]): Promise<void> {
  const gmailUser = process.env.GMAIL_USER;
  const gmailPassword = process.env.GMAIL_APP_PASSWORD;
  const recipient = process.env.EMAIL_RECIPIENT;

  if (!gmailUser || !gmailPassword || !recipient) {
    throw new Error(
      "Missing email configuration. Please check GMAIL_USER, GMAIL_APP_PASSWORD, and EMAIL_RECIPIENT environment variables.",
    );
  }

  // Create transporter
  const transporter: Transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: gmailUser,
      pass: gmailPassword,
    },
  });

  // Format products into HTML email
  const productsHtml = products
    .map(
      (product, index) => `
    <tr style="border-bottom: 1px solid #eee;">
      <td style="padding: 10px;">
        <table style="width: 100%;">
          <tr>
            ${
              product.imageUrl
                ? `<td style="width: 120px; vertical-align: top; padding-right: 15px;">
              <img src="${product.imageUrl}" alt="${escapeHtml(product.name)}" style="max-width: 120px; height: auto; border-radius: 4px;" />
            </td>`
                : ""
            }
            <td style="vertical-align: top;">
              <strong>${index + 1}. ${escapeHtml(product.name)}</strong><br>
              <span style="color: #e31837; font-size: 18px; font-weight: bold;">${escapeHtml(product.price)}</span><br>
              <a href="${product.url}" style="color: #0066cc; text-decoration: none;">View Product →</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `,
    )
    .join("");

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #004c91; color: white; padding: 20px; text-align: center; }
        .content { background-color: #f9f9f9; padding: 20px; }
        .product-list { width: 100%; border-collapse: collapse; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🎉 Walmart Kids Clothes Deals Found!</h1>
        </div>
        <div class="content">
          <p>Found <strong>${products.length}</strong> kids clothes item(s) under $2:</p>
          <table class="product-list">
            ${productsHtml}
          </table>
        </div>
        <div class="footer">
          <p>This email was sent automatically by Walmart Scraper</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const textContent = `Walmart Kids Clothes Deals Found!\n\nFound ${products.length} item(s) under $2:\n\n${products.map((p, i) => `${i + 1}. ${p.name} - ${p.price}\n   ${p.url}`).join("\n\n")}`;

  // Send email
  const mailOptions = {
    from: gmailUser,
    to: recipient,
    subject: `🎉 Found ${products.length} Kids Clothes Deal(s) Under $2 at Walmart!`,
    text: textContent,
    html: htmlContent,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`Email sent successfully: ${info.messageId}`);
  } catch (error) {
    console.error("Error sending email:", error);
    throw error;
  }
}

function escapeHtml(text: string): string {
  const map: { [key: string]: string } = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

// Main execution
async function main() {
  const shouldSendEmail = process.env.SEND_EMAIL === "true";

  // Only require email environment variables if SEND_EMAIL is true
  if (shouldSendEmail) {
    if (
      !process.env.GMAIL_USER ||
      !process.env.GMAIL_APP_PASSWORD ||
      !process.env.EMAIL_RECIPIENT
    ) {
      console.error("Error: Missing required environment variables for email!");
      console.error("Please ensure the following are set:");
      console.error("  - GMAIL_USER");
      console.error("  - GMAIL_APP_PASSWORD");
      console.error("  - EMAIL_RECIPIENT");
      console.error("\nFor local development, set these in your .env file");
      console.error("For GitHub Actions, set these as repository secrets");
      console.error("\nOr run without SEND_EMAIL=true to just print results");
      process.exit(1);
    }
  }

  console.log("Walmart Kids Clothes Scraper");
  console.log("============================");
  console.log(`Started at: ${new Date().toISOString()}`);
  console.log(`Email sending: ${shouldSendEmail ? "ENABLED" : "DISABLED"}\n`);

  try {
    const products = await scrapeWalmartKidsClothes();

    if (products.length > 0) {
      console.log(`\nFound ${products.length} product(s) under $2:\n`);

      // Always print results
      products.forEach((product, index) => {
        console.log(`${index + 1}. ${product.name}`);
        console.log(`   Price: ${product.price}`);
        console.log(`   URL: ${product.url}`);
        if (product.imageUrl) {
          console.log(`   Image: ${product.imageUrl}`);
        }
        console.log("");
      });

      // Conditionally send email
      if (shouldSendEmail) {
        console.log("Sending email...");
        await sendEmail(products);
        console.log("Email sent successfully!");
      } else {
        console.log("(Email not sent. Set SEND_EMAIL=true to send email)");
      }
    } else {
      console.log("No products found under $2.");
    }
  } catch (error) {
    console.error("Error during scrape:", error);
    process.exit(1);
  }
}

main();
