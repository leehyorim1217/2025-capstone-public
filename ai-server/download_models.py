#!/usr/bin/env python3
"""
AI 모델 자동 다운로드 스크립트
"""

import os
import sys
import urllib.request
from pathlib import Path

def download_yolo_model():
    """YOLOv8 모델 다운로드"""
    models_dir = Path("models")
    models_dir.mkdir(exist_ok=True)
    
    model_path = models_dir / "yolov8n.pt"
    
    if model_path.exists():
        print(f" YOLOv8 모델이 이미 존재합니다: {model_path}")
        return
    
    print(" YOLOv8 모델 다운로드 중...")
    
    try:
        # Ultralytics에서 직접 다운로드
        from ultralytics import YOLO
        
        # YOLOv8 nano 모델 로드 (자동 다운로드)
        model = YOLO('yolov8n.pt')
        
        # 모델 파일을 지정된 경로로 이동
        import shutil
        if os.path.exists('yolov8n.pt'):
            shutil.move('yolov8n.pt', str(model_path))
            print(f" YOLOv8 모델 다운로드 완료: {model_path}")
        
    except ImportError:
        print(" ultralytics 패키지가 없습니다. pip install로 다운로드를 시도합니다.")
        
        # 직접 다운로드 URL
        url = "https://github.com/ultralytics/assets/releases/download/v0.0.0/yolov8n.pt"
        
        try:
            print(f" 다운로드 중: {url}")
            urllib.request.urlretrieve(url, str(model_path))
            print(f" YOLOv8 모델 다운로드 완료: {model_path}")
        except Exception as e:
            print(f" 모델 다운로드 실패: {e}")
            sys.exit(1)

def download_additional_models():
    """추가 AI 모델들 다운로드"""
    models_dir = Path("models")
    
    # 장비 분류 모델 (예시)
    equipment_model_path = models_dir / "equipment_classifier.pt"
    
    if not equipment_model_path.exists():
        print(" 장비 분류 모델은 프로젝트에서 직접 훈련된 모델을 사용합니다.")
        # 실제 프로젝트에서는 여기에 사용자 정의 모델 다운로드 로직 추가
        
        # 임시 더미 파일 생성 (실제로는 훈련된 모델 사용)
        equipment_model_path.touch()
        print(f" 임시 모델 파일 생성: {equipment_model_path}")

if __name__ == "__main__":
    print(" AI 모델 다운로드 시작...")
    
    # YOLOv8 모델 다운로드
    download_yolo_model()
    
    # 추가 모델들 다운로드
    download_additional_models()
    
    print(" 모든 모델 다운로드 완료!")