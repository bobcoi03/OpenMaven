"""Web page fetching — extract clean text from URLs."""



def fetch_url(url: str) -> tuple[str, str]:
    """Fetch a URL and return (html_content, title).

    Uses trafilatura for content extraction, falls back to requests + basic parsing.
    """
    try:
        return _fetch_with_trafilatura(url)
    except Exception:
        return _fetch_fallback(url)


def _fetch_with_trafilatura(url: str) -> tuple[str, str]:
    """Use trafilatura for high-quality text extraction."""
    import trafilatura

    downloaded = trafilatura.fetch_url(url)
    if not downloaded:
        raise ValueError(f"Failed to download: {url}")

    text = trafilatura.extract(downloaded, include_tables=True) or ""
    metadata = trafilatura.extract_metadata(downloaded)
    title = metadata.title if metadata and metadata.title else url

    return text, title


def _fetch_fallback(url: str) -> tuple[str, str]:
    """Simple fallback: requests + basic HTML tag stripping."""
    import re

    import requests

    resp = requests.get(url, timeout=15, headers={"User-Agent": "OpenMaven/0.1"})
    resp.raise_for_status()
    html = resp.text

    # Extract title
    title_match = re.search(r"<title[^>]*>(.*?)</title>", html, re.IGNORECASE | re.DOTALL)
    title = title_match.group(1).strip() if title_match else url

    # Strip tags for plain text
    text = re.sub(r"<[^>]+>", " ", html)
    text = re.sub(r"\s+", " ", text).strip()

    return text, title
