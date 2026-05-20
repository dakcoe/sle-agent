import google.generativeai as genai
import os
import json
import re
from dotenv import load_dotenv

# .env 파일 로드
load_dotenv()

# API 키 구성
api_key = os.getenv("GEMINI_API_KEY")
if api_key:
    genai.configure(api_key=api_key)
else:
    # 환경변수가 설정되지 않은 경우 개발 도중 경고 처리
    print("[WARNING] GEMINI_API_KEY is not set in the environment or .env file.")

model = genai.GenerativeModel("gemini-3.5-flash")

def call_gemini(prompt: str) -> str:
    """Gemini API 기본 텍스트 호출"""
    try:
        response = model.generate_content(prompt)
        return response.text
    except Exception as e:
        print(f"[Error calling Gemini]: {e}")
        return f"에러가 발생했습니다: {str(e)}"

def call_gemini_json(prompt: str) -> dict:
    """
    JSON 응답을 강제하는 Gemini 호출 로직.
    마크다운 ```json ... ``` 블록 제거 파싱 및 예외 시 1회 재시도 포함.
    """
    for attempt in range(2):
        try:
            response = model.generate_content(prompt)
            text = response.text.strip()
            
            # 마크다운 ```json ... ``` 형태 제거
            if text.startswith("```"):
                # ```json 또는 ``` 이 시작될 수 있음
                text = re.sub(r"^```(?:json)?\n", "", text)
                text = re.sub(r"\n```$", "", text)
            
            text = text.strip()
            return json.loads(text)
        except Exception as e:
            print(f"[Attempt {attempt + 1} Failed] JSON Parsing Error: {e}. Text returned: {response.text if 'response' in locals() else 'None'}")
            if attempt == 1:
                raise ValueError(f"Gemini JSON parsing has failed after retry. Error: {str(e)}")
            continue

def call_gemini_vision(image_path: str, prompt: str) -> str:
    """이미지 + 텍스트 멀티모달 호출"""
    import PIL.Image
    try:
        img = PIL.Image.open(image_path)
        response = model.generate_content([prompt, img])
        return response.text
    except Exception as e:
        print(f"[Error calling Gemini Vision]: {e}")
        return f"이미지 처리 중 에러가 발생했습니다: {str(e)}"
