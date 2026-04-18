const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));
app.use('/track', express.raw({ type: '*/*', limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// In-memory storage (use Redis/DB for production)
const tracks = [];
const uploads = new Map();

// File upload config
const upload = multer({ 
    dest: 'uploads/',
    limits: { fileSize: 100 * 1024 * 1024 } // 100MB
});

// Ensure uploads directory
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

// Tracking endpoint - logs ALL activity
app.post('/track', (req, res) => {
    try {
        const data = req.body.toString();
        const track = {
            id: uuidv4(),
            timestamp: new Date().toISOString(),
            ip: req.ip || req.connection.remoteAddress,
            userAgent: req.get('User-Agent'),
            data: JSON.parse(data)
        };
        
        tracks.push(track);
        console.log('TRACK:', track.ip, track.data.type, new Date().toISOString());
        
        // Save to file for persistence
        fs.appendFileSync('tracks.jsonl', JSON.stringify(track) + '\n');
        
        res.status(200).send('OK');
    } catch (e) {
        console.error('Track error:', e);
        res.status(500).send('Error');
    }
});

// File upload endpoint
app.post('/upload', upload.array('files'), (req, res) => {
    try {
        const files = req.files || [];
        const uploadId = uuidv4();
        
        // Track upload attempt
        const trackData = {
            type: 'file_upload',
            filename: files.map(f => f.originalname),
            filesize: files.map(f => f.size),
            ip: req.ip,
            timestamp: Date.now()
        };
        
        tracks.push(trackData);
        console.log('UPLOAD:', req.ip, files.map(f => f.originalname));
        
        // Generate download URLs
        const downloadUrls = files.map(file => {
            const publicUrl = `${req.protocol}://${req.get('host')}/download/${uploadId}/${file.filename}`;
            return publicUrl;
        });
        
        // Store for download serving
        uploads.set(`${uploadId}`, files.map(f => ({
            path: f.path,
            filename: f.originalname,
            size: f.size
        })));
        
        res.json({
            success: true,
            downloadUrl: downloadUrls[0], // Return first file URL
            files: downloadUrls,
            uploadId
        });
    } catch (e) {
        console.error('Upload error:', e);
        res.status(500).json({ error: 'Upload failed' });
    }
});

// File download endpoint
app.get('/download/:uploadId/:filename', (req, res) => {
    const { uploadId, filename } = req.params;
    const key = `${uploadId}`;
    
    if (!uploads.has(key)) {
        return res.status(404).send('File not found');
    }
    
    const files = uploads.get(key);
    const file = files.find(f => decodeURIComponent(filename) === f.filename);
    
    if (!file) {
        return res.status(404).send('File not found');
    }
    
    // Track download
    tracks.push({
        type: 'file_download',
        ip: req.ip,
        filename: file.filename,
        timestamp: Date.now()
    });
    
    console.log('DOWNLOAD:', req.ip, filename);
    
    res.download(file.path, file.filename, (err) => {
        if (err) {
            console.error('Download error:', err);
        }
        // Clean up after download (optional)
        // fs.unlinkSync(file.path);
    });
});

// Serve tracking dashboard at /dashboard
app.get('/dashboard', (req, res) => {
    const html = `
    <!DOCTYPE html>
    <html>
    <head><title>Tracking Dashboard</title>
    <style>body{font-family:monospace;background:#1a1a1a;color:#00ff00;padding:20px;}pre{white-space:pre-wrap;}</style>
    </head>
    <body>
        <h1>🎯 Tracking Data</h1>
        <h3>Recent Activity:</h3>
        <pre>${JSON.stringify(tracks.slice(-50).reverse(), null, 2)}</pre>
        <script>
            setTimeout(() => location.reload(), 5000);
        </script>
    </body>
    </html>`;
    res.send(html);
});

app.listen(PORT, () => {
    console.log(`🚀 Tracking server running on port ${PORT}`);
    console.log(`📊 Dashboard: http://localhost:${PORT}/dashboard`);
});
