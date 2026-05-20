import os
import json
from services.gemini_client import call_gemini_json, call_gemini
from services.categorizer import get_categories

STORAGE_DIR = "storage"

def prioritize_categories(question: str, history: list, categories: list[dict]) -> list[dict]:
    """
    질문 기반으로 대카테고리 우선순위 분류 (0~3)
    0: 가능성 높음, 1: 가능성 있음, 2: 낮음, 3: 관련 없음
    """
    cat_list = "\n".join([f"{i+1}. {c['name']}: {c['description']}" for i, c in enumerate(categories)])
    history_text = "\n".join([f"{m.get('role', 'user')}: {m.get('content', '')}" for m in history[-4:]])

    prompt = f"""사용자 질문: {question}
최근 대화:
{history_text}

다음 카테고리 목록에서 질문의 답변이 있을 가능성을 분류해줘.
0: 가능성 높음 | 1: 가능성 있음 | 2: 가능성 낮음 | 3: 관련 없음

{cat_list}

JSON으로만 응답:
{{"priorities": [{{"category": "카테고리명", "score": 0}}]}}"""

    try:
        result = call_gemini_json(prompt)
        priorities = result.get("priorities", [])
        # score 오름차순 정렬, score 3 제외
        sorted_cats = sorted(
            [p for p in priorities if p.get("score", 3) < 3],
            key=lambda x: x.get("score", 3)
        )
        return sorted_cats
    except Exception as e:
        print(f"Error prioritizing categories: {e}")
        # 에러 발생 시 모든 대카테고리를 동등한 우선순위로 반환
        return [{"category": c["name"], "score": 1} for c in categories]

def prioritize_sub_categories(question: str, category_name: str, sub_categories: list[str]) -> list[str]:
    """소카테고리 우선순위 분류"""
    sub_list = "\n".join([f"{i+1}. {s}" for i, s in enumerate(sub_categories)])

    prompt = f"""사용자 질문: {question}
카테고리: {category_name}

다음 소카테고리 중 답변이 있을 가능성 순서대로 정렬해줘.
관련 없는 항목은 제외해도 돼.

{sub_list}

JSON으로만 응답:
{{"ordered": ["소카테고리명1", "소카테고리명2"]}}"""

    try:
        result = call_gemini_json(prompt)
        return result.get("ordered", [])
    except Exception as e:
        print(f"Error prioritizing subcategories: {e}")
        return sub_categories

def check_found(question: str, category: str, sub: str, content: str) -> dict:
    """해당 소카테고리 내용에서 답변 가능 여부 판단"""
    if not content.strip():
        return {"found": False, "relevant_sections": [], "source": f"{category} > {sub}"}

    prompt = f"""사용자 질문: {question}

다음 규정 내용에서 질문에 대한 답변을 찾을 수 있어?

[{category} > {sub}]
{content[:4000]}

JSON으로만 응답:
{{
  "found": true 또는 false,
  "relevant_sections": ["관련된 조항 원문을 그대로"]
}}"""

    try:
        result = call_gemini_json(prompt)
        result["source"] = f"{category} > {sub}"
        # found 값을 boolean으로 강제 변환
        if isinstance(result.get("found"), str):
            result["found"] = result["found"].lower() == "true"
        return result
    except Exception as e:
        print(f"Error checking found in {category} > {sub}: {e}")
        return {"found": False, "relevant_sections": [], "source": f"{category} > {sub}"}

def generate_answer(question: str, source: str, relevant_sections: list[str], history: list) -> str:
    """답변 생성"""
    sections_text = "\n".join(relevant_sections)
    history_text = "\n".join([f"{m.get('role', 'user')}: {m.get('content', '')}" for m in history[-4:]])

    prompt = f"""사용자 질문: {question}

관련 규정:
출처: {source}
내용:
{sections_text}

최근 대화:
{history_text}

다음 조건으로 답변해:
1. 출처({source})와 해당 조항을 명시해
2. 친근하고 대화체로 자연스럽게 설명해
3. 사용자가 추가 정보를 주면 더 정확히 안내할 수 있다고 마지막에 언급해
4. 100~200자 내외로 간결하게"""

    return call_gemini(prompt)

def generate_fallback(path_taken: list[dict]) -> str:
    """답변 못 찾았을 때 fallback 응답"""
    searched = "\n".join([f"- {p['category']} > {p['sub']}" for p in path_taken])
    return f"""현재 등록된 규정에서 관련 내용을 찾을 수 없었습니다.

**탐색한 항목:**
{searched if searched else "- 탐색된 카테고리 없음"}

해당 내용은 담당 부서에 직접 문의해 주시기 바랍니다."""

def decide_research(question: str, prev_answer: str, prev_source: str) -> bool:
    """후속 질문 시 재탐색 필요 여부 판단"""
    prompt = f"""이전 답변: {prev_answer}
이전 출처: {prev_source}
새로운 사용자 메시지: {question}

새로운 정보를 바탕으로 기존 규정 내용만으로 답변이 가능해,
아니면 다른 카테고리 추가 탐색이 필요해?

JSON으로만: {{"need_research": true 또는 false}}"""

    try:
        result = call_gemini_json(prompt)
        need = result.get("need_research", True)
        if isinstance(need, str):
            need = need.lower() == "true"
        return need
    except Exception as e:
        print(f"Error deciding research need: {e}")
        return True

def run_query(question: str, history: list) -> dict:
    """
    전체 질문 처리 파이프라인
    반환: { answer, source, relevant_sections, path_taken, found }
    """
    categories = get_categories()
    path_taken = []

    # 후속 질문이고 재탐색 불필요한 경우
    if history:
        last = history[-1]
        if last.get("role") == "assistant" and last.get("source"):
            need = decide_research(question, last["content"], last["source"])
            if not need:
                # 기존 출처 내용으로 바로 답변
                source = last["source"]
                try:
                    cat_name, sub_name = source.split(" > ")
                    content_path = os.path.join(STORAGE_DIR, cat_name, f"{sub_name}.txt")
                    if os.path.exists(content_path):
                        with open(content_path, "r", encoding="utf-8") as f:
                            content = f.read()
                        check = check_found(question, cat_name, sub_name, content)
                        if check["found"]:
                            answer = generate_answer(question, source, check["relevant_sections"], history)
                            return {
                                "answer": answer,
                                "source": source,
                                "relevant_sections": check["relevant_sections"],
                                "path_taken": [],
                                "found": True
                            }
                except Exception as ex:
                    print(f"Error processing follow-up question on existing source: {ex}")

    # 대카테고리 우선순위 분류
    priority_cats = prioritize_categories(question, history, categories)

    for cat_item in priority_cats:
        cat_name = cat_item["category"]
        cat_data = next((c for c in categories if c["name"] == cat_name), None)
        if not cat_data:
            continue

        # 소카테고리 우선순위 분류
        ordered_subs = prioritize_sub_categories(question, cat_name, cat_data["sub_categories"])

        for sub in ordered_subs:
            content_path = os.path.join(STORAGE_DIR, cat_name, f"{sub}.txt")
            if not os.path.exists(content_path):
                continue

            try:
                with open(content_path, "r", encoding="utf-8") as f:
                    content = f.read()
            except Exception as e:
                print(f"Error reading file {content_path}: {e}")
                continue

            check = check_found(question, cat_name, sub, content)
            path_taken.append({
                "category": cat_name,
                "sub": sub,
                "found": check["found"]
            })

            if check["found"]:
                answer = generate_answer(question, check["source"], check["relevant_sections"], history)
                return {
                    "answer": answer,
                    "source": check["source"],
                    "relevant_sections": check["relevant_sections"],
                    "path_taken": path_taken,
                    "found": True
                }

    # 모든 카테고리 소진 → fallback
    return {
        "answer": generate_fallback(path_taken),
        "source": None,
        "relevant_sections": [],
        "path_taken": path_taken,
        "found": False
    }
