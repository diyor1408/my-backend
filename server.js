const express = require('express');
const axios = require('axios');
const cors = require('cors');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();

// --- MIDDLEWARE ---
app.use(cors());
app.use(express.json());

// Fayllar uchun papkani yaratish
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
app.use('/uploads', express.static(uploadDir));

// Rasmlarni brauzerda ko'rish uchun ruxsat
app.use('/uploads', express.static(uploadDir));

// --- 1. MONGODB ULANISHI ---
const MONGO_URI = "mongodb+srv://diyor:diyor1408@cluster0.esm705z.mongodb.net/drmed?retryWrites=true&w=majority";
mongoose.connect(MONGO_URI)
    .then(() => console.log("🚀 Baza ulandi va Maqolalar uchun tayyor!"))
    .catch((err) => console.log("❌ Baza xatosi:", err));

// --- 2. MODELLAR ---
const User = mongoose.model('User', new mongoose.Schema({
    name: String,
    email: { type: String, unique: true },
    password: { type: String, required: true },
    date: { type: Date, default: Date.now }
}));

const Article = mongoose.model('Article', new mongoose.Schema({
    title: { type: String, required: true },
    content: { type: String, required: true },
    image: { type: String, required: true },    // Karta rasmi uchun
    pdfFile: { type: String, required: true },  // TUGMA OCHADIGAN FAYL UCHUN
    date: { type: Date, default: Date.now }
}));

// --- 3. MULTER SOZLAMASI ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        cb(null, Date.now() + "-" + file.originalname);
    }
});
const upload = multer({ storage: storage });

// --- 4. API YO'LLARI ---

// A. Registratsiya
app.post('/api/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        const newUser = new User({ name, email, password });
        await newUser.save();

        await axios.post(`https://api.telegram.org/bot8349197826:AAGNLSYEnwmD_Qp_27ONORV3klC-xOiBz2A/sendMessage`, {
            chat_id: "-1003779912591",
            text: `🚀 <b>Yangi foydalanuvchi!</b>\n👤 Ism: ${name}\n📧 Email: ${email}`,
            parse_mode: 'HTML'
        });

        res.status(200).json({ message: "OK" });
    } catch (err) {
        res.status(500).json({ error: "Xatolik yuz berdi" });
    }
});

// B. Universal Maqola yuklash (Fayl YOKI Link)
// Maqola yuklash API qismi (Buni server.js dagi eskisini o'rniga qo'ying)
app.post('/api/articles', upload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'pdfFile', maxCount: 1 }
]), async (req, res) => {
    try {
        const { title, content } = req.body;

        // Xatolikni oldini olish uchun tekshiramiz
        if (!req.files || !req.files['image'] || !req.files['pdfFile']) {
            return res.status(400).json({ error: "Rasm va PDF fayl yuklanishi shart!" });
        }

        const host = req.get('host');
        const protocol = req.protocol;
        const imageUrl = protocol + "://" + host + "/uploads/" + req.files['image'][0].filename;
        const fileUrl = protocol + "://" + host + "/uploads/" + req.files['pdfFile'][0].filename;;

        const newArticle = new Article({
            title,
            content,
            image: imageUrl,
            pdfFile: fileUrl
        });

        await newArticle.save();
        res.status(200).json({ message: "Muvaffaqiyatli saqlandi!" });
    } catch (err) {
        console.error("Server xatosi:", err);
        res.status(500).json({ error: "Serverda saqlashda xato" });
    }
});

// C. Maqolalarni olish
app.get('/api/articles', async (req, res) => {
    try {
        const articles = await Article.find().sort({ date: -1 });
        res.json(articles);
    } catch (err) {
        res.status(500).send(err);
    }
});

// D. Foydalanuvchilarni olish
app.get('/api/users', async (req, res) => {
    try {
        const users = await User.find().sort({ date: -1 });
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: "Xato" });
    }
});

// Foydalanuvchini o'chirish API
app.delete('/api/users/:id', async (req, res) => {
    try {
        const userId = req.params.id;
        await User.findByIdAndDelete(userId);
        res.status(200).json({ message: "Foydalanuvchi muvaffaqiyatli o'chirildi!" });
    } catch (err) {
        console.error("Foydalanuvchini o'chirishda xato:", err);
        res.status(500).json({ error: "Serverda o'chirish imkoni bo'lmadi" });
    }
});

// E. Maqolani o'chirish
app.delete('/api/articles/:id', async (req, res) => {
    try {
        await Article.findByIdAndDelete(req.params.id);
        res.json({ message: "O'chirildi" });
    } catch (err) {
        res.status(500).send(err);
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log("Server " + PORT + "-da ishga tushdi");
});

// 1. Video Modeli
const Video = mongoose.model('Video', new mongoose.Schema({
    title: { type: String, required: true },
    url: { type: String, required: true }, // YouTube linki
    date: { type: Date, default: Date.now }
}));

// 2. Video yuklash API
app.post('/api/videos', async (req, res) => {
    try {
        const { title, url } = req.body;
        // YouTube linkini "embed" formatiga o'tkazish funksiyasi (agar kerak bo'lsa)
        const embedUrl = url.replace("watch?v=", "embed/");

        const newVideo = new Video({ title, url: embedUrl });
        await newVideo.save();
        res.status(200).json({ message: "Video saqlandi!" });
    } catch (err) {
        res.status(500).json({ error: "Xatolik!" });
    }
});

// Video yuklash API (server.js)
app.post('/api/videos', async (req, res) => {
    try {
        let { title, url } = req.body;
        let videoId = "";

        // YouTube ID-sini ajratib olish (har qanday linkdan)
        if (url.includes("v=")) {
            videoId = url.split("v=")[1].split("&")[0];
        } else if (url.includes("youtu.be/")) {
            videoId = url.split("youtu.be/")[1].split("?")[0];
        } else if (url.includes("embed/")) {
            videoId = url.split("embed/")[1].split("?")[0];
        }

        if (videoId) {
            // Faqat to'g'ri embed linkni saqlaymiz
            const embedUrl = `https://www.youtube.com/embed/${videoId}`;
            const newVideo = new Video({ title, url: embedUrl });
            await newVideo.save();
            res.status(200).json({ message: "Video muvaffaqiyatli saqlandi!" });
        } else {
            res.status(400).json({ error: "Noto'g'ri YouTube linki!" });
        }
    } catch (err) {
        res.status(500).json({ error: "Serverda xatolik!" });
    }
});
// Videolarni olish API (404 xatosi chiqmasligi uchun)
app.get('/api/videos', async (req, res) => {
    try {
        const videos = await Video.find();
        res.json(videos);
    } catch (err) {
        res.status(500).json({ error: "Xato" });
    }
});

// 4. Videoni o'chirish API
app.delete('/api/videos/:id', async (req, res) => {
    try {
        await Video.findByIdAndDelete(req.params.id);
        res.status(200).json({ message: "Video o'chirildi" });
    } catch (err) {
        res.status(500).json({ error: "O'chirishda xato yuz berdi" });
    }
});

// Bitta videoni ID bo'yicha olish
app.get('/api/videos/:id', async (req, res) => {
    try {
        const video = await Video.findById(req.params.id);
        if (!video) return res.status(404).json({ message: "Video topilmadi" });
        res.json(video);
    } catch (err) {
        res.status(500).json({ error: "Server xatosi" });
    }
});
