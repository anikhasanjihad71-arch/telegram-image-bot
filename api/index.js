const { Telegraf } = require('telegraf');
const sharp = require('sharp');
const axios = require('axios');
const path = require('path');

if (!process.env.BOT_TOKEN) {
    throw new Error("BOT_TOKEN is missing");
}

const bot = new Telegraf(process.env.BOT_TOKEN);

const adminIds = ['7414830213', '6972909646'];

bot.use((ctx, next) => {
    if (ctx.from && adminIds.includes(ctx.from.id.toString())) {
        return next();
    }
    return ctx.reply('⛔ অ্যাক্সেস ডিনাইড!');
});

bot.start((ctx) =>
    ctx.reply('👋 স্বাগতম! আমাকে যেকোনো ডিরেক্ট ইমেজ লিংক পাঠান।')
);

bot.on('text', async (ctx) => {
    const text = ctx.message.text.trim();

    if (!/^https?:\/\//i.test(text)) {
        return ctx.reply('❌ একটি সঠিক Image URL পাঠান।');
    }

    const cdnUrl = `https://bot.rnexflix.top/api?url=${encodeURIComponent(text)}`;

    await ctx.reply(
        `✅ আপনার অপ্টিমাইজড লিঙ্ক:\n\n\`${cdnUrl}\``,
        { parse_mode: 'Markdown' }
    );
});

module.exports = async (req, res) => {
    const { url } = req.query;

    if (url) {
        try {
            new URL(url);

            const response = await axios.get(url, {
                responseType: 'arraybuffer',
                timeout: 10000,
                maxRedirects: 5
            });

            const contentType = response.headers["content-type"] || "";

            if (!contentType.startsWith("image/")) {
                return res.status(400).send("Invalid image URL");
            }

            const watermarkPath = path.join(process.cwd(), "watermark.png");

            const image = sharp(response.data);
            const metadata = await image.metadata();

            const processed = await image
                .resize({
                    width: 1200,
                    withoutEnlargement: true
                })
                .composite([
                    {
                        input: watermarkPath,
                        gravity: "southeast"
                    }
                ])
                .webp({
                    quality: 80,
                    effort: 6
                })
                .toBuffer();

            res.setHeader("Content-Type", "image/webp");
            res.setHeader(
                "Cache-Control",
                "public, max-age=31536000, immutable"
            );

            return res.send(processed);
        } catch (err) {
            console.error(err);
            return res.status(500).send("Image processing failed.");
        }
    }

    if (req.method === "POST") {
        try {
            await bot.handleUpdate(req.body, res);

            if (!res.headersSent) {
                res.status(200).send("OK");
            }
        } catch (err) {
            console.error(err);
            res.status(500).send("Webhook Error");
        }
    } else {
        res.status(200).send("RNexFlix Image API Running ✅");
    }
};
