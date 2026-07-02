const { Telegraf } = require("telegraf");
const sharp = require("sharp");
const axios = require("axios");
const path = require("path");
const fs = require("fs");

if (!process.env.BOT_TOKEN) {
    throw new Error("BOT_TOKEN environment variable is missing.");
}

const bot = new Telegraf(process.env.BOT_TOKEN);

const adminIds = ["7414830213", "6972909646"];
const watermarkPath = path.join(process.cwd(), "watermark.png");

const MAX_DOWNLOAD_BYTES = 15 * 1024 * 1024;

// ---------------- URL Validation ----------------

function isValidUrl(str) {
    try {
        const u = new URL(str);
        return u.protocol === "http:" || u.protocol === "https:";
    } catch {
        return false;
    }
}

function isBlockedHost(hostname) {
    const blocked = [
        /^localhost$/i,
        /^127\./,
        /^0\.0\.0\.0$/,
        /^10\./,
        /^172\.(1[6-9]|2\d|3[0-1])\./,
        /^192\.168\./,
        /^169\.254\./,
        /^::1$/,
        /^\[::1\]$/
    ];

    return blocked.some((r) => r.test(hostname));
}

// ---------------- Telegram Security ----------------

bot.use((ctx, next) => {
    const id = ctx.from?.id?.toString();

    if (id && adminIds.includes(id)) {
        return next();
    }

    return ctx.reply("⛔ Access Denied!");
});

// ---------------- Start Command ----------------

bot.start((ctx) => {
    ctx.reply(
        "👋 Welcome!\n\nআমাকে যেকোনো Direct Image URL পাঠান।"
    );
});

// ---------------- Text Handler ----------------

bot.on("text", async (ctx) => {
    const text = ctx.message.text.trim();

    if (!isValidUrl(text)) {
        return ctx.reply("❌ সঠিক Image URL পাঠান।");
    }

    const target = new URL(text);

    if (isBlockedHost(target.hostname)) {
        return ctx.reply("❌ এই URL সমর্থিত নয়।");
    }

    const cdnUrl =
        "https://bot.rnexflix.top/api?url=" +
        encodeURIComponent(text);

    await ctx.reply(
        `✅ আপনার Optimized Link:\n\n\`${cdnUrl}\``,
        {
            parse_mode: "Markdown"
        }
    );
});

// ---------------- Telegram Error ----------------

bot.catch((err, ctx) => {
    console.error(
        `Telegram Error (${ctx.update?.update_id})`,
        err
    );
});
// ---------------- Fetch Image ----------------

async function fetchImage(url) {
    const response = await axios.get(url, {
        responseType: "arraybuffer",
        timeout: 10000,
        maxContentLength: MAX_DOWNLOAD_BYTES,
        maxBodyLength: MAX_DOWNLOAD_BYTES,
        headers: {
            "User-Agent": "Mozilla/5.0 (compatible; RNexFlixBot/1.0)",
            "Accept": "image/*"
        },
        validateStatus: (status) => status === 200
    });

    const contentType = response.headers["content-type"] || "";

    if (!contentType.startsWith("image/")) {
        throw new Error("URL does not point to an image.");
    }

    return response.data;
}

// ---------------- Process Image ----------------

async function processImage(inputBuffer) {
    // Resize image first
    const resizedBuffer = await sharp(inputBuffer, {
        limitInputPixels: 50000000
    })
        .resize({
            width: 1200,
            withoutEnlargement: true
        })
        .toBuffer();

    const image = sharp(resizedBuffer);
    const meta = await image.metadata();

    let pipeline = image;

    if (fs.existsSync(watermarkPath)) {
        // Watermark = 8% of image width
        const watermarkWidth = Math.max(
            40,
            Math.round(meta.width * 0.08)
        );

        const watermark = await sharp(watermarkPath)
            .resize({
                width: watermarkWidth,
                withoutEnlargement: true
            })
            .png()
            .toBuffer();

        pipeline = pipeline.composite([
            {
                input: watermark,
                gravity: "southeast"
            }
        ]);
    }

    return pipeline
        .webp({
            quality: 80,
            effort: 6
        })
        .toBuffer();
}

// ---------------- Image API ----------------

async function handleImageRequest(req, res) {
    const rawUrl = Array.isArray(req.query.url)
        ? req.query.url[0]
        : req.query.url;

    if (!isValidUrl(rawUrl)) {
        return res.status(400).send("Invalid URL");
    }

    const target = new URL(rawUrl);

    if (isBlockedHost(target.hostname)) {
        return res.status(400).send("Blocked Host");
    }

    try {
        const input = await fetchImage(rawUrl);
        const output = await processImage(input);

        res.setHeader("Content-Type", "image/webp");
        res.setHeader(
            "Cache-Control",
            "public, max-age=31536000, immutable"
        );

        return res.send(output);
    } catch (err) {
        console.error(err);
        return res.status(500).send(err.message);
    }
}

// ---------------- Export ----------------

module.exports = async (req, res) => {
    try {
        if (req.query.url) {
            return handleImageRequest(req, res);
        }

        if (req.method === "POST") {
            await bot.handleUpdate(req.body, res);

            if (!res.headersSent) {
                res.status(200).send("OK");
            }

            return;
        }

        res.status(200).send("RNexFlix Image API Running ✅");
    } catch (err) {
        console.error(err);

        if (!res.headersSent) {
            res.status(500).send("Internal Server Error");
        }
    }
};
