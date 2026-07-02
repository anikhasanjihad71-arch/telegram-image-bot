const { Telegraf } = require('telegraf');
const sharp = require('sharp');
const axios = require('axios');
const path = require('path');

const bot = new Telegraf(process.env.BOT_TOKEN);

// প্রাইভেট বটের সিকিউরিটি
bot.use((ctx, next) => {
    const adminIds = ['7414830213', '6972909646']; 
    if (ctx.from && adminIds.includes(ctx.from.id.toString())) {
        return next(); 
    } else {
        return ctx.reply('⛔ অ্যাক্সেস ডিনাইড! এই বটটি শুধুমাত্র অনুমোদিত ইউজারদের জন্য।');
    }
});

bot.start((ctx) => ctx.reply('স্বাগতম বস! আমাকে যেকোনো ইমেজের ডিরেক্ট লিঙ্ক দিন।'));

bot.on('text', async (ctx) => {
    const text = ctx.message.text.trim();
    
    if (text.startsWith('http://') || text.startsWith('https://')) {
        // এখানে আপনার কাস্টম ডোমেইন সরাসরি বসিয়ে দেওয়া হয়েছে
        const host = 'bot.rnexflix.top'; 
        const protocol = 'https';
        
        const cdnUrl = `${protocol}://${host}/api?url=${encodeURIComponent(text)}`;
        
        // এখানে কোড ব্লক ব্যবহার করা হয়েছে যাতে সহজে কপি করা যায়
        ctx.reply(`✅ আপনার অপ্টিমাইজড লিঙ্ক প্রস্তুত:\n\n\`${cdnUrl}\`\n\nলিঙ্কটির ওপর ট্যাপ করে কপি করে নিন।`, { parse_mode: 'Markdown' });
    } else {
        ctx.reply('দয়া করে একটি সঠিক ইমেজ ইউআরএল (URL) পাঠান।');
    }
});

module.exports = async (req, res) => {
    const { url } = req.query;

    if (url) {
        try {
            const response = await axios.get(url, { responseType: 'arraybuffer' });
            const watermarkPath = path.join(process.cwd(), 'watermark.png');

            const processedImage = await sharp(response.data)
                .composite([{ input: watermarkPath, gravity: 'southeast' }]) 
                .webp({ quality: 85 }) 
                .toBuffer();

            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            res.setHeader('Content-Type', 'image/webp');
            return res.send(processedImage);
        } catch (error) {
            return res.status(500).send('ইমেজ প্রসেস করতে সমস্যা হয়েছে।');
        }
    }

    if (req.method === 'POST') {
        try {
            await bot.handleUpdate(req.body, res);
            if (!res.headersSent) res.status(200).send('OK');
        } catch (err) {
            res.status(500).send('Error');
        }
    } else {
        res.status(200).send('Bot is running securely...');
    }
};
                
