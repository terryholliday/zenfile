"""Utility for generating a Project DNA brief from local files using OpenAI's Responses API.

This module avoids the deprecated `ChatCompletion` interface and uses the modern
`client.responses.create` method instead.
"""
from __future__ import annotations

from typing import Iterable, TypedDict

from openai import OpenAI


class FileData(TypedDict):
    """Metadata describing a project file to include in the DNA brief."""

    name: str
    date: str
    content: str


def build_payload(folder_name: str, files: Iterable[FileData]) -> str:
    """Return the formatted payload that gets sent to the model."""

    sections = [f"I need a Project DNA Brief for: {folder_name}\n"]
    for f in files:
        excerpt = f["content"][:1000]
        sections.append(
            "---\n[FILE]\n"
            f"Name: {f['name']}\n"
            f"Date: {f['date']}\n"
            f"Excerpt: {excerpt}\n\n"
        )

    return "".join(sections)


def generate_project_dna(
    folder_name: str,
    files_data: Iterable[FileData],
    system_prompt_text: str,
    *,
    model: str = "gpt-4.1-mini",
    temperature: float = 0.3,
) -> str:
    """Generate a markdown Project DNA brief from the provided file metadata.

    Example
    -------
    >>> generate_project_dna(
    ...   "Budget Reports",
    ...   [{"name": "budget.xlsx", "date": "2025-12-01", "content": "..."}],
    ...   "You are an expert project analyst",
    ... )
    """

    client = OpenAI()
    data_payload = build_payload(folder_name, files_data)

    response = client.responses.create(
        model=model,
        input=[
            {"role": "system", "content": system_prompt_text},
            {"role": "user", "content": data_payload},
        ],
        temperature=temperature,
    )

    message = response.output[0].content[0].text
    return message
