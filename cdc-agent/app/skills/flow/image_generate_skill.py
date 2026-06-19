import asyncio
import base64
import os
import time
from pathlib import Path
from typing import Dict, Any, List, Optional
from app.skills.base import BaseSkill, SkillMetadata
from app.core.config import settings
from loguru import logger


class ImageGenerateSkill(BaseSkill):
    """
    配图生成 Skill
    
    用途: 根据文章段落内容生成配图。
    模型配置从 cdc_llm_config 表读取（config_type=image_generation），前端可管理。
    未配置时回退到 .env 中的 SENSENOVA_API_KEY / SENSENOVA_BASE_URL。
    生成的图片从远程 API 下载到本地 uploads/ 目录，返回本地可访问路径。
    
    输入: article_sections (段落列表), entity_name, max_images
    输出: generated_images (图片列表 [{section_index, prompt, file_path, image_key}])
    """
    
    @property
    def name(self) -> str:
        return "image_generate"
    
    @property
    def metadata(self) -> SkillMetadata:
        return {
            "description": "根据文章段落内容生成配图（模型通过前端 LLM 配置管理）",
            "input_fields": ["article_sections", "entity_name", "template_tone", "max_images"],
            "output_fields": ["generated_images"],
            "category": "image",
            "llm_config_type": "image_generation"
        }
    
    async def execute(self, state: Dict[str, Any]) -> Dict[str, Any]:
        new_state = {**state}
        
        sections = state.get("article_sections", [])
        entity_name = state.get("entity_name", "")
        max_images = state.get("max_images", 1)  # 默认1张，公众号推文简短
        
        if not sections:
            logger.info("ImageGenerateSkill: 无段落需要配图，跳过")
            new_state["generated_images"] = []
            return new_state
        
        # 确保本地上传目录存在
        upload_dir = self._get_upload_dir()
        
        generated_images = []
        generated_count = 0
        
        for i, section in enumerate(sections):
            # 达到上限后停止
            if generated_count >= max_images:
                logger.info(f"ImageGenerateSkill: 已达到 max_images={max_images} 上限，停止生成")
                break
            
            if not section.get("needs_image", False):
                continue
            
            section_title = section.get("title", "")
            section_content = section.get("content", "")
            
            # 构建图片生成 prompt
            prompt = self._build_image_prompt(
                entity_name=entity_name,
                section_title=section_title,
                section_content=section_content[:200]  # 限制长度
            )
            
            try:
                image_result = await self._generate_image(prompt, i)
                if image_result:
                    remote_url = image_result.get("url", "")
                    # 下载图片到本地
                    local_path = await self._download_image(remote_url, upload_dir, i)
                    if local_path:
                        generated_images.append({
                            "section_index": section.get("index", i),
                            "section_title": section_title,
                            "prompt": prompt,
                            "file_path": local_path,       # 本地可访问路径
                            "remote_url": remote_url,      # 原始远程 URL（备份）
                            "image_key": image_result.get("key", f"img_{i:03d}"),
                            "width": image_result.get("width", 1024),
                            "height": image_result.get("height", 768),
                        })
                        generated_count += 1
                        logger.info(f"ImageGenerateSkill: 段落 {i} 配图已下载到本地: {local_path}")
                    else:
                        logger.warning(f"ImageGenerateSkill: 段落 {i} 图片下载失败，跳过")
            except Exception as e:
                logger.error(f"ImageGenerateSkill: 段落 {i} 配图生成失败: {e}")
                continue
        
        new_state["generated_images"] = generated_images
        logger.info(f"ImageGenerateSkill: 共生成 {len(generated_images)} 张配图（上限 {max_images}）")
        return new_state
    
    def _get_upload_dir(self) -> Path:
        """获取本地图片上传目录，不存在则创建"""
        # 相对于 cdc-agent 项目根目录
        project_root = Path(__file__).resolve().parent.parent.parent.parent  # cdc-agent/
        upload_dir = project_root / settings.UPLOAD_DIR / "images"
        upload_dir.mkdir(parents=True, exist_ok=True)
        return upload_dir
    
    def _build_image_prompt(self, entity_name: str, section_title: str, section_content: str) -> str:
        """构建科学、专业的配图生成 prompt"""
        return (
            f"为健康科普文章生成一张配图。\n"
            f"主题：{entity_name}\n"
            f"段落标题：{section_title}\n"
            f"段落内容：{section_content}\n"
            f"要求：专业医学插图风格，色彩柔和温暖，适合大众阅读，"
            f"不包含文字，清晰简洁，健康科普风格"
        )
    
    async def _download_image(self, url: str, upload_dir: Path, index: int) -> Optional[str]:
        """
        从远程 URL 下载图片并保存到本地。
        返回前端可访问的 URL 路径（如 /uploads/images/xxxx.jpg），失败返回 None。
        """
        import httpx
        
        if not url:
            return None
        
        try:
            # 生成本地文件名：时间戳 + 段落序号
            timestamp = int(time.time() * 1000)
            filename = f"img_{timestamp}_{index:03d}.jpg"
            local_file = upload_dir / filename
            
            async with httpx.AsyncClient(timeout=60, follow_redirects=True) as client:
                response = await client.get(url)
                if response.status_code != 200:
                    logger.error(f"图片下载失败: HTTP {response.status_code} for {url}")
                    return None
                
                # 写入本地文件
                local_file.write_bytes(response.content)
                logger.debug(f"图片已保存: {local_file} ({len(response.content)} bytes)")
                
                # 返回前端可访问的路径
                return f"/uploads/images/{filename}"
                
        except Exception as e:
            logger.error(f"图片下载异常: {e}")
            return None
    
    async def _generate_image(self, prompt: str, index: int) -> Optional[Dict]:
        """
        调用 qwen-image-2.0 文生图 API（MaaS 多模态接口，同步模式）。
        
        MaaS 工作空间不支持异步调用，直接 POST 等待结果返回。
        图片生成耗时较长，超时设为 180 秒。
        """
        import httpx

        # 从 cdc_llm_config 读取 image_generation 配置
        model_name = "qwen-image-2.0-pro"
        api_key = ""
        base_url = ""

        try:
            from app.core.llm_pool import get_model_config
            config = get_model_config("image_generation")
            model_name = config["model_name"] or model_name
            api_key = config["api_key"] or ""
            base_url = config["base_url"] or ""
        except Exception as e:
            logger.debug(f"ImageGenerateSkill: 配置系统不可用: {e}")
        
        if not api_key:
            logger.warning("ImageGenerateSkill: API Key 未配置，跳过图片生成")
            return None
        
        if not base_url:
            logger.warning("ImageGenerateSkill: Base URL 未配置（图片生成需要 MaaS 专属 URL），跳过")
            return None
        
        base_url = base_url.rstrip("/")
        
        # MaaS 多模态生成端点（同步）
        generate_url = f"{base_url}/services/aigc/multimodal-generation/generation"
        
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        
        # qwen-image-2.0 使用多模态消息格式
        payload = {
            "model": model_name,
            "input": {
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {"text": prompt}
                        ]
                    }
                ]
            },
            "parameters": {
                "n": 1,
            }
        }
        
        logger.info(f"ImageGenerateSkill: 开始同步生成图片, model={model_name}")
        
        # 同步调用，超时 180 秒（图片生成较慢）
        async with httpx.AsyncClient(timeout=180) as client:
            try:
                response = await client.post(generate_url, json=payload, headers=headers)
            except httpx.TimeoutException:
                logger.error("图片生成 API 超时 (180s)")
                return None
            
            if response.status_code != 200:
                logger.error(f"图片生成 API 错误: HTTP {response.status_code} - {response.text[:500]}")
                return None
            
            data = response.json()
            output = data.get("output", {})
            
            # 多模态响应格式：output.choices[0].message.content[].image
            choices = output.get("choices", [])
            if choices:
                message = choices[0].get("message", {})
                content_list = message.get("content", [])
                for item in content_list:
                    if "image" in item:
                        img_url = item["image"]
                        logger.info(f"ImageGenerateSkill: 图片生成成功")
                        return {
                            "url": img_url,
                            "key": f"img_{index:03d}",
                            "width": 1024,
                            "height": 768,
                        }
            
            # 兜底：results 格式
            results = output.get("results", [])
            if results:
                img_url = results[0].get("url", "")
                if img_url:
                    return {"url": img_url, "key": f"img_{index:03d}", "width": 1024, "height": 768}
            
            logger.warning(f"图片生成完成但未找到图片 URL, keys={list(output.keys())}")
            return None
