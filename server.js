const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const app = express();
const port = 3000;

// Multer storage configuration
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ storage: storage });

// Statik dosyaları sunmak için mevcut dizini kullan
app.use(express.static(__dirname));
app.use('/uploads', express.static(path.join(__dirname, 'uploads'))); // Videolar için
app.use(express.json());

app.get('/api/files', (req, res) => {
  const dataDir = path.join(__dirname, 'data');
  fs.readdir(dataDir, (err, files) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to list files' });
    }
    res.json(files.filter(f => f.endsWith('.json')));
  });
});

// Dosya yükleme endpoint'i
app.post('/api/upload', upload.single('videoFile'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  res.json({ filename: req.file.filename, path: '/uploads/' + req.file.filename });
});

app.post('/api/save-region', (req, res) => {
  const { filename, regionData, index } = req.body; // Index varsa güncelleme demektir

  if (!filename || !regionData) {
    return res.status(400).json({ error: 'Missing filename or region data' });
  }

  const filePath = path.join(__dirname, 'data', filename);

  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to read file' });
    }

    let regions = [];
    try {
      regions = JSON.parse(data);
    } catch (parseError) {
      return res.status(500).json({ error: 'Failed to parse file content' });
    }

    // Eğer index tanımlıysa ve geçerliyse güncelle, yoksa ekle
    if (index !== undefined && index !== null && index >= 0 && index < regions.length) {
      // Mevcut veriyi korumak isteyebiliriz ama burada tamamen replace ediyoruz
      // Ancak, kullanıcının düzenlemediği alanlar kaybolmasın diye merge edilebilir.
      // Şimdilik frontend'in tüm veriyi gönderdiğini varsayalım.
      regions[index] = regionData;
    } else {
      regions.push(regionData);
    }

    fs.writeFile(filePath, JSON.stringify(regions, null, 4), (err) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to save file' });
      }
      res.json({ success: true });
    });
  });
});

app.post('/api/delete-region', (req, res) => {
  const { filename, index } = req.body;

  if (!filename || index === undefined) {
    return res.status(400).json({ error: 'Missing filename or index' });
  }

  const filePath = path.join(__dirname, 'data', filename);

  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to read file' });
    }

    let regions = [];
    try {
      regions = JSON.parse(data);
    } catch (parseError) {
      return res.status(500).json({ error: 'Failed to parse file content' });
    }

    if (index < 0 || index >= regions.length) {
      return res.status(400).json({ error: 'Invalid index' });
    }

    regions.splice(index, 1);

    fs.writeFile(filePath, JSON.stringify(regions, null, 4), (err) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to save file' });
      }
      res.json({ success: true });
    });
  });
});


app.listen(port, () => {
  console.log(`Sunucu http://localhost:${port} adresinde çalışıyor`);
});
