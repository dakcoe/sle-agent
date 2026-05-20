import os
import json
import re
from services.gemini_client import call_gemini_json, call_gemini
from services.file_parser import parse_first_page, parse_file

STORAGE_DIR = "storage"

def propose_categories(uploaded_files: list[str]) -> list[dict]:
    """
    업로드된 파일들의 첫 페이지를 읽고 카테고리 초안 제안
    """
    summaries = []
    for path in uploaded_files:
        if not os.path.exists(path):
            continue
        first_page = parse_first_page(path)
        summaries.append(f"[파일명: {os.path.basename(path)}]\n{first_page[:500]}")

    if not summaries:
        return []

    nl = "\n"
    prompt = f"""다음은 여러 문서들의 파일명과 첫 페이지 내용이야.
이 문서들을 분류하기 위한 카테고리 구조를 제안해줘.

{nl.join(summaries)}

다음 JSON 형식으로만 응답해. 다른 텍스트는 절대 포함하지 마:
{{
  "categories": [
    {{
      "name": "카테고리명",
      "description": "한 줄 설명",
      "sub_categories": ["소카테고리1", "소카테고리2"]
    }}
  ]
}}"""

    try:
        result = call_gemini_json(prompt)
        return result.get("categories", [])
    except Exception as e:
        print(f"Error proposing categories: {e}")
        return []

def save_categories(categories: list[dict]):
    """확정된 카테고리 구조를 categories.json에 저장하고 폴더 생성"""
    os.makedirs(STORAGE_DIR, exist_ok=True)

    with open(os.path.join(STORAGE_DIR, "categories.json"), "w", encoding="utf-8") as f:
        json.dump({"categories": categories}, f, ensure_ascii=False, indent=2)

    # 폴더 구조 생성
    for cat in categories:
        cat_name = cat["name"]
        for sub in cat["sub_categories"]:
            folder = os.path.join(STORAGE_DIR, cat_name)
            os.makedirs(folder, exist_ok=True)
            # 빈 txt 파일 초기화
            filepath = os.path.join(folder, f"{sub}.txt")
            if not os.path.exists(filepath):
                with open(filepath, "w", encoding="utf-8") as f:
                    pass

def process_document(file_path: str, categories: list[dict]):
    """
    문서 전체를 읽고 각 소카테고리에 해당하는 내용을 분류해서 저장.
    조항 번호, 항목 번호 등 원본 구조를 보존.
    """
    if not os.path.exists(file_path):
        return

    full_text = parse_file(file_path)

    for cat in categories:
        cat_name = cat["name"]
        for sub in cat["sub_categories"]:
            prompt = f"""다음 문서에서 [{cat_name} > {sub}]에 해당하는 내용만 추출해줘.

조항 번호(제1조, 제2조 등), 항목 번호(1., 2., ①, ② 등), 제목 등 원본 구조를 그대로 유지해서 추출해줘.
해당 내용이 전혀 없으면 빈 문자열만 반환해.
설명이나 다른 텍스트는 절대 추가하지 마.

[문서 내용]
{full_text[:8000]}"""

            extracted = call_gemini(prompt).strip()

            # 마크다운 ``` 블록이 섞여있다면 제거
            if extracted.startswith("```"):
                extracted = re.sub(r"^```(?:[a-zA-Z]+)?\n", "", extracted)
                extracted = re.sub(r"\n```$", "", extracted)
                extracted = extracted.strip()

            if extracted and extracted != "빈 문자열" and len(extracted) > 5:
                folder = os.path.join(STORAGE_DIR, cat_name)
                os.makedirs(folder, exist_ok=True)
                filepath = os.path.join(folder, f"{sub}.txt")
                with open(filepath, "a", encoding="utf-8") as f:
                    f.write(f"\n\n--- 출처: {os.path.basename(file_path)} ---\n")
                    f.write(extracted)

def get_categories() -> list[dict]:
    """저장된 카테고리 구조 반환"""
    path = os.path.join(STORAGE_DIR, "categories.json")
    if not os.path.exists(path):
        return []
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f).get("categories", [])
    except Exception as e:
        print(f"Error loading categories.json: {e}")
        return []
