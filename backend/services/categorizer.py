import os
import json
import re
from services.gemini_client import call_gemini_json
from services.file_parser import parse_first_page, get_chunks


def _storage(admin_id: int) -> str:
    return os.path.join("storage", str(admin_id))


def safe_name(name: str) -> str:
    return re.sub(r'[/\\:*?"<>|]', '_', name).strip()


def _normalize_tree(data: list) -> list:
    """구 형식(sub_categories)을 새 트리 형식(children)으로 변환"""
    result = []
    for item in data:
        if "sub_categories" in item:
            result.append({
                "name": item["name"],
                "children": [{"name": s, "children": []} for s in item.get("sub_categories", [])]
            })
        else:
            children = item.get("children", [])
            result.append({
                "name": item["name"],
                "children": _normalize_tree(children) if children else []
            })
    return result


def get_leaf_paths(tree: list, prefix: str = "") -> list:
    """트리에서 모든 리프 파일 경로 목록 반환 (상대경로/파일명.txt)"""
    paths = []
    for node in tree:
        name = safe_name(node["name"])
        path = (prefix + "/" + name) if prefix else name
        children = node.get("children", [])
        if children:
            paths.extend(get_leaf_paths(children, path))
        else:
            paths.append(path + ".txt")
    return paths


def propose_categories(uploaded_files: list) -> list:
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
이 문서들을 분류하기 위한 디렉토리 트리 구조를 제안해줘.
내용이 단순하면 1~2단계, 복잡하면 3~4단계까지 만들어도 돼.
children이 비어있는 노드가 실제 파일(리프)이 되고, 나머지는 폴더야.

{nl.join(summaries)}

다음 JSON 형식으로만 응답해. 다른 텍스트는 절대 포함하지 마:
{{
  "tree": [
    {{
      "name": "폴더명",
      "children": [
        {{
          "name": "하위폴더 또는 파일명",
          "children": []
        }}
      ]
    }}
  ]
}}"""

    try:
        result = call_gemini_json(prompt)
        return result.get("tree", [])
    except Exception as e:
        print(f"Error proposing categories: {e}")
        return []


def save_categories(tree: list, admin_id: int):
    """트리 구조에 따라 폴더/파일 생성 — 항상 초기화"""
    storage = _storage(admin_id)
    os.makedirs(storage, exist_ok=True)

    with open(os.path.join(storage, "categories.json"), "w", encoding="utf-8") as f:
        json.dump({"tree": tree}, f, ensure_ascii=False, indent=2)

    def create_node(node, parent_path):
        name = safe_name(node["name"])
        children = node.get("children", [])
        if children:
            folder_path = os.path.join(parent_path, name)
            os.makedirs(folder_path, exist_ok=True)
            for child in children:
                create_node(child, folder_path)
        else:
            with open(os.path.join(parent_path, name + ".txt"), "w", encoding="utf-8") as f:
                pass

    for node in tree:
        create_node(node, storage)


def process_document(file_path: str, tree: list, admin_id: int):
    if not os.path.exists(file_path):
        return

    storage = _storage(admin_id)
    leaf_paths = get_leaf_paths(tree)
    if not leaf_paths:
        return

    chunks = get_chunks(file_path)
    source_name = os.path.basename(file_path)
    leaf_list = "\n".join([f"{i+1}. {p}" for i, p in enumerate(leaf_paths)])

    for chunk in chunks:
        if not chunk.strip():
            continue

        prompt = f"""다음 텍스트에서 아래 각 경로에 해당하는 내용을 추출해줘.
해당 내용이 없으면 빈 문자열로 남겨줘.
조항 번호, 항목 번호, 원본 구조를 그대로 유지해서 추출해.
설명이나 다른 텍스트는 절대 추가하지 마.

경로 목록:
{leaf_list}

[텍스트]
{chunk[:3000]}

JSON으로만 응답:
{{"extractions": [{{"path": "경로", "content": "추출내용"}}]}}"""

        try:
            result = call_gemini_json(prompt)
            for item in result.get("extractions", []):
                rel_path = item.get("path", "").strip()
                content = item.get("content", "").strip()

                if not content or content == "빈 문자열" or len(content) < 5:
                    continue
                if content.startswith("에러가 발생했습니다:"):
                    continue

                full_path = os.path.join(storage, rel_path.replace("/", os.sep))
                if os.path.exists(full_path):
                    with open(full_path, "a", encoding="utf-8") as f:
                        f.write(f"\n\n--- 출처: {source_name} ---\n")
                        f.write(content)
        except Exception as e:
            print(f"Error processing chunk from {source_name}: {e}")


def get_categories(admin_id: int) -> list:
    path = os.path.join(_storage(admin_id), "categories.json")
    if not os.path.exists(path):
        return []
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        raw = data.get("tree", data.get("categories", []))
        return _normalize_tree(raw)
    except Exception as e:
        print(f"Error loading categories.json: {e}")
        return []
