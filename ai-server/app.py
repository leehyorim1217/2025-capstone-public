# ai-server/app.py
"""
실제 AI 모델 (YOLO + OCR + Gemini Vision)을 사용하는 Flask 서버
"""

import os
import json
import logging
import time
import random
import threading
from collections import deque
from datetime import datetime

from flask import Flask, request, jsonify
from flask_cors import CORS
from werkzeug.utils import secure_filename
from dotenv import load_dotenv

# .env 로드 (모든 설정보다 먼저)
load_dotenv()

# 실제 AI 모델 유틸리티 import
from utils.ai_model_utils import get_detector, get_ocr, get_comparator, get_clip_classifier

# ========== 상수 ==========
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}
MAX_DIFF_RESULTS = 10
MIN_CONTOUR_AREA = 500

# ========== Flask 앱 초기화 ==========
app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

# 로깅 설정
logging.basicConfig(
    level=os.getenv('LOG_LEVEL', 'INFO'),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# HuggingFace Hub / httpx / httpcore 의 내부 DEBUG 로그 억제
# (DEBUG 모드에서도 HTTP 요청 상세 로그가 터미널을 도배하지 않도록)
for _noisy_logger in ('httpcore', 'httpx', 'huggingface_hub', 'filelock', 'urllib3', 'PIL'):
    logging.getLogger(_noisy_logger).setLevel(logging.WARNING)

# 업로드 설정
UPLOAD_FOLDER = os.getenv('UPLOAD_FOLDER', './uploads')
MAX_FILE_SIZE = int(os.getenv('MAX_CONTENT_LENGTH', 20 * 1024 * 1024))

os.makedirs(os.path.join(UPLOAD_FOLDER, 'temp'), exist_ok=True)
os.makedirs(os.path.join(UPLOAD_FOLDER, 'processed'), exist_ok=True)

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = MAX_FILE_SIZE


# ========== Gemini Vision ==========

_gemini_client = None

# RPM 제한 (Free Tier: 5 RPM)
_GEMINI_MAX_RPM = int(os.getenv('GEMINI_MAX_RPM', '5'))
_GEMINI_MIN_INTERVAL = 60.0 / _GEMINI_MAX_RPM  # 요청 간 최소 간격 = 12초
_gemini_request_timestamps: deque = deque()
_gemini_rate_lock = threading.Lock()
_gemini_last_call_time: float = 0.0

# 회로 차단기 — RPD=500, RPM=5 기준
_CB_THRESHOLD     = int(os.getenv('GEMINI_CB_THRESHOLD', '3'))
_CB_RATE_PAUSE    = int(os.getenv('GEMINI_CB_RATE_PAUSE',  '120'))   # RPM 초과: 2분 대기
_CB_QUOTA_PAUSE   = int(os.getenv('GEMINI_CB_QUOTA_PAUSE', '3600'))  # 일일 쿼터 소진: 1시간 대기
_cb_lock          = threading.Lock()
_cb_open_until:  float = 0.0   # 이 시각까지 차단
_cb_failures:    int   = 0     # 연속 실패 횟수
_cb_reason:      str   = ''    # 차단 원인 메시지


def _cb_is_open() -> bool:
    with _cb_lock:
        return time.monotonic() < _cb_open_until


def _parse_retry_delay(msg: str) -> int:
    """429 에러 메시지에서 retryDelay(초)를 추출. 없으면 0 반환."""
    import re
    m = re.search(r"retry[_ ](?:delay|in)['\"]?\s*[:\s]+['\"]?(\d+)", msg, re.IGNORECASE)
    if m:
        return int(m.group(1))
    m = re.search(r"retry in (\d+(?:\.\d+)?)s", msg, re.IGNORECASE)
    if m:
        return int(float(m.group(1))) + 5  # 여유 5초 추가
    return 0


def _cb_on_429(msg: str) -> None:
    """429 수신 시 차단기 상태 갱신."""
    global _cb_failures, _cb_open_until, _cb_reason
    is_quota = any(kw in msg.lower() for kw in ('quota', 'exhausted', 'resource_exhausted', 'daily', 'limit: 0'))
    # API가 알려준 retryDelay를 우선 사용, 없으면 설정값 사용
    suggested = _parse_retry_delay(msg)
    with _cb_lock:
        _cb_failures += 1
        if is_quota or _cb_failures >= _CB_THRESHOLD:
            if is_quota:
                pause = max(suggested, _CB_QUOTA_PAUSE)
                label = '쿼터 소진'
            else:
                pause = max(suggested, _CB_RATE_PAUSE)
                label = '속도 제한'
            _cb_open_until = time.monotonic() + pause
            _cb_reason = f"{label} — {pause // 60}분 차단"
            logger.error(f"Gemini 회로 차단기 ON: {_cb_reason}")


def _cb_on_success() -> None:
    global _cb_failures, _cb_reason
    with _cb_lock:
        _cb_failures = 0
        _cb_reason   = ''


def _gemini_rate_limit_wait():
    """호출 전 RPM 한도 + 최소 간격을 초과하지 않도록 대기."""
    global _gemini_last_call_time
    with _gemini_rate_lock:
        now = time.monotonic()
        window = 60.0

        # 요청 간 최소 간격 강제 (burst 방지)
        since_last = now - _gemini_last_call_time
        if since_last < _GEMINI_MIN_INTERVAL:
            gap = _GEMINI_MIN_INTERVAL - since_last
            logger.debug(f"Gemini 최소 간격 대기 — {gap:.1f}초")
            time.sleep(gap)
            now = time.monotonic()

        # 1분 초과된 타임스탬프 제거
        while _gemini_request_timestamps and now - _gemini_request_timestamps[0] >= window:
            _gemini_request_timestamps.popleft()

        if len(_gemini_request_timestamps) >= _GEMINI_MAX_RPM:
            oldest = _gemini_request_timestamps[0]
            wait = window - (now - oldest) + 0.5
            if wait > 0:
                logger.info(f"Gemini RPM 한도 도달 — {wait:.1f}초 대기")
                time.sleep(wait)
            now = time.monotonic()
            while _gemini_request_timestamps and now - _gemini_request_timestamps[0] >= window:
                _gemini_request_timestamps.popleft()

        _gemini_last_call_time = time.monotonic()
        _gemini_request_timestamps.append(_gemini_last_call_time)


def _get_gemini_client():
    """Gemini 클라이언트 싱글톤 — 매 요청마다 재생성하지 않음"""
    global _gemini_client
    if _gemini_client is None:
        api_key = os.getenv('GEMINI_API_KEY', '')
        if not api_key:
            return None
        try:
            from google import genai as google_genai
            _gemini_client = google_genai.Client(api_key=api_key)
        except Exception as e:
            logger.error(f"Gemini 클라이언트 초기화 실패 (의존 패키지 누락 등): {e}")
            return None
    return _gemini_client


def _call_gemini_with_retry(client, model, contents, max_retries=2):
    """
    RPM 제한 대기 후 호출.
    - 회로 차단기가 열려 있으면 즉시 예외 raise (쿼터 낭비 방지)
    - 429 시 재시도 (쿼터 절약, 회로 차단기 연동)
    - 503 시 재시도 (일시적 서버 과부하)
    - 연속 429 실패 시 회로 차단기 활성화
    """
    if _cb_is_open():
        with _cb_lock:
            reason = _cb_reason
        raise Exception(f"429 circuit breaker open: {reason}")

    last_exc = None
    for attempt in range(max_retries + 1):
        _gemini_rate_limit_wait()
        try:
            response = client.models.generate_content(model=model, contents=contents)
            _cb_on_success()
            if attempt > 0:
                logger.info(f"Gemini 재시도 성공 (attempt {attempt + 1})")
            return response
        except Exception as e:
            last_exc = e
            msg = str(e)
            if '429' in msg:
                _cb_on_429(msg)
                if attempt < max_retries and not _cb_is_open():
                    wait = 15 + random.uniform(0, 5)
                    logger.warning(f"Gemini 429 — {wait:.1f}초 후 재시도 ({attempt + 1}/{max_retries})")
                    time.sleep(wait)
                else:
                    raise
            elif '503' in msg or 'UNAVAILABLE' in msg:
                # 일시적 서버 과부하 — 짧은 대기 후 재시도
                if attempt < max_retries:
                    wait = 8 + random.uniform(0, 4) * (attempt + 1)
                    logger.warning(f"Gemini 503 (서버 과부하) — {wait:.1f}초 후 재시도 ({attempt + 1}/{max_retries})")
                    time.sleep(wait)
                else:
                    raise
            else:
                raise
    raise last_exc


def _calc_score_from_ssim(similarity, damage_count):
    """SSIM + 손상 개수로 상태 점수(0~100) 계산 (Gemini 폴백용)"""
    base = similarity * 100
    penalty = min(damage_count * 5, 30)
    return round(max(0, base - penalty))


def _score_to_condition(score):
    """점수를 등급 문자열로 변환"""
    if score >= 90:
        return 'excellent'
    if score >= 70:
        return 'good'
    if score >= 50:
        return 'fair'
    return 'poor'


def _default_gemini_comparison(ssim_similarity, ssim_diff_count):
    """Gemini 호출 실패 시 SSIM 기반 기본값 반환"""
    score = _calc_score_from_ssim(ssim_similarity, ssim_diff_count)
    return {
        'is_same_equipment': ssim_similarity > 0.85,
        'damages':           [],
        'overall_assessment': 'AI 분석 불가 — SSIM 기반 평가',
        'condition_score':   score,
        'final_condition':   _score_to_condition(score),
        'raw_response':      '',
    }


def _compare_with_gemini_return(filepath1, filepath2, ssim_similarity, ssim_diff_count, initial_condition_score=None):
    """반납 시 Gemini Vision으로 전/후 비교 — 장비 동일성 확인 + 새 손상 감지"""
    client = _get_gemini_client()
    if not client:
        logger.warning("API 작동 안할시 에러")
        return _default_gemini_comparison(ssim_similarity, ssim_diff_count)

    try:
        from google.genai import types as genai_types

        with open(filepath1, 'rb') as f:
            bytes1 = f.read()
        with open(filepath2, 'rb') as f:
            bytes2 = f.read()

        part1 = genai_types.Part.from_bytes(data=bytes1, mime_type='image/jpeg')
        part2 = genai_types.Part.from_bytes(data=bytes2, mime_type='image/jpeg')

        score_hint = f", 등록 시 상태점수: {initial_condition_score}점" if initial_condition_score else ""
        hint = (
            f"SSIM 유사도: {ssim_similarity:.3f} (1.0이 완전 동일), "
            f"픽셀 차이 영역: {ssim_diff_count}개{score_hint}"
        )

        prompt = f"""첫 번째 이미지는 장비 대여 전, 두 번째 이미지는 반납 후야. JSON만 반환해. 다른 텍스트 없이.
힌트: {hint}

{{
  "is_same_equipment": true 또는 false,
  "new_damages": ["대여 후 새로 생긴 손상 설명만 기재"],
  "condition": "excellent|good|fair|poor 중 하나",
  "condition_score": 0~100 정수,
  "summary": "변화 상태 한 줄 요약"
}}

condition_score 채점 기준 (반납 후 장비의 현재 외관 상태):
- 95~100점: 새 손상 전혀 없음. 대여 전과 동일하거나 더 깨끗함.
- 85~94점: 새 손상 없음. 아주 미세한 사용 흔적만 있어 기능에 영향 없음.
- 70~84점: 경미한 새 스크래치·흔적이 1~2개 있음. 기능에는 영향 없음.
- 50~69점: 눈에 띄는 새 손상·스크래치·변색이 있음.
- 30~49점: 심한 새 파손. 깨짐·큰 긁힘·변형이 있음.
-  0~29점: 심각한 파손. 사용 불가 수준의 새 손상.

채점 규칙:
1. 대여 전후 이미지를 직접 비교하여 새로 생긴 손상만 평가한다.
2. new_damages가 []이면 반드시 90점 이상을 부여한다.
3. 85점을 기본값으로 사용하지 말 것. 실제 비교 결과에 근거한 점수를 부여한다.
4. new_damages 목록의 손상 수와 심각도가 점수 감점에 반영되어야 한다."""

        gemini_model = os.getenv('GEMINI_MODEL', 'gemini-2.0-flash')
        response = _call_gemini_with_retry(client, gemini_model, [part1, part2, prompt])
        raw = response.text.strip()
        logger.info(f"Gemini 반납 비교 응답: {raw}")

        clean = raw.replace('```json', '').replace('```', '').strip()
        parsed = json.loads(clean)

        condition_score = int(parsed.get('condition_score', _calc_score_from_ssim(ssim_similarity, ssim_diff_count)))
        condition_score = max(0, min(100, condition_score))

        return {
            'is_same_equipment':  bool(parsed.get('is_same_equipment', True)),
            'damages':            [{'description': d, 'severity': 'minor', 'confidence': 0.8}
                                   for d in parsed.get('new_damages', [])],
            'overall_assessment': parsed.get('summary', ''),
            'condition_score':    condition_score,
            'final_condition':    parsed.get('condition', _score_to_condition(condition_score)),
            'raw_response':       raw,
        }

    except json.JSONDecodeError as e:
        logger.error(f"Gemini 반납 비교 JSON 파싱 실패: {e}")
        return _default_gemini_comparison(ssim_similarity, ssim_diff_count)
    except Exception as e:
        logger.error(f"Gemini 반납 비교 호출 실패: {e}")
        return _default_gemini_comparison(ssim_similarity, ssim_diff_count)


def _default_gemini_identify(yolo_type='other'):
    """Gemini 호출 실패 시 반환할 기본값"""
    return {
        'equipment_type':    yolo_type or 'other',
        'manufacturer':      'Unknown',
        'brand':             'Unknown',
        'model':             'Unknown',
        'serial_number':     None,
        'confidence':        0.0,
        'condition':         'good',
        'condition_score':   80,
        'damages':           [],
        'condition_summary': 'AI 분석 불가',
        'raw_response':      '',
    }


def _identify_with_gemini(filepath, yolo_type, ocr_lines):
    """Gemini Vision API로 장비 식별 + 초기 상태 평가"""
    client = _get_gemini_client()
    if not client:
        logger.warning("API 키 없으면 에러처리")
        return _default_gemini_identify(yolo_type)

    raw = ''
    try:
        from google.genai import types as genai_types

        with open(filepath, 'rb') as f:
            image_bytes = f.read()

        # 확장자에서 MIME 타입 결정
        ext = filepath.rsplit('.', 1)[-1].lower()
        mime = {'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png',
                'gif': 'image/gif', 'webp': 'image/webp'}.get(ext, 'image/jpeg')
        image_part = genai_types.Part.from_bytes(data=image_bytes, mime_type=mime)

        hint = (
            f"YOLO 감지 카테고리: {yolo_type or '없음'}, "
            f"OCR 추출 텍스트: {', '.join(ocr_lines[:5]) if ocr_lines else '없음'}"
        )

        prompt = f"""이 이미지의 전자 장비를 분석하여, 기타 텍스트 없이 JSON 형태로만 반환한다.
힌트: {hint}

{{
  "equipment_type": "laptop|tablet|mobile|camera|monitor|other 중 하나",
  "manufacturer": "제조사 (예: Samsung, Apple, Sony, Canon, LG, Dell)",
  "brand": "브랜드 (제조사와 같으면 동일하게)",
  "model": "모델명 (예: MacBook Air M2, Galaxy Tab S9+, EOS R50)",
  "serial_number": "이미지 내 라벨·스티커에서 명확히 읽히는 시리얼번호 텍스트만 기재. 보이지 않거나 불분명하면 반드시 null",
  "confidence": 0.0~1.0,
  "condition": "excellent|good|fair|poor 중 하나",
  "condition_score": 0~100 정수,
  "damages": ["실제로 보이는 스크래치·흠집·파손만 기재"],
  "condition_summary": "장비 상태 한 줄 요약"
}}

condition_score 채점 기준 (이미지에서 관찰된 외관 상태 기준):
- 95~100점: 미개봉·새것. 흠집·스크래치·오염 전혀 없음.
- 85~94점: 거의 새것. 아주 경미한 사용 흔적이 있지만 눈에 잘 띄지 않음.
- 70~84점: 정상 사용감. 가까이서 보면 작은 스크래치나 사용 흔적이 보임.
- 50~69점: 눈에 띄는 손상. 스크래치·변색·긁힘이 멀리서도 확인됨.
- 30~49점: 심한 손상. 깨짐·큰 스크래치·심한 변형이 있음.
-  0~29점: 사용 불가 수준. 심각한 파손·깨짐.

채점 규칙:
1. 이미지에서 실제로 보이는 외관만 평가. 보이지 않는 내부 손상은 감점하지 않는다.
2. 장비 외관이 깨끗하고 손상이 전혀 없으면 95점 이상을 부여한다.
3. 경미한 스크래치·흔적이 1~2개 있으면 75~84점 범위로 평가한다.
4. 85점을 기본값으로 사용하지 말 것. 반드시 이미지 상태에 근거한 점수를 부여한다.
5. damages 목록에 기재한 손상 수와 심각도가 점수에 반영되어야 한다. damages가 []이면 95점 이상.

serial_number: 이미지에서 실제로 읽히는 텍스트만 기재. 추측하거나 생성하지 말 것.
식별 불가 시 confidence를 낮게 설정. damages 없으면 []."""

        gemini_model = os.getenv('GEMINI_MODEL', 'gemini-2.0-flash')
        response = _call_gemini_with_retry(client, gemini_model, [image_part, prompt])
        raw = response.text.strip()
        logger.info(f"Gemini 식별 응답: {raw}")

        clean = raw.replace('```json', '').replace('```', '').strip()
        parsed = json.loads(clean)

        manufacturer = parsed.get('manufacturer', 'Unknown')
        condition_score = int(parsed.get('condition_score', 80))
        condition_score = max(0, min(100, condition_score))

        return {
            'equipment_type':    parsed.get('equipment_type', yolo_type or 'other'),
            'manufacturer':      manufacturer,
            'brand':             parsed.get('brand', manufacturer),
            'model':             parsed.get('model', 'Unknown'),
            'serial_number':     parsed.get('serial_number') or None,
            'confidence':        float(parsed.get('confidence', 0.5)),
            'condition':         parsed.get('condition', 'good'),
            'condition_score':   condition_score,
            'damages':           parsed.get('damages', []),
            'condition_summary': parsed.get('condition_summary', ''),
            'raw_response':      raw,
        }

    except json.JSONDecodeError as e:
        logger.error(f"Gemini JSON 파싱 실패: {e} / 원문: {raw}")
        return _default_gemini_identify(yolo_type)
    except Exception as e:
        logger.error(f"Gemini 호출 실패: {e}")
        return _default_gemini_identify(yolo_type)


# ========== 유틸리티 함수 ==========

def allowed_file(filename):
    """파일 확장자 확인"""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def save_upload(file, suffix=''):
    """업로드 파일을 temp 폴더에 저장하고 경로 반환"""
    filename = secure_filename(file.filename)
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    filename = f"{timestamp}{suffix}_{filename}"
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], 'temp', filename)
    file.save(filepath)
    return filepath


def remove_file(filepath):
    """임시 파일 삭제"""
    try:
        if filepath and os.path.exists(filepath):
            os.remove(filepath)
    except OSError as e:
        logger.warning(f"임시 파일 삭제 실패: {filepath} - {e}")


def _process_image(filepath, use_gemini=True):
    """
    YOLO + OCR + (선택적) Gemini Vision으로 이미지 처리 후 결과 반환.
    detect / analyze 양쪽에서 공통으로 사용.

    처리 순서:
        1. YOLO  → 장비 카테고리 + 위치
        2. OCR   → 텍스트 추출 (시리얼 번호 등)
        3. Gemini → 기종명 정밀 식별 (최초 등록 시에만, use_gemini=True일 때)
        4. 결과 통합

    Args:
        filepath:    저장된 이미지 경로
        use_gemini:  True이면 Gemini Vision 호출 (등록 시), False면 스킵 (스캔 시)
    Returns:
        dict: 처리 결과
    """
    # 1. YOLO 객체 감지
    detector = get_detector()
    detection_result = detector.detect_equipment(
        filepath,
        confidence_threshold=float(os.getenv('CONFIDENCE_THRESHOLD', 0.5))
    )

    # 2. OCR 텍스트 추출
    ocr = get_ocr()
    ocr_result = ocr.extract_text(filepath, preprocess=True)
    ocr_lines = ocr_result.get('lines', []) if ocr_result.get('success') else []

    # 3. YOLO 결과 정리
    if detection_result['success'] and detection_result['best_detection']:
        best = detection_result['best_detection']
        yolo_type = best['equipment_type']
        yolo_confidence = best['confidence']
    else:
        yolo_type = 'unknown'
        yolo_confidence = 0.0

    # 4. 브랜드/모델 식별
    #    등록(use_gemini=True) : Gemini Vision — 정밀 분석 + 상태 평가
    #    스캔(use_gemini=False): CLIP zero-shot — 로컬 실행, API 없음
    clip_result = None
    if use_gemini:
        gemini_result = _identify_with_gemini(filepath, yolo_type, ocr_lines)
    else:
        logger.info("스캔 모드 — CLIP 브랜드 분류 사용 (Gemini 스킵)")
        clip_result   = get_clip_classifier().classify(filepath, yolo_type)
        gemini_result = _default_gemini_identify(yolo_type)
        if clip_result['success']:
            gemini_result['manufacturer']      = clip_result['manufacturer']
            gemini_result['brand']             = clip_result['brand']
            gemini_result['model']             = clip_result['model_hint']
            gemini_result['confidence']        = clip_result['confidence']
            gemini_result['equipment_type']    = yolo_type
            gemini_result['condition_summary'] = (
                f"CLIP 분류: {clip_result['brand']} {clip_result['model_hint']} "
                f"(신뢰도 {clip_result['confidence']:.0%})"
            )

    logger.info(
        f"Gemini 식별 결과: {gemini_result['manufacturer']} {gemini_result['model']} "
        f"(신뢰도: {gemini_result['confidence']}, 상태: {gemini_result['condition']})"
    )

    # 5. 최종 필드 결정
    if gemini_result['manufacturer'] != 'Unknown':
        manufacturer   = gemini_result['manufacturer']
        brand          = gemini_result['brand']
        model          = gemini_result['model']
        confidence     = gemini_result['confidence']
        equipment_type = gemini_result['equipment_type']
    else:
        manufacturer, model = _parse_manufacturer_model(ocr_result)
        brand          = manufacturer
        confidence     = yolo_confidence
        equipment_type = yolo_type

    # 시리얼 번호: Gemini → OCR 순으로 우선순위, 없으면 None (생성 금지)
    gemini_serial = gemini_result.get('serial_number')
    ocr_serial    = ocr_result.get('serial_number')
    serial_number = gemini_serial or ocr_serial or None
    serial_found  = bool(gemini_serial or ocr_serial)

    # 시리얼 번호가 이미지에서 발견되지 않으면 무조건 수동 입력 요청
    requires_manual_selection = not serial_found

    return {
        'equipment_type':            equipment_type,
        'confidence':                confidence,
        'manufacturer':              manufacturer,
        'brand':                     brand,
        'model':                     model,
        'serial_number':             serial_number,
        'ocr_serial_found':          serial_found,
        'requires_manual_selection': requires_manual_selection,
        'condition':                 gemini_result['condition'],
        'condition_score':           gemini_result['condition_score'],
        'damages':                   gemini_result['damages'],
        'condition_summary':         gemini_result['condition_summary'],
        'ocr_result':                ocr_result,
        'detection_result':          detection_result,
        'gemini_result':             gemini_result,
        'clip_result':               clip_result,
    }


def _parse_manufacturer_model(ocr_result):
    """
    OCR 결과에서 제조사와 모델명 추출 (Gemini 실패 시 폴백용).
    라인이 없을 경우 'Unknown' 반환.
    """
    manufacturer = 'Unknown'
    model = 'Unknown'

    if ocr_result.get('success') and ocr_result.get('lines'):
        lines = ocr_result['lines']
        if len(lines) > 0:
            manufacturer = lines[0][:20]
        if len(lines) > 1:
            model = lines[1][:30]

    return manufacturer, model


# ========== 루트 경로 ==========

@app.route('/')
def index():
    """서버 정보"""
    gemini_enabled = bool(os.getenv('GEMINI_API_KEY', ''))
    return jsonify({
        'success': True,
        'message': 'AI Server is running with REAL MODELS',
        'version': '3.0.0',
        'models': {
            'yolo':       'YOLOv8 (Real)',
            'ocr':        'Tesseract (Real)',
            'gemini':     f"Gemini 2.0 Flash ({'enabled' if gemini_enabled else 'disabled — GEMINI_API_KEY 없음'})",
            'comparison': 'OpenCV SSIM (Real)'
        },
        'endpoints': [
            'GET  /',
            'GET  /api/status',
            'GET  /api/ping',
            'POST /api/detect',
            'POST /api/analyze',
            'POST /api/compare'
        ]
    })


# ========== 상태 체크 ==========

@app.route('/api/status', methods=['GET'])
def status():
    """서버 및 모델 상태 확인"""
    try:
        detector = get_detector()
        ocr      = get_ocr()
        clip     = get_clip_classifier()
        gemini_enabled = bool(os.getenv('GEMINI_API_KEY', ''))

        cb_open = _cb_is_open()
        with _cb_lock:
            cb_reason        = _cb_reason
            cb_failures      = _cb_failures
            cb_resume_in_sec = max(0, int(_cb_open_until - time.monotonic())) if cb_open else 0

        if gemini_enabled and cb_open:
            gemini_status = f'circuit_open (재개까지 {cb_resume_in_sec}초, 원인: {cb_reason})'
        elif gemini_enabled:
            gemini_status = 'enabled'
        else:
            gemini_status = 'disabled'

        model_status = {
            'yolo':       'loaded' if detector.model is not None else 'error',
            'ocr':        'ready' if ocr.available else 'unavailable',
            'gemini':     gemini_status,
            'comparison': 'ready',
            'clip':       'loaded' if clip._loaded else 'unavailable',
        }

        return jsonify({
            'success':   True,
            'status':    'online',
            'timestamp': datetime.now().isoformat(),
            'server':    'AI Detection Server (YOLO + OCR + Gemini)',
            'version':   '3.0.0',
            'models':    model_status,
            'gemini_circuit_breaker': {
                'open':            cb_open,
                'consecutive_429s': cb_failures,
                'resume_in_sec':   cb_resume_in_sec,
                'reason':          cb_reason,
            }
        })
    except Exception as e:
        logger.error(f"Status check error: {e}")
        return jsonify({
            'success': False,
            'error':   str(e),
            'message': 'AI models not loaded properly'
        }), 500


@app.route('/api/ping', methods=['GET'])
def ping():
    """간단한 연결 테스트"""
    return jsonify({
        'success':   True,
        'message':   'pong',
        'timestamp': datetime.now().isoformat()
    })


# ========== 장비 감지 API ==========

@app.route('/api/detect', methods=['POST'])
def detect_equipment():
    """YOLOv8 + OCR + Gemini Vision을 사용한 장비 감지"""
    start_time = datetime.now()
    filepath = None

    try:
        logger.info(f" Detection request from {request.remote_addr}")

        file = _validate_image_file(request)
        if isinstance(file, tuple):
            return file

        filepath = save_upload(file)
        logger.info(f" File saved: {filepath}")

        mode = request.form.get('mode') or request.args.get('mode', 'scan')
        logger.info(f" Mode: {mode!r}, form keys: {list(request.form.keys())}, args: {dict(request.args)}")
        result = _process_image(filepath, use_gemini=(mode == 'register'))
        processing_time = (datetime.now() - start_time).total_seconds()

        eq = result
        return jsonify({
            'success':           True,
            'message':           'Equipment detected successfully',
            'processing_method': 'yolo_ocr_gemini',
            'equipment': {
                'type':         eq['equipment_type'],
                'name':         f"{eq['manufacturer']} {eq['model']}",
                'manufacturer': eq['manufacturer'],
                'brand':        eq['brand'],
                'model':        eq['model'],
                'confidence':   eq['confidence'],
            },
            'serialNumber':              eq['serial_number'],
            'serial_number':             eq['serial_number'],
            'ocrSerialFound':            eq['ocr_serial_found'],
            'requiresManualSelection':   eq['requires_manual_selection'],
            'requires_manual_selection': eq['requires_manual_selection'],
            'condition':                 eq['condition'],
            'conditionScore':            eq['condition_score'],
            'condition_score':           eq['condition_score'],
            'damages':                   eq['damages'],
            'conditionSummary':          eq['condition_summary'],
            'condition_summary':         eq['condition_summary'],
            'extracted_text':            eq['ocr_result'].get('lines', []),
            'text':                      '\n'.join(eq['ocr_result'].get('lines', [])),
            'detections':                eq['detection_result'].get('detections', []),
            'num_detections':            eq['detection_result'].get('num_detections', 0),
            'clipResult':                eq.get('clip_result'),
            'processing_time':           round(processing_time, 3),
            'timestamp':                 datetime.now().isoformat(),
        })

    except Exception as e:
        logger.error(f" Detection error: {e}")
        return jsonify({
            'success':           False,
            'message':           'Detection failed',
            'error':             str(e),
            'processing_method': 'error'
        }), 500

    finally:
        remove_file(filepath)


# ========== 이미지 분석 API ==========

@app.route('/api/analyze', methods=['POST'])
def analyze_equipment():
    """장비 상태 상세 분석 (detect와 동일한 처리, 별도 엔드포인트 제공)"""
    start_time = datetime.now()
    filepath = None

    try:
        logger.info(f" Analyze request from {request.remote_addr}")

        file = _validate_image_file(request)
        if isinstance(file, tuple):
            return file

        filepath = save_upload(file, suffix='_analyze')
        logger.info(f" File saved: {filepath}")

        mode = request.form.get('mode', 'scan')
        result = _process_image(filepath, use_gemini=(mode == 'register'))
        processing_time = (datetime.now() - start_time).total_seconds()

        eq = result
        return jsonify({
            'success':           True,
            'message':           'Equipment analyzed successfully',
            'processing_method': 'yolo_ocr_gemini',
            'equipment': {
                'type':         eq['equipment_type'],
                'name':         f"{eq['manufacturer']} {eq['model']}",
                'manufacturer': eq['manufacturer'],
                'brand':        eq['brand'],
                'model':        eq['model'],
                'confidence':   eq['confidence'],
            },
            'serialNumber':              eq['serial_number'],
            'serial_number':             eq['serial_number'],
            'ocrSerialFound':            eq['ocr_serial_found'],
            'requiresManualSelection':   eq['requires_manual_selection'],
            'requires_manual_selection': eq['requires_manual_selection'],
            'condition':                 eq['condition'],
            'conditionScore':            eq['condition_score'],
            'condition_score':           eq['condition_score'],
            'damages':                   eq['damages'],
            'conditionSummary':          eq['condition_summary'],
            'condition_summary':         eq['condition_summary'],
            'extracted_text':            eq['ocr_result'].get('lines', []),
            'text':                      '\n'.join(eq['ocr_result'].get('lines', [])),
            'detections':                eq['detection_result'].get('detections', []),
            'num_detections':            eq['detection_result'].get('num_detections', 0),
            'clipResult':                eq.get('clip_result'),
            'processing_time':           round(processing_time, 3),
            'timestamp':                 datetime.now().isoformat(),
        })

    except Exception as e:
        logger.error(f" Analysis error: {e}")
        return jsonify({
            'success': False,
            'message': 'Analysis failed',
            'error':   str(e)
        }), 500

    finally:
        remove_file(filepath)


# ========== 이미지 비교 API ==========

@app.route('/api/compare', methods=['POST'])
def compare_images():
    """OpenCV SSIM을 사용한 이미지 비교"""
    start_time = datetime.now()
    filepath1 = filepath2 = None

    try:
        logger.info(f" Comparison request from {request.remote_addr}")

        if 'image1' not in request.files or 'image2' not in request.files:
            return jsonify({
                'success': False,
                'message': 'Two images required (image1, image2)',
                'error':   'MISSING_IMAGES'
            }), 400

        file1 = request.files['image1']
        file2 = request.files['image2']

        if not allowed_file(file1.filename) or not allowed_file(file2.filename):
            return jsonify({
                'success': False,
                'message': 'Invalid file type',
                'error':   'INVALID_FILE'
            }), 400

        filepath1 = save_upload(file1, suffix='_1')
        filepath2 = save_upload(file2, suffix='_2')
        logger.info(f" Files saved: {filepath1}, {filepath2}")

        comparator = get_comparator()
        ssim_result = comparator.compare_images(filepath1, filepath2)

        if not ssim_result['success']:
            raise Exception(ssim_result.get('error', 'Comparison failed'))

        mode = request.form.get('mode', 'ssim')
        if mode == 'return':
            # 반납 시: Gemini Vision 비교 (동일 장비 확인 + 새 손상 감지)
            initial_score = request.form.get('initialConditionScore')
            initial_score = int(initial_score) if initial_score and initial_score.isdigit() else None
            try:
                gemini_result = _compare_with_gemini_return(
                    filepath1, filepath2,
                    ssim_result['similarity'],
                    ssim_result['num_differences'],
                    initial_condition_score=initial_score
                )
            except Exception as gemini_err:
                logger.error(f"Gemini 반납 비교 예외 (SSIM 기본값으로 폴백): {gemini_err}")
                gemini_result = _default_gemini_comparison(
                    ssim_result['similarity'],
                    ssim_result['num_differences']
                )
        else:
            # 기본: SSIM 기반 평가만 사용
            gemini_result = _default_gemini_comparison(
                ssim_result['similarity'],
                ssim_result['num_differences']
            )

        is_same_equipment = gemini_result['is_same_equipment']

        processing_time = (datetime.now() - start_time).total_seconds()

        return jsonify({
            'success':           True,
            'message':           'Images compared successfully',
            'processing_method': 'opencv_ssim_gemini',
            # SSIM 결과
            'similarity':        ssim_result['similarity'],
            'differences':       ssim_result['differences'],
            'num_differences':   ssim_result['num_differences'],
            # 통합 판정
            'isSameEquipment':   is_same_equipment,
            'is_same_equipment': is_same_equipment,
            'hasDamage':         len(gemini_result['damages']) > 0 or ssim_result['has_damage'],
            'has_damage':        len(gemini_result['damages']) > 0 or ssim_result['has_damage'],
            # Gemini 상세 분석
            'damages':           gemini_result['damages'],
            'conditionScore':    gemini_result['condition_score'],
            'condition_score':   gemini_result['condition_score'],
            'finalCondition':    gemini_result['final_condition'],
            'final_condition':   gemini_result['final_condition'],
            'overallAssessment': gemini_result['overall_assessment'],
            'geminiAnalysis':    gemini_result,
            'processing_time':   round(processing_time, 3),
            'timestamp':         datetime.now().isoformat()
        })

    except Exception as e:
        logger.error(f" Comparison error: {e}")
        return jsonify({
            'success': False,
            'message': 'Comparison failed',
            'error':   str(e)
        }), 500

    finally:
        remove_file(filepath1)
        remove_file(filepath2)


# ========== 공통 검증 ==========

def _validate_image_file(req):
    """
    request에서 'image' 파일을 꺼내 검증.
    유효하면 파일 객체 반환, 아니면 (Response, status_code) 튜플 반환.
    """
    if 'image' not in req.files:
        return jsonify({
            'success': False,
            'message': 'No image file provided',
            'error':   'MISSING_IMAGE'
        }), 400

    file = req.files['image']

    if file.filename == '' or not allowed_file(file.filename):
        return jsonify({
            'success': False,
            'message': 'Invalid file',
            'error':   'INVALID_FILE'
        }), 400

    return file


# ========== 에러 핸들러 ==========

@app.errorhandler(404)
def not_found(_):
    return jsonify({
        'success': False,
        'message': 'Endpoint not found',
        'error':   'NOT_FOUND',
        'available_endpoints': [
            'GET  /',
            'GET  /api/status',
            'GET  /api/ping',
            'POST /api/detect',
            'POST /api/analyze',
            'POST /api/compare'
        ]
    }), 404


@app.errorhandler(413)
def request_entity_too_large(_):
    return jsonify({
        'success': False,
        'message': 'File too large (max 20MB)',
        'error':   'FILE_TOO_LARGE'
    }), 413


@app.errorhandler(500)
def internal_error(e):
    logger.error(f"Internal server error: {e}")
    return jsonify({
        'success': False,
        'message': 'Internal server error',
        'error':   'SERVER_ERROR'
    }), 500


# ========== 메인 실행 ==========

if __name__ == '__main__':
    gemini_enabled = bool(os.getenv('GEMINI_API_KEY', ''))
    print("=" * 60)
    print(" AI Detection Server — YOLO + OCR + Gemini Vision")
    print("=" * 60)
    print(" YOLOv8        - Object Detection")
    print(" Tesseract OCR  - Text Extraction")
    print(f"{'' if gemini_enabled else ' '} Gemini Vision   - Device Model ID ({'enabled' if gemini_enabled else 'GEMINI_API_KEY 없음'})")
    print(" OpenCV SSIM   - Image Comparison")
    print("=" * 60)
    print(f" Server: http://{os.getenv('FLASK_HOST', '0.0.0.0')}:{os.getenv('FLASK_PORT', 5001)}")
    print(f" Upload: {UPLOAD_FOLDER}")
    print("=" * 60)

    try:
        logger.info(" Pre-loading AI models...")
        get_detector()
        get_ocr()
        get_clip_classifier()
        logger.info(" All models loaded successfully!")
    except Exception as e:
        logger.error(f" Model loading error: {e}")
        logger.warning("  Server will start but AI features may not work")

    # 첫 번째 실제 요청에서 발생하는 PyTorch/OpenMP 초기화 지연 방지용 워밍업
    # (CLIP ViT, YOLO 모두 첫 추론 시 스레드 풀·메모리 할당이 느림)
    try:
        import tempfile
        import numpy as np
        from PIL import Image as PILImage

        logger.info(" AI 모델 워밍업 시작 (더미 추론)...")
        dummy_arr = np.zeros((64, 64, 3), dtype=np.uint8)
        dummy_img = PILImage.fromarray(dummy_arr)
        with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as _f:
            _dummy_path = _f.name
            dummy_img.save(_dummy_path)

        get_detector().detect_equipment(_dummy_path)
        get_clip_classifier().classify(_dummy_path, 'laptop')
        os.remove(_dummy_path)
        logger.info(" AI 모델 워밍업 완료 — 첫 요청부터 빠르게 응답합니다")
    except Exception as _e:
        logger.warning(f" 워밍업 실패 (무시됨): {_e}")

    app.run(
        host=os.getenv('FLASK_HOST', '0.0.0.0'),
        port=int(os.getenv('FLASK_PORT', 5001)),
        debug=os.getenv('FLASK_DEBUG', '1') == '1',
        threaded=True,       # 동시 요청 처리
        use_reloader=False   # venv 파일 변경 감지로 인한 재시작 방지
    )