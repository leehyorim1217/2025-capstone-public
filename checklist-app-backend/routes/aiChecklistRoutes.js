// backend/routes/aiChecklistRoutes.js - CreateChecklistScreenì—ì„œ í˜¸ì¶œí•˜ëŠ” AI APIë“¤
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');
const { protect } = require('../middleware/auth');
const router = express.Router();

// ì—…ë¡œë“œ ì„¤ì •
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = path.join(__dirname, '../uploads/ai-checklist');
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'ai-equipment-' + uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('ì´ë¯¸ì§€ íŒŒì¼ë§Œ ì—…ë¡œë“œ ê°€ëŠ¥í•©ë‹ˆë‹¤ (JPEG, JPG, PNG)'));
    }
  },
});

// ðŸ”¥ ìˆ˜ì •: AI ì„œë²„ URL - /api ê²½ë¡œ í¬í•¨
const AI_SERVER_URL = `${process.env.AI_SERVER_URL}/api`;

console.log('ðŸ¤– AI Checklist Routes - AI ì„œë²„ URL:', AI_SERVER_URL);

// @desc    AI ìž¥ë¹„ ê°ì§€ ë° ë¶„ì„
// @route   POST /api/ai-checklist/detect-equipment
// @access  Private
router.post('/detect-equipment', protect, upload.single('image'), async (req, res) => {
  try {
    console.log('ðŸ¤– AI ìž¥ë¹„ ê°ì§€ ìš”ì²­ ìˆ˜ì‹ ');

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'ì´ë¯¸ì§€ íŒŒì¼ì´ í•„ìš”í•©ë‹ˆë‹¤',
      });
    }

    console.log('ðŸ“ ì—…ë¡œë“œëœ íŒŒì¼:', req.file.filename);

    // AI ì„œë²„ë¡œ ì „ì†¡í•  FormData ìƒì„±
    const formData = new FormData();
    formData.append('image', fs.createReadStream(req.file.path), {
      filename: req.file.filename,
      contentType: req.file.mimetype,
    });
    formData.append('mode', 'scan');

    try {
      // ðŸ”¥ ìˆ˜ì •: /detect ê²½ë¡œë¡œ í˜¸ì¶œ (AI_SERVER_URLì— ì´ë¯¸ /api í¬í•¨ë¨)
      console.log('ðŸš€ AI ì„œë²„ í˜¸ì¶œ:', `${AI_SERVER_URL}/detect`);
      const aiResponse = await axios.post(`${AI_SERVER_URL}/detect`, formData, {
        headers: {
          ...formData.getHeaders(),
          Accept: 'application/json',
        },
        timeout: 30000,
        maxContentLength: 50 * 1024 * 1024,
        maxBodyLength: 50 * 1024 * 1024,
      });

      const aiResult = aiResponse.data;
      console.log('âœ… AI ë¶„ì„ ì™„ë£Œ:', aiResult);

      // ì´ë¯¸ì§€ URL ìƒì„±
      const imageUrl = `${req.protocol}://${req.get('host')}/uploads/ai-checklist/${req.file.filename}`;

      // ì‘ë‹µ ë°ì´í„° êµ¬ì„±
      res.json({
        success: true,
        message: 'ìž¥ë¹„ ì¸ì‹ì´ ì™„ë£Œë˜ì—ˆìŠµë‹ˆë‹¤',
        data: {
          // AI ë¶„ì„ ê²°ê³¼
          detectedEquipment: {
            name: aiResult.detections?.[0]?.class || 'unknown',
            confidence: aiResult.confidence || 0.5,
            serialNumber: aiResult.serialNumber || aiResult.extracted_serial || null,
            type: aiResult.equipment?.type || 'equipment',
          },

          // ì›ë³¸ AI ê²°ê³¼
          aiAnalysis: {
            detections: aiResult.detections || [],
            extractedText: aiResult.extracted_text || aiResult.text || null,
            processingTime: aiResult.processing_time || 0,
            confidence: aiResult.confidence || 0,
          },

          // ì´ë¯¸ì§€ ì •ë³´
          image: {
            url: imageUrl,
            filename: req.file.filename,
            size: req.file.size,
            mimetype: req.file.mimetype,
          },

          // ì¶”ì²œ ìž¥ë¹„ ë¦¬ìŠ¤íŠ¸ (DB ë§¤ì¹­ ê²°ê³¼)
          suggestions: generateEquipmentSuggestions(aiResult),

          timestamp: new Date().toISOString(),
        },
      });
    } catch (aiError) {
      console.error('âŒ AI ì„œë²„ í†µì‹  ì˜¤ë¥˜:', aiError.message);
      console.error('âŒ AI ì„œë²„ ì‘ë‹µ ìƒíƒœ:', aiError.response?.status);
      console.error('âŒ AI ì„œë²„ ì‘ë‹µ ë°ì´í„°:', aiError.response?.data);

      // AI ì„œë²„ ì˜¤ë¥˜ ì‹œ í´ë°± ì‘ë‹µ
      const imageUrl = `${req.protocol}://${req.get('host')}/uploads/ai-checklist/${req.file.filename}`;

      res.json({
        success: true, // ì´ë¯¸ì§€ ì—…ë¡œë“œëŠ” ì„±ê³µí–ˆìœ¼ë¯€ë¡œ true
        message: 'AI ë¶„ì„ì— ì‹¤íŒ¨í–ˆì§€ë§Œ ìˆ˜ë™ ìž…ë ¥ìœ¼ë¡œ ì§„í–‰í•  ìˆ˜ ìžˆìŠµë‹ˆë‹¤',
        data: {
          detectedEquipment: {
            name: '',
            confidence: 0,
            serialNumber: null,
            type: 'equipment',
          },
          aiAnalysis: null,
          image: {
            url: imageUrl,
            filename: req.file.filename,
            size: req.file.size,
            mimetype: req.file.mimetype,
          },
          suggestions: [],
          error: 'AI_SERVER_UNAVAILABLE',
          fallback: true,
        },
      });
    }
  } catch (error) {
    console.error('âŒ ìž¥ë¹„ ê°ì§€ ì²˜ë¦¬ ì˜¤ë¥˜:', error);

    res.status(500).json({
      success: false,
      message: 'ìž¥ë¹„ ê°ì§€ ì¤‘ ì˜¤ë¥˜ê°€ ë°œìƒí–ˆìŠµë‹ˆë‹¤',
      error: process.env.NODE_ENV === 'development' ? error.message : 'INTERNAL_SERVER_ERROR',
    });
  }
});

// @desc    ìž¥ë¹„ ê²€ìƒ‰ API
// @route   GET /api/ai-checklist/search-equipment
// @access  Private
router.get('/search-equipment', protect, async (req, res) => {
  try {
    const { query, limit = 10 } = req.query;

    console.log('ðŸ” ìž¥ë¹„ ê²€ìƒ‰ ìš”ì²­:', query);

    if (!query || query.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'ê²€ìƒ‰ì–´ë¥¼ ìž…ë ¥í•´ì£¼ì„¸ìš”',
      });
    }

    // ìž¥ë¹„ ë§ˆìŠ¤í„° ë°ì´í„°ì—ì„œ ê²€ìƒ‰
    const searchResults = await searchEquipmentDatabase(query, parseInt(limit));

    res.json({
      success: true,
      message: `'${query}' ê²€ìƒ‰ ê²°ê³¼`,
      data: {
        query: query,
        count: searchResults.length,
        equipment: searchResults,
      },
    });
  } catch (error) {
    console.error('âŒ ìž¥ë¹„ ê²€ìƒ‰ ì˜¤ë¥˜:', error);
    res.status(500).json({
      success: false,
      message: 'ìž¥ë¹„ ê²€ìƒ‰ ì¤‘ ì˜¤ë¥˜ê°€ ë°œìƒí–ˆìŠµë‹ˆë‹¤',
      error: process.env.NODE_ENV === 'development' ? error.message : 'SEARCH_ERROR',
    });
  }
});

// @desc    AI ë¶„ì„ ìž¬ì‹œë„
// @route   POST /api/ai-checklist/reanalyze/:imageId
// @access  Private
router.post('/reanalyze/:imageId', protect, async (req, res) => {
  try {
    const { imageId } = req.params;

    // ì´ë¯¸ì§€ íŒŒì¼ ê²½ë¡œ ì°¾ê¸°
    const uploadsDir = path.join(__dirname, '../uploads/ai-checklist');
    const imageFile = fs.readdirSync(uploadsDir).find((file) => file.includes(imageId));

    if (!imageFile) {
      return res.status(404).json({
        success: false,
        message: 'ì´ë¯¸ì§€ íŒŒì¼ì„ ì°¾ì„ ìˆ˜ ì—†ìŠµë‹ˆë‹¤',
      });
    }

    const imagePath = path.join(uploadsDir, imageFile);

    // FormDataë¡œ AI ì„œë²„ì— ìž¬ë¶„ì„ ìš”ì²­
    const formData = new FormData();
    formData.append('image', fs.createReadStream(imagePath));

    // ðŸ”¥ ìˆ˜ì •: /detect ê²½ë¡œë¡œ í˜¸ì¶œ
    const aiResponse = await axios.post(`${AI_SERVER_URL}/detect`, formData, {
      headers: { ...formData.getHeaders() },
      timeout: 30000,
    });

    const aiResult = aiResponse.data;

    res.json({
      success: true,
      message: 'ìž¬ë¶„ì„ì´ ì™„ë£Œë˜ì—ˆìŠµë‹ˆë‹¤',
      data: {
        detectedEquipment: {
          name: aiResult.detections?.[0]?.class || 'unknown',
          confidence: aiResult.confidence || 0.5,
          serialNumber: aiResult.serialNumber || null,
          type: aiResult.equipment?.type || 'equipment',
        },
        aiAnalysis: aiResult,
        suggestions: generateEquipmentSuggestions(aiResult),
      },
    });
  } catch (error) {
    console.error('âŒ AI ìž¬ë¶„ì„ ì˜¤ë¥˜:', error);
    res.status(500).json({
      success: false,
      message: 'AI ìž¬ë¶„ì„ ì¤‘ ì˜¤ë¥˜ê°€ ë°œìƒí–ˆìŠµë‹ˆë‹¤',
      error: error.message,
    });
  }
});

// ========== ìœ í‹¸ë¦¬í‹° í•¨ìˆ˜ë“¤ ==========

// ìž¥ë¹„ ì¶”ì²œ ìƒì„±
function generateEquipmentSuggestions(aiResult) {
  const suggestions = [];

  // AI ê²°ê³¼ ê¸°ë°˜ ì¶”ì²œ
  if (aiResult.detections && aiResult.detections.length > 0) {
    aiResult.detections.forEach((detection) => {
      suggestions.push({
        id: `ai_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        name: detection.class || 'Unknown Equipment',
        type: detection.class || 'equipment',
        confidence: detection.confidence || 0,
        source: 'ai_detection',
        serialNumber: aiResult.serialNumber || null,
      });
    });
  }

  // í…ìŠ¤íŠ¸ ì¶”ì¶œ ê¸°ë°˜ ì¶”ì²œ
  if (aiResult.extracted_text) {
    const textMatch = findEquipmentFromText(aiResult.extracted_text);
    if (textMatch.length > 0) {
      suggestions.push(...textMatch);
    }
  }

  return suggestions.slice(0, 5); // ìµœëŒ€ 5ê°œê¹Œì§€ë§Œ ë°˜í™˜
}

// í…ìŠ¤íŠ¸ì—ì„œ ìž¥ë¹„ ì°¾ê¸°
function findEquipmentFromText(text) {
  const results = [];
  const equipmentKeywords = [
    'laptop',
    'notebook',
    'macbook',
    'thinkpad',
    'camera',
    'canon',
    'nikon',
    'sony',
    'monitor',
    'display',
    'screen',
    'tablet',
    'ipad',
    'galaxy',
    'projector',
    'printer',
  ];

  equipmentKeywords.forEach((keyword) => {
    if (text.toLowerCase().includes(keyword.toLowerCase())) {
      results.push({
        id: `text_${keyword}_${Date.now()}`,
        name: keyword.charAt(0).toUpperCase() + keyword.slice(1),
        type: 'equipment',
        confidence: 0.7,
        source: 'text_extraction',
        serialNumber: extractSerialFromText(text),
      });
    }
  });

  return results;
}

// í…ìŠ¤íŠ¸ì—ì„œ ì‹œë¦¬ì–¼ ë²ˆí˜¸ ì¶”ì¶œ
function extractSerialFromText(text) {
  // ì‹œë¦¬ì–¼ ë²ˆí˜¸ íŒ¨í„´ ë§¤ì¹­ (ì˜ë¬¸+ìˆ«ìž ì¡°í•©)
  const serialPatterns = [
    /\b[A-Z0-9]{8,}\b/g, // 8ìž ì´ìƒì˜ ì˜ë¬¸ìˆ«ìž
    /\bS\/N:?\s*([A-Z0-9]+)/gi, // S/N: íŒ¨í„´
    /\bSerial:?\s*([A-Z0-9]+)/gi, // Serial: íŒ¨í„´
  ];

  for (const pattern of serialPatterns) {
    const match = text.match(pattern);
    if (match) {
      return match[0];
    }
  }

  return null;
}

// ìž¥ë¹„ ë°ì´í„°ë² ì´ìŠ¤ ê²€ìƒ‰ (ìž„ì‹œ êµ¬í˜„)
async function searchEquipmentDatabase(query, limit = 10) {
  try {
    const Equipment = require('../models/Equipment');
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'i');

    const results = await Equipment.find({
      $or: [
        { name: regex },
        { brand: regex },
        { manufacturer: regex },
        { model: regex },
        { type: regex },
        { serialNumber: regex },
      ],
    })
      .limit(limit)
      .lean();

    return results.map((eq) => ({
      id: eq._id,
      name: eq.name,
      type: eq.type,
      brand: eq.brand || eq.manufacturer || null,
      model: eq.model || null,
      serialNumber: eq.serialNumber || null,
      status: eq.status,
    }));
  } catch (err) {
    console.error('장비 DB 검색 오류:', err.message);
    return [];
  }
}

// í—¬ìŠ¤ ì²´í¬
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'AI Checklist API is running',
    timestamp: new Date().toISOString(),
    aiServerURL: AI_SERVER_URL,
    features: ['ðŸ¤– AI ìž¥ë¹„ ê°ì§€', 'ðŸ” ìž¥ë¹„ ê²€ìƒ‰', 'ðŸ”„ AI ìž¬ë¶„ì„', 'ðŸ“‹ ì²´í¬ë¦¬ìŠ¤íŠ¸ ìƒì„± ì§€ì›'],
  });
});

// ì—ëŸ¬ í•¸ë“¤ë§
router.use((error, req, res, _next) => {
  console.error('âŒ AI Checklist Route Error:', error);

  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'íŒŒì¼ í¬ê¸°ê°€ ë„ˆë¬´ í½ë‹ˆë‹¤ (ìµœëŒ€ 10MB)',
        error: 'FILE_TOO_LARGE',
      });
    }
  }

  res.status(500).json({
    success: false,
    message: 'AI ì²´í¬ë¦¬ìŠ¤íŠ¸ ì²˜ë¦¬ ì¤‘ ì˜¤ë¥˜ê°€ ë°œìƒí–ˆìŠµë‹ˆë‹¤',
    error: process.env.NODE_ENV === 'development' ? error.message : 'INTERNAL_SERVER_ERROR',
  });
});

console.log('âœ… AI Checklist Routes ëª¨ë“ˆ ë¡œë“œ ì™„ë£Œ');

module.exports = router;