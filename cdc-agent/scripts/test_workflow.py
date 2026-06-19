import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import asyncio
import json
import argparse
from pathlib import Path
from app.models.schemas import AgentRequest
from app.skills.registry import SkillRegistry
from app.skills.flow.outline_skill import OutlineGenerateSkill
from app.skills.flow.fusion_skill import FusionGenerateSkill
from loguru import logger


def load_case(case_file: str) -> dict:
    with open(case_file, 'r', encoding='utf-8') as f:
        return json.load(f)


def case_to_request(case: dict) -> AgentRequest:
    return AgentRequest(
        article_id=case['article_id'],
        entity_name=case.get('entity_name'),
        population_name=case.get('population_name'),
        scene_name=case.get('scene_name'),
        template_name=case.get('template_name'),
        template_purpose=case.get('template_purpose'),
        template_tone=case.get('template_tone'),
        template_outline=case.get('template_outline'),
        word_count=case.get('word_count', 800),
        step=case.get('step', 'outline'),
        mode=case.get('mode', 1),
        user_text=case.get('user_text', ''),
        wiki_segments=case.get('wiki_segments', []),
        must_include=case.get('must_include', []),
        must_not_say=case.get('must_not_say', [])
    )


async def test_outline_skill(request: AgentRequest):
    logger.info(f"测试大纲生成: {request.entity_name}")

    state = {
        "mode": request.mode,
        "step": request.step,
        "article_id": request.article_id,
        "entity_name": request.entity_name,
        "population_name": request.population_name,
        "scene_name": request.scene_name,
        "template_name": request.template_name,
        "template_purpose": request.template_purpose,
        "template_tone": request.template_tone,
        "template_outline": request.template_outline,
        "word_count": request.word_count or 800,
        "user_text": request.user_text or "",
        "entity_type": None,
        "parsed_entity_name": None,
        "parsed_population_name": None,
        "parsed_scene_name": None,
        "main_wiki_entity": None,
        "related_wiki_list": None,
        "top_k_segment_list": [{"content": s} for s in (request.wiki_segments or [])],
        "wiki_rule": {
            "must_include": request.must_include or [],
            "must_not_say": request.must_not_say or []
        },
        "match_template": {
            "template_name": request.template_name,
            "template_purpose": request.template_purpose,
            "template_tone": request.template_tone,
            "template_outline": request.template_outline
        },
        "article_outline": None,
        "initial_draft": None,
        "final_article": None,
        "check_report": None,
        "is_fact_ok": None,
        "rule_passed": None,
        "retry_times": 0,
        "confirm_template": False,
        "confirm_outline": False,
        "confirm_draft": False,
        "flow_trace": None,
        "wiki_segments": request.wiki_segments or [],
        "must_include": request.must_include or [],
        "must_not_say": request.must_not_say or []
    }

    wiki_match = SkillRegistry.get_skill("wiki_match")
    wiki_relation = SkillRegistry.get_skill("wiki_relation")
    vector_retrieve = SkillRegistry.get_skill("vector_retrieve")
    template_match = SkillRegistry.get_skill("template_match")
    outline = OutlineGenerateSkill()

    if request.mode == 2 and request.user_text:
        intent_parse = SkillRegistry.get_skill("intent_parse")
        state = await intent_parse.execute(state)
        state = await wiki_match.execute(state)
    else:
        state = await wiki_match.execute(state)

    state = await wiki_relation.execute(state)
    state = await vector_retrieve.execute(state)
    state = await template_match.execute(state)
    state = await outline.execute(state)

    result = state.get("article_outline", "")
    print(f"\n{'='*50}")
    print(f"大纲生成结果:")
    print(f"{'='*50}")
    print(result)
    print(f"\n长度: {len(result)} 字")

    return result


async def test_draft_skill(request: AgentRequest):
    logger.info(f"测试初稿生成: {request.entity_name}")

    state = {
        "mode": request.mode,
        "step": request.step,
        "article_id": request.article_id,
        "entity_name": request.entity_name,
        "population_name": request.population_name,
        "scene_name": request.scene_name,
        "template_name": request.template_name,
        "template_purpose": request.template_purpose,
        "template_tone": request.template_tone,
        "template_outline": request.template_outline or "1.概述\n2.正文\n3.结语",
        "word_count": request.word_count or 800,
        "user_text": request.user_text or "",
        "entity_type": None,
        "parsed_entity_name": None,
        "parsed_population_name": None,
        "parsed_scene_name": None,
        "main_wiki_entity": None,
        "related_wiki_list": None,
        "top_k_segment_list": [{"content": s} for s in (request.wiki_segments or [])],
        "wiki_rule": {
            "must_include": request.must_include or [],
            "must_not_say": request.must_not_say or []
        },
        "match_template": {
            "template_name": request.template_name,
            "template_purpose": request.template_purpose,
            "template_tone": request.template_tone,
            "template_outline": request.template_outline
        },
        "article_outline": request.template_outline,
        "initial_draft": None,
        "final_article": None,
        "check_report": None,
        "is_fact_ok": None,
        "rule_passed": None,
        "retry_times": 0,
        "confirm_template": False,
        "confirm_outline": False,
        "confirm_draft": False,
        "flow_trace": None,
        "wiki_segments": request.wiki_segments or [],
        "must_include": request.must_include or [],
        "must_not_say": request.must_not_say or []
    }

    fusion = FusionGenerateSkill()
    state = await fusion.execute(state)

    result = state.get("initial_draft", "")
    print(f"\n{'='*50}")
    print(f"初稿生成结果:")
    print(f"{'='*50}")
    print(result[:500] + "..." if len(result) > 500 else result)
    print(f"\n长度: {len(result)} 字")

    return result


async def test_single_case(case_file: str, step: str = None):
    case = load_case(case_file)
    request = case_to_request(case)

    if step:
        request.step = step

    print(f"\n测试案例: {case['case_name']}")
    print(f"描述: {case['description']}")
    print(f"参数: article_id={request.article_id}, step={request.step}, mode={request.mode}")

    if request.step == "outline":
        result = await test_outline_skill(request)
    elif request.step == "draft":
        result = await test_draft_skill(request)
    else:
        print(f"未知的step: {request.step}")
        return

    return result


async def test_intent_parse(case_file: str):
    case = load_case(case_file)
    request = case_to_request(case)

    print(f"\n测试意图解析: {case['case_name']}")
    print(f"用户文本: {request.user_text}")

    state = {
        "user_text": request.user_text,
        "mode": request.mode,
        "step": request.step,
        "article_id": request.article_id,
        "entity_name": None,
        "population_name": None,
        "scene_name": None,
        "template_name": None,
        "template_purpose": None,
        "template_tone": None,
        "template_outline": None,
        "word_count": 800,
        "entity_type": None,
        "parsed_entity_name": None,
        "parsed_population_name": None,
        "parsed_scene_name": None,
        "main_wiki_entity": None,
        "related_wiki_list": None,
        "top_k_segment_list": None,
        "wiki_rule": None,
        "match_template": None,
        "article_outline": None,
        "initial_draft": None,
        "final_article": None,
        "check_report": None,
        "is_fact_ok": None,
        "rule_passed": None,
        "retry_times": 0,
        "confirm_template": False,
        "confirm_outline": False,
        "confirm_draft": False,
        "flow_trace": None
    }

    intent_parse = SkillRegistry.get_skill("intent_parse")
    state = await intent_parse.execute(state)

    print(f"\n解析结果:")
    print(f"  entity_type: {state.get('entity_type')}")
    print(f"  entity_name: {state.get('parsed_entity_name')}")
    print(f"  population_name: {state.get('parsed_population_name')}")
    print(f"  scene_name: {state.get('parsed_scene_name')}")
    print(f"  word_count: {state.get('word_count')}")

    return state


async def main():
    parser = argparse.ArgumentParser(description="CDC Agent测试脚本")
    parser.add_argument('--mode', choices=['single', 'outline', 'draft', 'intent', 'all'],
                        default='single', help='测试模式')
    parser.add_argument('--case_file', default='scripts/cases/hpv_vaccine.json',
                        help='测试案例文件路径')
    parser.add_argument('--step', choices=['outline', 'draft'],
                        help='指定生成步骤')

    args = parser.parse_args()

    cases_dir = Path(__file__).parent / "cases"

    if args.mode == 'single':
        case_path = args.case_file
        if not os.path.isabs(case_path):
            case_path = os.path.join(os.path.dirname(__file__), case_path)
        await test_single_case(case_path, args.step)

    elif args.mode == 'outline':
        case_path = os.path.join(os.path.dirname(__file__), args.case_file)
        await test_single_case(case_path, 'outline')

    elif args.mode == 'draft':
        case_path = os.path.join(os.path.dirname(__file__), args.case_file)
        await test_single_case(case_path, 'draft')

    elif args.mode == 'intent':
        case_path = os.path.join(os.path.dirname(__file__), args.case_file)
        await test_intent_parse(case_path)

    elif args.mode == 'all':
        for case_file in cases_dir.glob("*.json"):
            await test_single_case(str(case_file))
            await asyncio.sleep(1)


if __name__ == "__main__":
    asyncio.run(main())
