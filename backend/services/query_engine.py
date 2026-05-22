import os
from services.gemini_client import call_gemini_json, call_gemini

RELEVANCE_CUTOFF = 2  # 0 매우높음 | 1 높음 | 2 보통 | 3 낮음(무시) | 4 관련없음(무시)


def _storage(admin_id: int) -> str:
    return os.path.join("storage", str(admin_id))


def rank_dir_items(question: str, history: list, items: list) -> list:
    """현재 디렉토리 항목들을 이름 기반으로 관련도 순위 정렬, 임계값 초과 항목 제거"""
    if not items:
        return []

    history_text = "\n".join([
        f"{m.get('role','user')}: {m.get('content','')}" for m in history[-2:]
    ])

    # 폴더는 내부 항목 이름도 함께 표시해 Gemini가 맥락 파악 가능하도록
    names_list_parts = []
    for i, item in enumerate(items):
        desc = f"{i+1}. [{item['type']}] {item['name']}"
        if item["type"] == "폴더":
            try:
                children = [
                    e.name[:-4] if e.name.endswith(".txt") else e.name
                    for e in os.scandir(item["path"])
                    if e.name != "categories.json"
                ]
                if children:
                    desc += f" (하위: {', '.join(children[:6])})"
            except Exception:
                pass
        names_list_parts.append(desc)

    names_list = "\n".join(names_list_parts)

    prompt = f"""사용자 질문: {question}
최근 대화: {history_text}

다음 번호별 파일/폴더 중 질문의 답변이 있을 가능성을 점수로 매겨줘.
폴더의 경우 하위 항목 이름도 참고해.
0: 매우 높음 | 1: 높음 | 2: 보통 | 3: 낮음 | 4: 관련 없음

{names_list}

JSON으로만 응답 (번호는 위 목록의 번호):
{{"rankings": [{{"index": 1, "score": 0}}]}}"""

    try:
        result = call_gemini_json(prompt)
        index_scores = {r["index"]: r.get("score", 4) for r in result.get("rankings", [])}
        for i, item in enumerate(items):
            item["score"] = index_scores.get(i + 1, 4)
        filtered = [item for item in items if item["score"] <= RELEVANCE_CUTOFF]
        return sorted(filtered, key=lambda x: x["score"])
    except Exception as e:
        print(f"Error ranking items: {e}")
        return items


def check_found(question: str, file_name: str, content: str) -> dict:
    if not content.strip():
        return {"found": False, "relevant_sections": []}

    prompt = f"""사용자 질문: {question}

다음 규정 내용에서 질문에 대한 답변을 찾을 수 있어?

[{file_name}]
{content[:4000]}

JSON으로만 응답:
{{
  "found": true 또는 false,
  "relevant_sections": ["관련된 조항 원문을 그대로"]
}}"""

    try:
        result = call_gemini_json(prompt)
        if isinstance(result.get("found"), str):
            result["found"] = result["found"].lower() == "true"
        return result
    except Exception as e:
        print(f"Error checking found in {file_name}: {e}")
        return {"found": False, "relevant_sections": []}


def generate_answer(question: str, source: str, relevant_sections: list, history: list) -> str:
    sections_text = "\n".join(relevant_sections)
    history_text = "\n".join([
        f"{m.get('role', 'user')}: {m.get('content', '')}" for m in history[-4:]
    ])

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


def generate_fallback(path_taken: list) -> str:
    searched = "\n".join([
        f"- {'📁' if p['type'] == '폴더' else '📄'} {p['name']}" for p in path_taken
    ])
    return f"""현재 등록된 규정에서 관련 내용을 찾을 수 없었습니다.

**탐색한 항목:**
{searched if searched else "- 탐색된 항목 없음"}

해당 내용은 담당 부서에 직접 문의해 주시기 바랍니다."""


def decide_research(question: str, prev_answer: str, prev_source: str) -> bool:
    prompt = f"""이전 답변: {prev_answer}
이전 출처: {prev_source}
새로운 사용자 메시지: {question}

새로운 정보를 바탕으로 기존 규정 내용만으로 답변이 가능해,
아니면 다른 항목 추가 탐색이 필요해?

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


def search_dir(question: str, history: list, dir_path: str, storage_base: str,
               path_taken: list, depth: int = 0, max_depth: int = 6) -> dict | None:
    """재귀적 디렉토리 탐색 — 이름 기반 관련도 순위로 가지치기"""
    if depth > max_depth:
        return None

    try:
        entries = list(os.scandir(dir_path))
    except Exception:
        return None

    items = []
    for entry in entries:
        if entry.name == "categories.json":
            continue
        if entry.is_dir():
            items.append({"name": entry.name, "path": entry.path, "type": "폴더"})
        elif entry.is_file() and entry.name.endswith(".txt"):
            items.append({"name": entry.name[:-4], "path": entry.path, "type": "파일"})

    if not items:
        return None

    ranked = rank_dir_items(question, history, items)

    for item in ranked:
        if item["type"] == "폴더":
            path_taken.append({"name": item["name"], "type": "폴더", "found": False})
            result = search_dir(question, history, item["path"], storage_base,
                                path_taken, depth + 1, max_depth)
            if result:
                return result
        else:
            try:
                with open(item["path"], "r", encoding="utf-8") as f:
                    content = f.read()
            except Exception:
                continue

            check = check_found(question, item["name"], content)
            path_taken.append({"name": item["name"], "type": "파일", "found": check["found"]})

            if check["found"]:
                rel = os.path.relpath(item["path"], storage_base).replace("\\", "/")
                rel = rel[:-4] if rel.endswith(".txt") else rel
                answer = generate_answer(question, rel, check["relevant_sections"], history)
                return {
                    "answer": answer,
                    "source": rel,
                    "relevant_sections": check["relevant_sections"],
                    "path_taken": path_taken,
                    "found": True
                }

    return None


def run_query(question: str, history: list, admin_id: int) -> dict:
    storage = _storage(admin_id)
    path_taken = []

    if history:
        last = history[-1]
        if last.get("role") == "assistant" and last.get("source"):
            need = decide_research(question, last["content"], last["source"])
            if not need:
                source = last["source"]
                try:
                    file_path = os.path.join(storage, source.replace("/", os.sep) + ".txt")
                    if os.path.exists(file_path):
                        with open(file_path, "r", encoding="utf-8") as f:
                            content = f.read()
                        check = check_found(question, os.path.basename(source), content)
                        if check["found"]:
                            answer = generate_answer(question, source,
                                                     check["relevant_sections"], history)
                            return {
                                "answer": answer,
                                "source": source,
                                "relevant_sections": check["relevant_sections"],
                                "path_taken": [],
                                "found": True
                            }
                except Exception as ex:
                    print(f"Error processing follow-up: {ex}")

    result = search_dir(question, history, storage, storage, path_taken)
    if result:
        return result

    return {
        "answer": generate_fallback(path_taken),
        "source": None,
        "relevant_sections": [],
        "path_taken": path_taken,
        "found": False
    }
