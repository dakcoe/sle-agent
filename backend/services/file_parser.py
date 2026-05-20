import os
import pdfplumber
from docx import Document

def parse_file(file_path: str) -> str:
    """파일 전체 텍스트 추출"""
    ext = file_path.lower().split(".")[-1]
    if ext == "pdf":
        return _parse_pdf(file_path)
    elif ext == "docx":
        return _parse_docx(file_path)
    elif ext in ["jpg", "jpeg", "png"]:
        return _parse_image(file_path)
    else:
        raise ValueError(f"지원하지 않는 파일 형식: {ext}")

def parse_first_page(file_path: str) -> str:
    """카테고리 분류용 첫 페이지만 추출"""
    ext = file_path.lower().split(".")[-1]
    if ext == "pdf":
        try:
            with pdfplumber.open(file_path) as pdf:
                if len(pdf.pages) > 0:
                    return pdf.pages[0].extract_text() or ""
                return ""
        except Exception as e:
            print(f"PDF First Page Parse Error: {e}")
            return ""
    elif ext == "docx":
        try:
            doc = Document(file_path)
            # 첫 20개 단락만
            return "\n".join([p.text for p in doc.paragraphs[:20]])
        except Exception as e:
            print(f"DOCX First Page Parse Error: {e}")
            return ""
    return parse_file(file_path)

def _parse_pdf(file_path: str) -> str:
    with pdfplumber.open(file_path) as pdf:
        texts = []
        for i, page in enumerate(pdf.pages):
            text = page.extract_text()
            if text:
                texts.append(text)
        return "\n".join(texts)

def _parse_docx(file_path: str) -> str:
    doc = Document(file_path)
    parts = []
    for para in doc.paragraphs:
        if para.text.strip():
            parts.append(para.text)
    # 테이블도 추출
    for table in doc.tables:
        for row in table.rows:
            row_text = " | ".join(cell.text.strip() for cell in row.cells)
            if row_text.strip():
                parts.append(row_text)
    return "\n".join(parts)

def _parse_image(file_path: str) -> str:
    # 순환 참조 피하기 위해 내부 임포트 수행
    from services.gemini_client import call_gemini_vision
    return call_gemini_vision(
        file_path,
        "이 이미지에서 텍스트를 전부 추출해줘. 표나 항목 구조가 있으면 그대로 유지해줘."
    )
