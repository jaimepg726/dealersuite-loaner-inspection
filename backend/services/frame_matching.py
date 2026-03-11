"""DealerSuite — AI Frame Matching Service
Finds the walkaround video frame most visually similar to a damage photo.

Primary:  OpenAI CLIP embeddings via open_clip_torch (cosine similarity)
Fallback: PIL colour-histogram correlation (no GPU / heavy deps needed)

The CLIP path is used when open_clip_torch + torch are installed.
The histogram path is always available and runs at import time.
"""

import io
import logging
import math

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# CLIP — optional heavy dependency
# ---------------------------------------------------------------------------
_CLIP_AVAILABLE = False
_clip_model = None
_clip_preprocess = None

try:
    import torch
    import open_clip

    _clip_model, _clip_preprocess, _ = open_clip.create_model_and_transforms(
        "ViT-B-32", pretrained="openai"
    )
    _clip_model.eval()
    _CLIP_AVAILABLE = True
    logger.info("CLIP model loaded for AI frame matching (ViT-B-32/openai)")
except Exception as _clip_load_err:
    logger.info(
        "CLIP not available — using histogram fallback for frame matching. "
        "Install open_clip_torch to enable AI-powered matching. Error: %s",
        _clip_load_err,
    )


# ---------------------------------------------------------------------------
# Image helpers
# ---------------------------------------------------------------------------

def _pil_from_bytes(data: bytes):
    """Open image bytes as an RGB PIL Image."""
    from PIL import Image  # always available (pillow in requirements)
    return Image.open(io.BytesIO(data)).convert("RGB")


# ---------------------------------------------------------------------------
# Histogram similarity (CPU-only fallback)
# ---------------------------------------------------------------------------

def _histogram_similarity(img1, img2) -> float:
    """
    Normalised dot-product similarity between 256-bin RGB histograms.
    Returns a float in [0, 1] — higher means more visually similar.
    """
    h1 = img1.resize((64, 64)).histogram()
    h2 = img2.resize((64, 64)).histogram()
    dot = sum(a * b for a, b in zip(h1, h2))
    n1 = math.sqrt(sum(a * a for a in h1))
    n2 = math.sqrt(sum(b * b for b in h2))
    return dot / (n1 * n2 + 1e-9)


# ---------------------------------------------------------------------------
# CLIP embedding
# ---------------------------------------------------------------------------

def _clip_embeddings(images: list) -> list:
    """
    Generate L2-normalised CLIP image embeddings.
    Returns a list of 1-D numpy arrays (one per image).
    """
    import torch
    import numpy as np

    tensors = torch.stack([_clip_preprocess(img) for img in images])
    with torch.no_grad():
        feats = _clip_model.encode_image(tensors)
        feats = feats / feats.norm(dim=-1, keepdim=True)
    return list(feats.cpu().numpy())


def _cosine(a, b) -> float:
    """Cosine similarity between two 1-D numpy vectors."""
    import numpy as np
    return float(np.dot(a, b))


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def find_best_matching_frame(
    damage_photo_bytes: bytes,
    frame_bytes_list: list[bytes],
) -> int | None:
    """
    Compare a damage photo against a list of walkaround video frames.

    Returns the **index** of the most visually similar frame,
    or None if the frame list is empty or all frames fail to decode.

    Uses CLIP embeddings when open_clip_torch is installed;
    falls back to colour-histogram comparison otherwise.
    """
    if not frame_bytes_list:
        return None

    try:
        damage_img = _pil_from_bytes(damage_photo_bytes)
    except Exception as exc:
        logger.error("Failed to decode damage photo: %s", exc)
        return None

    frame_imgs = []
    valid_indices = []
    for i, fb in enumerate(frame_bytes_list):
        try:
            frame_imgs.append(_pil_from_bytes(fb))
            valid_indices.append(i)
        except Exception:
            logger.warning("Skipped undecodable frame at index %d", i)

    if not frame_imgs:
        return None

    # ── CLIP path ──────────────────────────────────────────────────────────
    if _CLIP_AVAILABLE:
        try:
            all_imgs = [damage_img] + frame_imgs
            embeds   = _clip_embeddings(all_imgs)
            dmg_emb  = embeds[0]
            frame_embs = embeds[1:]
            sims = [_cosine(dmg_emb, fe) for fe in frame_embs]
            best_local = sims.index(max(sims))
            logger.debug("CLIP best match: frame %d (sim=%.4f)", valid_indices[best_local], sims[best_local])
            return valid_indices[best_local]
        except Exception as exc:
            logger.warning("CLIP matching failed, falling back to histogram: %s", exc)

    # ── Histogram fallback ─────────────────────────────────────────────────
    sims = [_histogram_similarity(damage_img, fi) for fi in frame_imgs]
    best_local = sims.index(max(sims))
    logger.debug("Histogram best match: frame %d (sim=%.4f)", valid_indices[best_local], sims[best_local])
    return valid_indices[best_local]
