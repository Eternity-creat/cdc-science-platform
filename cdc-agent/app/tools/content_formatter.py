import re
from typing import List


class ContentFormatter:

    @staticmethod
    def format_outline(outline: str) -> str:
        lines = outline.strip().split("\n")
        formatted_lines = []
        for line in lines:
            line = line.strip()
            if not line:
                continue
            if re.match(r"^[一二三四五六七八九十]+[、.．]", line):
                formatted_lines.append(line)
            elif re.match(r"^\d+[.．]", line):
                formatted_lines.append("  " + line)
            else:
                formatted_lines.append(line)
        return "\n".join(formatted_lines)

    @staticmethod
    def format_draft(draft: str, word_count: int = None) -> str:
        draft = draft.strip()
        if word_count:
            current_count = len(draft.replace("\n", "").replace(" ", ""))
            if abs(current_count - word_count) > word_count * 0.2:
                draft += f"\n\n（约{current_count}字）"
        return draft

    @staticmethod
    def extract_sections(content: str) -> List[dict]:
        sections = []
        current_section = None
        current_content = []

        for line in content.split("\n"):
            line = line.strip()
            if not line:
                continue
            if re.match(r"^[一二三四五六七八九十]+[、.．]", line):
                if current_section:
                    sections.append({
                        "title": current_section,
                        "content": "\n".join(current_content)
                    })
                current_section = line
                current_content = []
            else:
                current_content.append(line)

        if current_section:
            sections.append({
                "title": current_section,
                "content": "\n".join(current_content)
            })

        return sections

    @staticmethod
    def merge_outline_with_content(outline: str, content: str) -> str:
        sections = ContentFormatter.extract_sections(content)
        result = []
        for section in sections:
            result.append(section["title"])
            result.append(section["content"])
            result.append("")
        return "\n".join(result)
