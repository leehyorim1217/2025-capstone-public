# ai-server/utils/ai_model_utils.py
"""
실제 AI 모델 (YOLO + OCR + ImageComparator) 유틸리티

.env 로드는 진입점인 app.py에서만 수행.
이 모듈은 os.getenv()로 환경변수를 직접 참조.
"""

import os
import re
import logging

import cv2
import numpy as np
from pathlib import Path

from ultralytics import YOLO

logger = logging.getLogger(__name__)

# ========== 상수 ==========
SERIAL_PATTERNS = [
    r'S/N[:\s]*([A-Z0-9]{6,})',
    r'Serial[:\s]*([A-Z0-9]{6,})',
    r'시리얼[:\s]*([A-Z0-9]{6,})',
    r'SN[:\s]*([A-Z0-9]{6,})',
    r'\b([A-Z]{2,3}[0-9]{6,})\b',
]

EQUIPMENT_MAPPING = {
    # Gemini 타입과 동일: laptop|tablet|mobile|camera|monitor|other
    'laptop': 'laptop',
    'cell phone': 'mobile',
    'tablet': 'tablet',
    'tv': 'monitor',
    'camera': 'camera',
    # Gemini가 'other'로 분류하는 항목들
    'keyboard': 'other',
    'mouse': 'other',
    'remote': 'other',
    'book': 'other',
    'clock': 'other',
}

MIN_CONTOUR_AREA      = 800
MAX_CONTOUR_RATIO     = 0.30   # 이미지 면적의 30% 초과 컨투어는 배경 변화로 간주
MAX_DIFF_RESULTS      = 10
SSIM_SAME_THRESHOLD   = 0.85
SSIM_DAMAGE_THRESHOLD = 0.90
MIN_DAMAGE_DIFF_COUNT = 2


# ========== Tesseract 초기화 (설치 여부에 따라 graceful 처리) ==========

def _init_tesseract():
    """
    Tesseract 경로 설정 및 사용 가능 여부 반환.
    미설치 환경에서도 서버가 정상 기동되도록 처리.

    경로는 .env의 TESSERACT_CMD에서만 읽음.
    예: TESSERACT_CMD=E:\\tools\\tesseract-ocr-5.5.0\\tesseract.exe
    """
    try:
        import pytesseract

        tesseract_cmd = os.getenv('TESSERACT_CMD')
        if tesseract_cmd:
            pytesseract.pytesseract.tesseract_cmd = tesseract_cmd

        pytesseract.get_tesseract_version()
        logger.info(f" Tesseract 초기화 완료: {tesseract_cmd or '(PATH 기본값)'}")
        return pytesseract, True

    except ImportError:
        logger.warning("  pytesseract 패키지가 설치되어 있지 않습니다. OCR 기능이 비활성화됩니다.")
        return None, False

    except Exception as e:
        logger.warning(f"  Tesseract 초기화 실패: {e}. OCR 기능이 비활성화됩니다.")
        return None, False


_pytesseract, _tesseract_available = _init_tesseract()


# ========== EquipmentDetector ==========

class EquipmentDetector:
    """YOLOv8 기반 장비 감지 클래스"""

    def __init__(self):
        model_path = Path(os.getenv('YOLO_MODEL_PATH', './models/yolov8n.pt'))
        self.model_path = model_path
        self.model = None
        self._load_model()

    def _load_model(self):
        """YOLO 모델 로드"""
        if not self.model_path.exists():
            raise FileNotFoundError(f"YOLO 모델 파일을 찾을 수 없습니다: {self.model_path}")
        self.model = YOLO(str(self.model_path))
        logger.info(f" YOLO 모델 로드 완료: {self.model_path}")

    def detect_equipment(self, image_path, confidence_threshold=0.5):
        """
        이미지에서 장비 감지.

        Args:
            image_path: 이미지 파일 경로
            confidence_threshold: 신뢰도 임계값
        Returns:
            dict: 감지 결과
        """
        try:
            img = cv2.imread(str(image_path))
            if img is None:
                raise ValueError(f"이미지를 읽을 수 없습니다: {image_path}")

            results = self.model(img, conf=confidence_threshold)
            detections = self._parse_results(results)

            best_detection = (
                max(detections, key=lambda x: x['confidence'])
                if detections else None
            )

            return {
                'success': True,
                'detections': detections,
                'best_detection': best_detection,
                'num_detections': len(detections),
            }

        except Exception as e:
            logger.error(f" 장비 감지 실패: {e}")
            return {
                'success': False,
                'error': str(e),
                'detections': [],
                'best_detection': None,
                'num_detections': 0,
            }

    def _parse_results(self, results):
        """YOLO 결과를 장비 감지 목록으로 변환"""
        detections = []
        for result in results:
            for box in result.boxes:
                class_name = self.model.names[int(box.cls[0])]
                equipment_type = EQUIPMENT_MAPPING.get(class_name.lower())

                if equipment_type is None:
                    continue

                x1, y1, x2, y2 = box.xyxy[0].tolist()
                detections.append({
                    'class': class_name,
                    'equipment_type': equipment_type,
                    'confidence': round(float(box.conf[0]), 3),
                    'bbox': {
                        'x1': int(x1), 'y1': int(y1),
                        'x2': int(x2), 'y2': int(y2),
                    }
                })
        return detections


# ========== OCRExtractor ==========

class OCRExtractor:
    """Tesseract 기반 OCR 텍스트 추출 클래스"""

    def __init__(self):
        self.available = _tesseract_available
        self.lang = os.getenv('OCR_LANG', 'eng+kor')

        if not self.available:
            logger.warning("  OCRExtractor: Tesseract를 사용할 수 없습니다.")

    def extract_text(self, image_path, preprocess=True):
        """
        이미지에서 텍스트 추출 [테서렉트 OCR]
        Args:
            image_path: 이미지 파일 경로
            preprocess: 전처리 여부
        Returns:
            dict: OCR 결과
        """
        if not self.available:
            logger.info("OCR 비활성화 상태 - 빈 결과 반환")
            return self._empty_result()

        try:
            img = cv2.imread(str(image_path))
            if img is None:
                raise ValueError(f"이미지를 읽을 수 없습니다: {image_path}")

            if preprocess:
                img = self._preprocess_image(img)

            text = _pytesseract.image_to_string(
                img,
                lang=self.lang,
                config='--psm 11'
            )

            serial_number = self._extract_serial_number(text)
            lines = [line.strip() for line in text.split('\n') if line.strip()]

            return {
                'success': True,
                'text': text.strip(),
                'lines': lines,
                'serial_number': serial_number,
            }

        except Exception as e:
            logger.error(f" OCR 텍스트 추출 실패: {e}")
            return {
                'success': False,
                'error': str(e),
                **self._empty_result(),
            }

    def _preprocess_image(self, img):
        """OCR 정확도 향상을 위한 이미지 전처리"""
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        denoised = cv2.fastNlMeansDenoising(gray)
        binary = cv2.adaptiveThreshold(
            denoised, 255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY,
            11, 2
        )
        return binary

    def _extract_serial_number(self, text):
        """텍스트에서 시리얼 번호 패턴 매칭"""
        for pattern in SERIAL_PATTERNS:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                return match.group(1)
        return None

    @staticmethod
    def _empty_result():
        return {
            'success': False,
            'text': '',
            'lines': [],
            'serial_number': None,
        }


# ========== ImageComparator ==========

class ImageComparator:
    """OpenCV - SSIM 이미지 비교 클래스"""

    def compare_images(self, image1_path, image2_path):
        """
        두 이미지의 구조적 유사도(SSIM) 및 차이점 분석.

        각 이미지에서 기기 ROI를 자동 검출한 뒤 ROI 내에서 CLAHE 정규화 + 엣지/픽셀 diff로 손상 탐지.
        Args:
            image1_path: 첫 번째 이미지 경로 (대여 시점)
            image2_path: 두 번째 이미지 경로 (반납 시점)
        Returns:
            dict: 비교 결과
        """
        try:
            img1 = cv2.imread(str(image1_path))
            img2 = cv2.imread(str(image2_path))

            if img1 is None or img2 is None:
                raise ValueError("하나 이상의 이미지를 읽을 수 없습니다.")

            roi1, _ = self._find_device_roi(img1)
            roi2, _ = self._find_device_roi(img2)

            differences, similarity = self._find_differences_in_roi(roi1, roi2)

            sim = round(float(similarity), 3)
            logger.info(
                f"SSIM ROI 비교 완료 — 유사도: {sim}, 손상 영역: {len(differences)}개"
            )
            return {
                'success':           True,
                'similarity':        sim,
                'is_same_equipment': bool(sim > SSIM_SAME_THRESHOLD),
                'num_differences':   len(differences),
                'differences':       differences[:MAX_DIFF_RESULTS],
                'has_damage':        bool(len(differences) >= MIN_DAMAGE_DIFF_COUNT),
            }

        except Exception as e:
            logger.error(f" 이미지 비교 실패: {e}")
            return {
                'success': False,
                'error': str(e),
            }

    def _find_device_roi(self, img, padding=30):
        """
        엣지 밀도 기반으로 이미지 내 주요 기기 영역(ROI) 검출.
        Returns: (roi_image, (x, y, w, h))
        """
        gray  = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        edges = cv2.Canny(gray, 30, 100)
        kernel  = cv2.getStructuringElement(cv2.MORPH_RECT, (30, 30))
        dilated = cv2.dilate(edges, kernel, iterations=5)

        contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        h, w = img.shape[:2]
        full_bbox = (0, 0, w, h)

        valid = [c for c in contours if cv2.contourArea(c) < w * h * 0.95]
        if not valid:
            return img.copy(), full_bbox

        largest = max(valid, key=cv2.contourArea)
        x, y, bw, bh = cv2.boundingRect(largest)
        x1 = max(0, x - padding);  y1 = max(0, y - padding)
        x2 = min(w, x + bw + padding);  y2 = min(h, y + bh + padding)
        return img[y1:y2, x1:x2].copy(), (x1, y1, x2 - x1, y2 - y1)

    def _find_differences_in_roi(self, roi1, roi2):
        """
        ROI를 512x512 정규화 후 CLAHE + 엣지/픽셀 diff로 손상 탐지.
        Returns: (differences_list, ssim_score)
        """
        TARGET = 512
        r1 = cv2.resize(roi1, (TARGET, TARGET))
        r2 = cv2.resize(roi2, (TARGET, TARGET))

        clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
        gray1 = clahe.apply(cv2.cvtColor(r1, cv2.COLOR_BGR2GRAY))
        gray2 = clahe.apply(cv2.cvtColor(r2, cv2.COLOR_BGR2GRAY))

        similarity = self._calculate_ssim_gray(gray1, gray2)

        # 엣지 차이
        e1 = cv2.Canny(gray1, 40, 120)
        e2 = cv2.Canny(gray2, 40, 120)
        edge_mask = cv2.dilate(cv2.absdiff(e1, e2),
                               cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5)),
                               iterations=2)
        _, edge_mask = cv2.threshold(edge_mask, 25, 255, cv2.THRESH_BINARY)

        # 픽셀 차이
        gray_diff = cv2.absdiff(gray1, gray2)
        _, pix_mask = cv2.threshold(gray_diff, 25, 255, cv2.THRESH_BINARY)
        pix_mask = cv2.dilate(pix_mask,
                              cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3)),
                              iterations=2)

        combined = cv2.morphologyEx(
            cv2.bitwise_or(edge_mask, pix_mask),
            cv2.MORPH_CLOSE,
            cv2.getStructuringElement(cv2.MORPH_RECT, (11, 11))
        )

        roi_area = TARGET * TARGET
        contours, _ = cv2.findContours(combined, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        # 좌표를 원본 ROI 크기 기준으로 역변환
        rh, rw = roi1.shape[:2]
        sx, sy = rw / TARGET, rh / TARGET

        differences = []
        for i, c in enumerate(sorted(contours, key=cv2.contourArea, reverse=True)):
            area = cv2.contourArea(c)
            if not (MIN_CONTOUR_AREA <= area <= roi_area * MAX_CONTOUR_RATIO):
                continue
            x, y, bw, bh = cv2.boundingRect(c)
            differences.append({
                'id':   i,
                'area': int(area * sx * sy),
                'bbox': {
                    'x': int(x * sx), 'y': int(y * sy),
                    'w': int(bw * sx), 'h': int(bh * sy),
                },
            })

        return differences, float(similarity)

    def _calculate_ssim(self, img1, img2):
        gray1 = cv2.cvtColor(img1, cv2.COLOR_BGR2GRAY)
        gray2 = cv2.cvtColor(img2, cv2.COLOR_BGR2GRAY)
        return self._calculate_ssim_gray(gray1, gray2)

    def _calculate_ssim_gray(self, gray1, gray2):
        """
        scikit-image의 SSIM으로 구조적 유사도 계산 (gray 입력).
        """
        try:
            from skimage.metrics import structural_similarity as ssim
            # data_range=255: uint8 이미지에서 scikit-image >= 0.19 버전 호환
            score, _ = ssim(gray1, gray2, full=True, data_range=255)
            return score
        except ImportError:
            logger.warning("skimage 미설치 - MSE 기반 유사도로 폴백")
        except Exception as e:
            logger.warning(f"SSIM 계산 실패, MSE 기반 유사도로 폴백: {e}")
        g1 = gray1.astype(np.float32) / 255.0
        g2 = gray2.astype(np.float32) / 255.0
        return 1.0 - min(float(np.mean((g1 - g2) ** 2)), 1.0)



# ========== 상태 수치화 유틸리티 ==========

SEVERITY_PENALTY = {'minor': 5, 'moderate': 15, 'severe': 30}


def calculate_condition_score(ssim_similarity, damages=None, ssim_diff_count=0):
    """
    SSIM 유사도 + 손상 목록으로 장비 상태 점수(0~100) 계산.

    점수 산정 기준:
        기본 점수  = SSIM * 100
        손상 페널티 = minor×5, moderate×15, severe×30 (최대 50점)
        차이 페널티 = SSIM 차이 영역 개수 × 1점 (최대 10점)

    Args:
        ssim_similarity:  SSIM 유사도 (0.0~1.0)
        damages:          손상 목록 [{severity: 'minor'|'moderate'|'severe', ...}]
        ssim_diff_count:  SSIM 차이 영역 개수

    Returns:
        tuple: (condition_score: int, final_condition: str)
    """
    damages = damages or []
    base = ssim_similarity * 100
    damage_penalty = min(sum(SEVERITY_PENALTY.get(d.get('severity', 'minor'), 5) for d in damages), 50)
    diff_penalty = min(ssim_diff_count * 1.0, 10)
    score = round(max(0.0, min(100.0, base - damage_penalty - diff_penalty)))

    if score >= 90:
        condition = 'excellent'
    elif score >= 70:
        condition = 'good'
    elif score >= 50:
        condition = 'fair'
    else:
        condition = 'poor'

    return score, condition


# ========== CLIPClassifier ==========

class CLIPClassifier:
    """
    OpenAI CLIP zero-shot 브랜드/제조사 분류기.

    YOLO가 감지한 장비 카테고리를 힌트로 삼아 해당 카테고리 후보군으로
    검색 공간을 좁힌 뒤, CLIP 이미지-텍스트 유사도로 브랜드를 결정.
    추가 학습 없이 zero-shot으로 동작하며 로컬에서 API 없이 동작함..
    """

    # (brand, model_hint, text_prompt)
    BRAND_PROMPTS = {
        'laptop': [
            ('Apple',     'MacBook',     'a photo of an Apple MacBook laptop computer'),
            ('Samsung',   'Galaxy Book', 'a photo of a Samsung Galaxy Book laptop'),
            ('LG',        'Gram',        'a photo of an LG Gram laptop'),
            ('Dell',      'XPS',         'a photo of a Dell laptop computer'),
            ('Lenovo',    'ThinkPad',    'a photo of a Lenovo ThinkPad laptop'),
            ('HP',        'laptop',      'a photo of an HP laptop computer'),
            ('ASUS',      'ZenBook',     'a photo of an ASUS laptop'),
            ('Microsoft', 'Surface',     'a photo of a Microsoft Surface laptop'),
        ],
        'tablet': [
            ('Apple',     'iPad',        'a photo of an Apple iPad tablet'),
            ('Samsung',   'Galaxy Tab',  'a photo of a Samsung Galaxy tablet'),
            ('Microsoft', 'Surface',     'a photo of a Microsoft Surface Pro tablet'),
            ('Lenovo',    'Tab',         'a photo of a Lenovo tablet'),
            ('Huawei',    'MatePad',     'a photo of a Huawei MatePad tablet'),
        ],
        'mobile': [
            ('Apple',     'iPhone',      'a photo of an Apple iPhone smartphone'),
            ('Samsung',   'Galaxy',      'a photo of a Samsung Galaxy smartphone'),
            ('LG',        'phone',       'a photo of an LG smartphone'),
            ('Sony',      'Xperia',      'a photo of a Sony Xperia smartphone'),
            ('Google',    'Pixel',       'a photo of a Google Pixel smartphone'),
        ],
        'camera': [
            ('Canon',     'EOS',         'a photo of a Canon EOS camera'),
            ('Sony',      'Alpha',       'a photo of a Sony Alpha camera'),
            ('Nikon',     'camera',      'a photo of a Nikon camera'),
            ('Fujifilm',  'camera',      'a photo of a Fujifilm camera'),
            ('Panasonic', 'Lumix',       'a photo of a Panasonic Lumix camera'),
        ],
        'monitor': [
            ('LG',        'monitor',     'a photo of an LG monitor display'),
            ('Samsung',   'monitor',     'a photo of a Samsung monitor display'),
            ('Dell',      'monitor',     'a photo of a Dell monitor display'),
            ('ASUS',      'monitor',     'a photo of an ASUS monitor display'),
            ('BenQ',      'monitor',     'a photo of a BenQ monitor display'),
        ],
    }

    def __init__(self):
        self.model = None
        self.processor = None
        self._loaded = False
        self._model_name = os.getenv('CLIP_MODEL', 'openai/clip-vit-base-patch32')
        self._threshold  = float(os.getenv('CLIP_CONFIDENCE_THRESHOLD', '0.20'))
        self._load_model()

    def _load_model(self):
        try:
            from transformers import CLIPProcessor, CLIPModel
            logger.info(f"CLIP 모델 로드 중: {self._model_name}")

            # 1차: 로컬 캐시에서 로드 (HuggingFace Hub 네트워크 요청 없음)
            # 2차: 캐시 없으면 Hub에서 다운로드 (최초 1회만)
            try:
                self.processor = CLIPProcessor.from_pretrained(
                    self._model_name, local_files_only=True)
                self.model = CLIPModel.from_pretrained(
                    self._model_name, local_files_only=True)
                logger.info("CLIP 로컬 캐시에서 로드")
            except OSError:
                logger.info("CLIP 캐시 없음 — HuggingFace Hub에서 최초 다운로드")
                self.processor = CLIPProcessor.from_pretrained(self._model_name)
                self.model     = CLIPModel.from_pretrained(self._model_name)

            self.model.eval()
            self._loaded = True
            logger.info(f" CLIP 모델 로드 완료: {self._model_name}")
        except ImportError:
            logger.warning("  transformers 미설치 — CLIP 분류 비활성화")
        except Exception as e:
            logger.error(f" CLIP 모델 로드 실패: {e}")

    def classify(self, image_path, equipment_type='other'):
        """
        이미지에서 브랜드/제조사 zero-shot 분류.

        Args:
            image_path:     이미지 파일 경로
            equipment_type: YOLO 감지 카테고리 (검색 공간 축소에 사용)
        Returns:
            dict: success, brand, manufacturer, model_hint, confidence, all_scores
        """
        if not self._loaded:
            return self._empty_result()

        try:
            import torch
            from PIL import Image

            # 장비 타입에 맞는 후보를 우선 사용함. 만약 없을 경우, 전체 후보 중 검색한다.
            if equipment_type in self.BRAND_PROMPTS:
                candidates = self.BRAND_PROMPTS[equipment_type]
            else:
                candidates = [item for rows in self.BRAND_PROMPTS.values() for item in rows]

            prompts = [c[2] for c in candidates]

            image  = Image.open(image_path).convert('RGB')
            inputs = self.processor(
                text=prompts, images=image,
                return_tensors='pt', padding=True, truncation=True,
            )

            with torch.no_grad():
                outputs = self.model(**inputs)
                probs   = outputs.logits_per_image.softmax(dim=1)[0].tolist()

            scored = sorted(zip(candidates, probs), key=lambda x: x[1], reverse=True)
            best_candidate, best_prob = scored[0]
            brand, model_hint, _      = best_candidate

            all_scores = [
                {'brand': c[0], 'model': c[1], 'score': round(p, 4)}
                for c, p in scored[:5]
            ]
            logger.info(
                f"CLIP 분류: {brand} {model_hint} "
                f"(신뢰도: {best_prob:.4f}) | top5={all_scores}"
            )

            if best_prob < self._threshold:
                logger.info(f"CLIP 신뢰도 미달 ({best_prob:.4f} < {self._threshold})")
                return self._empty_result(all_scores=all_scores)

            return {
                'success':      True,
                'brand':        brand,
                'manufacturer': brand,
                'model_hint':   model_hint,
                'confidence':   round(best_prob, 4),
                'all_scores':   all_scores,
            }

        except Exception as e:
            logger.error(f" CLIP 분류 실패: {e}")
            return self._empty_result()

    @staticmethod
    def _empty_result(all_scores=None):
        return {
            'success':      False,
            'brand':        'Unknown',
            'manufacturer': 'Unknown',
            'model_hint':   'Unknown',
            'confidence':   0.0,
            'all_scores':   all_scores or [],
        }


# ========== 싱글톤 접근자 ==========

_detector = None
_ocr = None
_comparator = None
_clip_classifier = None


def get_detector():
    """EquipmentDetector 싱글톤"""
    global _detector
    if _detector is None:
        _detector = EquipmentDetector()
    return _detector


def get_ocr():
    """OCRExtractor 싱글톤"""
    global _ocr
    if _ocr is None:
        _ocr = OCRExtractor()
    return _ocr


def get_comparator():
    """ImageComparator 싱글톤"""
    global _comparator
    if _comparator is None:
        _comparator = ImageComparator()
    return _comparator


def get_clip_classifier():
    """CLIPClassifier 싱글톤"""
    global _clip_classifier
    if _clip_classifier is None:
        _clip_classifier = CLIPClassifier()
    return _clip_classifier